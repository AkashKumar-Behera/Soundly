import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import { emit } from '../lib/live'
import type { AppEnv } from '../types'

export const lyrics = new Hono<AppEnv>()
lyrics.use('*', requireUser)

const UA = 'Soundly/1.0 (https://github.com/AkashKumar-Behera/Soundly)'
const NOT_FOUND_RECHECK_DAYS = 7

interface Lrclib {
  /** Set when the words match but the song length does not (a remix or live cut): shown unsynced with a note. */
  approx?: boolean
  trackName?: string
  artistName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

/** "Artist - Song (Official Audio)" -> { artist, track }, falling back to the uploader name. */
export function guessTrackArtist(title: string, artist: string | null): { track: string; artist: string } {
  const cleaned = title
    .replace(/\s*[\(\[](?:official|lyrics?|audio|video|music video|visuali[sz]er|hd|hq|4k|mv|remaster(?:ed)?|live)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*[|｜]\s*.*$/, '')
    .trim()
  const m = /^(.{1,80}?)\s+[-–—]\s+(.+)$/.exec(cleaned)
  const fallbackArtist = (artist ?? '').replace(/\s*-\s*Topic$/i, '').trim()
  return m ? { artist: m[1].trim(), track: m[2].trim() } : { artist: fallbackArtist, track: cleaned }
}

/** Parses LRC text into sorted { t (seconds), text } lines. A line may carry several timestamps. */
export function parseLrc(lrc: string): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) {
      const frac = s[3] ? Number(`0.${s[3]}`) : 0
      out.push({ t: Number(s[1]) * 60 + Number(s[2]) + frac, text })
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

async function lrclib(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://lrclib.net/api/${path}`)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`lrclib ${res.status}`)
  return res.json()
}

/** Best match for a song: exact lookup first, then searches. A result must be within a few seconds of the song length. */
async function findLyrics(song: { title: string; artist: string | null; album: string | null; duration: number | null }): Promise<Lrclib | null> {
  const g = guessTrackArtist(song.title, song.artist)
  const dur = song.duration ?? 0
  const ok = (r: Lrclib) => (r.syncedLyrics || r.plainLyrics || r.instrumental) && (!dur || !r.duration || Math.abs(r.duration - dur) <= 8)
  const score = (r: Lrclib) => (r.syncedLyrics ? 10 : 0) - (dur && r.duration ? Math.abs(r.duration - dur) : 0)
  const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')

  if (g.artist && g.track) {
    const exact = (await lrclib('get', { track_name: g.track, artist_name: g.artist, album_name: song.album ?? '', duration: dur ? String(dur) : '' })) as Lrclib | null
    if (exact && ok(exact)) return exact
  }

  const seen: Lrclib[] = []
  for (const q of [`${g.artist} ${g.track}`.trim(), song.title]) {
    if (!q) continue
    const list = ((await lrclib('search', { q })) as Lrclib[] | null) ?? []
    seen.push(...list)
    const best = list.filter(ok).sort((a, b) => score(b) - score(a))[0]
    if (best) return best
  }

  // Same song, different version (remix, live, extended): the words usually match even if the timing does not,
  // so offer the plain text, never the synced one, and say it may differ.
  const wanted = norm(g.track)
  const loose = wanted ? seen.find((r) => r.plainLyrics && r.trackName && norm(r.trackName) === wanted) : undefined
  return loose ? { ...loose, syncedLyrics: null, approx: true } : null
}

const MAX_TEXT = 20000

/** Pasted text is synced when most lines carry [mm:ss] stamps, otherwise plain. */
function fromText(text: string): { synced: string | null; plain: string } {
  const lines = text.split(/\r?\n/)
  const stamped = lines.filter((l) => /^\s*\[\d{1,3}:\d{2}/.test(l)).length
  if (stamped >= 3 && stamped >= lines.filter((l) => l.trim()).length * 0.6) {
    return { synced: text, plain: lines.map((l) => l.replace(/\[[^\]]*\]/g, '').trim()).join('\n') }
  }
  return { synced: null, plain: text }
}

const shapeText = (text: string, extra: Record<string, unknown> = {}) => {
  const { synced, plain } = fromText(text)
  return { found: true, instrumental: false, approx: false, synced: synced ? parseLrc(synced) : null, plain, ...extra }
}

async function publish(db: D1Database, songId: string, text: string) {
  const { synced, plain } = fromText(text)
  await db
    .prepare(
      `INSERT INTO lyrics (song_id, found, instrumental, synced, plain, source, fetched_at) VALUES (?, 1, 0, ?, ?, 'community', datetime('now'))
       ON CONFLICT(song_id) DO UPDATE SET found = 1, instrumental = 0, synced = excluded.synced, plain = excluded.plain, source = 'community', fetched_at = datetime('now')`,
    )
    .bind(songId, synced, plain)
    .run()
}

// Admin review queue for lyrics that trusted users pasted.
lyrics.get('/submissions/pending', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ls.id, ls.song_id AS songId, s.title, u.name AS userName, ls.text, ls.created_at AS createdAt
     FROM lyrics_submissions ls JOIN songs s ON s.id = ls.song_id JOIN users u ON u.id = ls.user_id
     WHERE ls.status = 'pending' ORDER BY ls.created_at`,
  ).all()
  return c.json({ submissions: results })
})

lyrics.post('/submissions/:id/:decision', requireAdmin, async (c) => {
  const decision = c.req.param('decision')
  if (decision !== 'approve' && decision !== 'reject') return c.json({ error: 'invalid_request' }, 400)
  const sub = await c.env.DB.prepare("SELECT song_id AS songId, text FROM lyrics_submissions WHERE id = ? AND status = 'pending'").bind(c.req.param('id')).first<{ songId: string; text: string }>()
  if (!sub) return c.json({ error: 'not_found' }, 404)
  if (decision === 'approve') await publish(c.env.DB, sub.songId, sub.text)
  await c.env.DB.prepare('UPDATE lyrics_submissions SET status = ? WHERE id = ?').bind(decision === 'approve' ? 'approved' : 'rejected', c.req.param('id')).run()
  emit(c.env, c.executionCtx, { type: 'hint', topic: 'lyrics' })
  return c.json({ ok: true })
})

// A trusted user's own lyrics for a song. They see it right away; an admin decides whether everyone does.
lyrics.put('/:songId/mine', async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted' && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  const id = c.req.param('songId')
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string })
  const text = (body.text ?? '').replace(/\r\n/g, '\n').trim()
  if (text.length < 10 || text.length > MAX_TEXT) return c.json({ error: 'invalid_request' }, 400)
  const song = await c.env.DB.prepare('SELECT 1 AS ok FROM songs WHERE id = ?').bind(id).first()
  if (!song) return c.json({ error: 'not_found' }, 404)

  const approved = user.role === 'admin'
  await c.env.DB.prepare(
    `INSERT INTO lyrics_submissions (id, song_id, user_id, text, status) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(song_id, user_id) DO UPDATE SET text = excluded.text, status = excluded.status, created_at = datetime('now')`,
  )
    .bind(crypto.randomUUID(), id, user.id, text, approved ? 'approved' : 'pending')
    .run()
  if (approved) await publish(c.env.DB, id, text)
  else emit(c.env, c.executionCtx, { type: 'hint', topic: 'lyrics' })
  return c.json(shapeText(text, { mine: true, pending: !approved }))
})

lyrics.delete('/:songId/mine', async (c) => {
  await c.env.DB.prepare('DELETE FROM lyrics_submissions WHERE song_id = ? AND user_id = ?').bind(c.req.param('songId'), c.get('user').id).run()
  return c.json({ ok: true })
})

lyrics.get('/:songId', async (c) => {
  const id = c.req.param('songId')
  const db = c.env.DB

  // A trusted user's own pending version wins for them until an admin decides.
  const mine = await db.prepare("SELECT text FROM lyrics_submissions WHERE song_id = ? AND user_id = ? AND status = 'pending'").bind(id, c.get('user').id).first<{ text: string }>()
  if (mine) return c.json(shapeText(mine.text, { mine: true, pending: true }))

  const cached = await db
    .prepare(`SELECT found, instrumental, synced, plain, source, fetched_at < datetime('now', '-${NOT_FOUND_RECHECK_DAYS} days') AS stale FROM lyrics WHERE song_id = ?`)
    .bind(id)
    .first<{ found: number; instrumental: number; synced: string | null; plain: string | null; source: string | null; stale: number }>()
  if (cached && (cached.found || cached.instrumental || !cached.stale)) {
    return c.json({ found: !!cached.found, instrumental: !!cached.instrumental, approx: cached.source === 'lrclib-approx', synced: cached.synced ? parseLrc(cached.synced) : null, plain: cached.plain })
  }

  const song = await db
    .prepare('SELECT s.title, a.name AS artist, s.album, s.duration_sec AS duration FROM songs s LEFT JOIN artists a ON a.id = s.artist_id WHERE s.id = ?')
    .bind(id)
    .first<{ title: string; artist: string | null; album: string | null; duration: number | null }>()
  if (!song) return c.json({ error: 'not_found' }, 404)

  let hit: Lrclib | null
  try {
    hit = await findLyrics(song)
  } catch (e) {
    console.error(e)
    return c.json({ error: 'lyrics_unavailable' }, 502) // do not cache a network hiccup as "no lyrics"
  }

  const found = !!(hit && (hit.syncedLyrics || hit.plainLyrics))
  await db
    .prepare(
      `INSERT INTO lyrics (song_id, found, instrumental, synced, plain, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(song_id) DO UPDATE SET found = excluded.found, instrumental = excluded.instrumental, synced = excluded.synced, plain = excluded.plain, source = excluded.source, fetched_at = datetime('now')`,
    )
    .bind(id, found ? 1 : 0, hit?.instrumental ? 1 : 0, hit?.syncedLyrics ?? null, hit?.plainLyrics ?? null, hit?.approx ? 'lrclib-approx' : 'lrclib')
    .run()

  return c.json({ found, instrumental: !!hit?.instrumental, approx: !!hit?.approx, synced: hit?.syncedLyrics ? parseLrc(hit.syncedLyrics) : null, plain: hit?.plainLyrics ?? null })
})
