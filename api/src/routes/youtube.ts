import { Hono } from 'hono'
import { requireUser } from '../auth'
import { createJob } from '../lib/jobs'
import { wakeAgent } from '../lib/wake'
import { ytmSearch, ytmSuggest } from '../lib/ytm'
import type { AppEnv } from '../types'
import { audit, getSetting } from '../util'

export const youtube = new Hono<AppEnv>()
youtube.use('*', requireUser)

// YouTube Data API v3: search.list costs 100 quota units, videos.list / playlistItems.list / playlists.list cost 1,
// against 10,000 free units a day. Everything is cached for a day, and users and the whole app have daily caps.
const SEARCH_PER_USER_DAILY = 20
const SEARCH_GLOBAL_DAILY = 90
const LOOKUP_PER_USER_DAILY = 40 // playlist previews and pasted video links (cheap, 1-3 units each)
const IMPORTS_PER_USER_DAILY = 2

const CATEGORIES: Record<string, string> = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals', '17': 'Sports', '19': 'Travel & Events',
  '20': 'Gaming', '22': 'People & Blogs', '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style',
  '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism',
}

interface Result {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  category: string
  thumbnail: string
}

interface PlaylistData {
  title: string
  channel: string
  total: number
  items: Result[]
}

export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

class QuotaError extends Error {}
class NotFoundError extends Error {}

async function ytGet<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  url.search = new URLSearchParams({ ...params, key }).toString()
  const res = await fetch(url)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } }
    if (body.error?.errors?.some((e) => e.reason === 'quotaExceeded' || e.reason === 'rateLimitExceeded')) throw new QuotaError()
    if (res.status === 404) throw new NotFoundError()
    throw new Error(`youtube ${path} ${res.status}`)
  }
  return (await res.json()) as T
}

/** Title, channel, real duration and category for up to any number of video ids (live broadcasts are dropped). */
async function fetchVideoDetails(key: string, ids: string[]): Promise<Result[]> {
  const byId = new Map<string, Result>()
  for (let i = 0; i < ids.length; i += 50) {
    const data = await ytGet<{
      items?: {
        id: string
        snippet: { title: string; channelTitle: string; categoryId?: string; liveBroadcastContent?: string; thumbnails?: Record<string, { url: string }> }
        contentDetails: { duration: string }
      }[]
    }>('videos', { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(',') }, key)
    for (const v of data.items ?? []) {
      if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') continue
      const t = v.snippet.thumbnails ?? {}
      byId.set(v.id, {
        youtubeId: v.id,
        title: decode(v.snippet.title),
        channel: decode(v.snippet.channelTitle),
        durationSec: parseIsoDuration(v.contentDetails.duration),
        category: CATEGORIES[v.snippet.categoryId ?? ''] ?? 'Other',
        thumbnail: (t.medium ?? t.high ?? t.default)?.url ?? '',
      })
    }
  }
  return ids.map((id) => byId.get(id)).filter((r): r is Result => !!r)
}

async function fetchSearch(key: string, q: string): Promise<Result[]> {
  const sdata = await ytGet<{ items?: { id?: { videoId?: string } }[] }>('search', { part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'none', q }, key)
  const ids = (sdata.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x)
  return ids.length ? fetchVideoDetails(key, ids) : []
}

async function fetchPlaylist(key: string, listId: string, max: number): Promise<PlaylistData> {
  const meta = await ytGet<{ items?: { snippet: { title: string; channelTitle: string } }[] }>('playlists', { part: 'snippet', id: listId }, key)
  const info = meta.items?.[0]
  if (!info) throw new NotFoundError()

  const ids: string[] = []
  let total = 0
  let pageToken = ''
  while (ids.length < max) {
    const page = await ytGet<{ nextPageToken?: string; pageInfo?: { totalResults?: number }; items?: { contentDetails?: { videoId?: string } }[] }>(
      'playlistItems',
      { part: 'contentDetails', playlistId: listId, maxResults: '50', ...(pageToken ? { pageToken } : {}) },
      key,
    )
    total = page.pageInfo?.totalResults ?? total
    for (const it of page.items ?? []) if (it.contentDetails?.videoId && !ids.includes(it.contentDetails.videoId)) ids.push(it.contentDetails.videoId)
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }
  return { title: decode(info.snippet.title), channel: decode(info.snippet.channelTitle), total, items: await fetchVideoDetails(key, ids.slice(0, max)) }
}

async function cached<T>(db: D1Database, cacheKey: string, load: () => Promise<T>): Promise<T> {
  const ttl = cacheKey.startsWith('ytm:') ? '-6 hours' : '-1 day'
  const hit = await db.prepare(`SELECT results FROM yt_cache WHERE q = ? AND created_at > datetime('now', '${ttl}')`).bind(cacheKey).first<{ results: string }>()
  if (hit) return JSON.parse(hit.results) as T
  const fresh = await load()
  await db
    .prepare("INSERT INTO yt_cache (q, results, created_at) VALUES (?, ?, datetime('now')) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = datetime('now')")
    .bind(cacheKey, JSON.stringify(fresh))
    .run()
  return fresh
}

/** Marks results that are already in the library or already requested, so the UI never offers a pointless download. */
export async function annotate(db: D1Database, results: Result[]) {
  const ids = results.map((r) => r.youtubeId)
  if (!ids.length) return []
  const marks = ids.map(() => '?').join(',')
  const [have, active] = await Promise.all([
    db.prepare(`SELECT youtube_id AS yid, id FROM songs WHERE youtube_id IN (${marks})`).bind(...ids).all<{ yid: string; id: string }>(),
    db
      .prepare(`SELECT youtube_id AS yid, status FROM download_jobs WHERE youtube_id IN (${marks}) AND status IN ('pending_approval','queued','downloading','uploading')`)
      .bind(...ids)
      .all<{ yid: string; status: string }>(),
  ])
  const haveMap = new Map(have.results.map((r) => [r.yid, r.id]))
  const activeMap = new Map(active.results.map((r) => [r.yid, r.status]))
  return results.map((r) => ({ ...r, songId: haveMap.get(r.youtubeId) ?? null, requestStatus: activeMap.get(r.youtubeId) ?? null }))
}

function failure(c: { json: (b: unknown, s: 429 | 502 | 404) => Response }, e: unknown): Response {
  if (e instanceof QuotaError) return c.json({ error: 'search_quota' }, 429)
  if (e instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
  console.error(e)
  return c.json({ error: 'youtube_error' }, 502)
}

// ---------- Search ----------
youtube.get('/search', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)

  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return c.json({ error: 'query_too_short' }, 400)
  const cacheKey = q.toLowerCase()
  const db = c.env.DB

  // Primary: YouTube Music's own API (no key, no quota). Fallback: the official Data API, which has a small daily budget.
  try {
    const results = await cached(db, `ytm:${cacheKey}`, () => ytmSearch(q))
    if (results.length) return c.json({ query: q, results: await annotate(db, results) })
  } catch (e) {
    console.error('ytm search failed', e)
  }

  if (!c.env.YOUTUBE_API_KEY) return c.json({ query: q, results: [] })
  const hit = await db.prepare("SELECT 1 AS ok FROM yt_cache WHERE q = ? AND created_at > datetime('now', '-1 day')").bind(cacheKey).first()
  if (!hit) {
    const [mine, all] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE user_id = ? AND q NOT LIKE 'pl:%' AND q NOT LIKE 'v:%' AND created_at >= date('now')").bind(user.id).first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE q NOT LIKE 'pl:%' AND q NOT LIKE 'v:%' AND created_at >= date('now')").first<{ n: number }>(),
    ])
    if ((mine?.n ?? 0) >= SEARCH_PER_USER_DAILY) return c.json({ error: 'search_limit', limit: SEARCH_PER_USER_DAILY }, 429)
    if ((all?.n ?? 0) >= SEARCH_GLOBAL_DAILY) return c.json({ error: 'search_quota' }, 429)
  }

  try {
    const results = await cached(db, cacheKey, () => fetchSearch(c.env.YOUTUBE_API_KEY, q))
    if (!hit) await db.prepare('INSERT INTO yt_searches (user_id, q) VALUES (?, ?)').bind(user.id, cacheKey).run()
    return c.json({ query: q, results: await annotate(db, results) })
  } catch (e) {
    return failure(c, e)
  }
})

// Type-ahead: finishes half-typed names, so people do not need the full title.
youtube.get('/suggest', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return c.json({ suggestions: [] })
  try {
    return c.json({ suggestions: await ytmSuggest(q) })
  } catch (e) {
    console.error('ytm suggest failed', e)
    return c.json({ suggestions: [] })
  }
})

/** Counts a cheap lookup (playlist preview or pasted video link) against the user's daily allowance. */
async function lookupAllowed(db: D1Database, userId: string, logKey: string): Promise<boolean> {
  const used = await db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE user_id = ? AND (q LIKE 'pl:%' OR q LIKE 'v:%') AND created_at >= date('now')").bind(userId).first<{ n: number }>()
  if ((used?.n ?? 0) >= LOOKUP_PER_USER_DAILY) return false
  await db.prepare('INSERT INTO yt_searches (user_id, q) VALUES (?, ?)').bind(userId, logKey).run()
  return true
}

// ---------- A pasted video link ----------
youtube.get('/video', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  if (!c.env.YOUTUBE_API_KEY) return c.json({ error: 'youtube_not_configured' }, 503)
  const id = c.req.query('id') ?? ''
  if (!/^[\w-]{11}$/.test(id)) return c.json({ error: 'invalid_request' }, 400)
  if (!(await lookupAllowed(c.env.DB, user.id, `v:${id}`))) return c.json({ error: 'search_limit', limit: LOOKUP_PER_USER_DAILY }, 429)

  try {
    const [one] = await fetchVideoDetails(c.env.YOUTUBE_API_KEY, [id])
    return c.json({ results: one ? await annotate(c.env.DB, [one]) : [] })
  } catch (e) {
    return failure(c, e)
  }
})

// ---------- Playlist preview ----------
youtube.get('/playlist', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  if (!c.env.YOUTUBE_API_KEY) return c.json({ error: 'youtube_not_configured' }, 503)
  const listId = c.req.query('list') ?? ''
  if (!/^[\w-]{10,64}$/.test(listId)) return c.json({ error: 'invalid_request' }, 400)

  const db = c.env.DB
  if (!(await lookupAllowed(db, user.id, `pl:${listId}`))) return c.json({ error: 'search_limit', limit: LOOKUP_PER_USER_DAILY }, 429)
  const max = await getSetting(db, 'max_playlist_import', 50)

  try {
    const data = await cached(db, `pl:${listId}:${max}`, () => fetchPlaylist(c.env.YOUTUBE_API_KEY, listId, max))
    return c.json({ listId, title: data.title, channel: data.channel, total: data.total, shown: data.items.length, max, items: await annotate(db, data.items) })
  } catch (e) {
    return failure(c, e)
  }
})

// ---------- Playlist import ----------
/**
 * Creates a Soundly playlist from the chosen songs of a YouTube playlist. Songs already in the library join it
 * immediately; the rest become download requests (approval rules as usual) and join the playlist when they arrive.
 * Metadata comes from YouTube again here, never from the client, so flags and durations cannot be forged.
 */
youtube.post('/import', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  if (!c.env.YOUTUBE_API_KEY) return c.json({ error: 'youtube_not_configured' }, 503)

  const body = await c.req.json<{ listId?: string; ids?: string[]; title?: string }>().catch(() => ({}) as { listId?: string; ids?: string[]; title?: string })
  const listId = body.listId ?? ''
  if (!/^[\w-]{10,64}$/.test(listId) || !Array.isArray(body.ids) || !body.ids.length) return c.json({ error: 'invalid_request' }, 400)

  const db = c.env.DB
  const today = await db.prepare("SELECT COUNT(*) AS n FROM playlist_imports WHERE user_id = ? AND created_at >= date('now')").bind(user.id).first<{ n: number }>()
  if ((today?.n ?? 0) >= IMPORTS_PER_USER_DAILY) return c.json({ error: 'import_limit', limit: IMPORTS_PER_USER_DAILY }, 429)

  const max = await getSetting(db, 'max_playlist_import', 50)
  const maxDuration = await getSetting(db, 'max_duration_sec', 1200)

  let data: PlaylistData
  try {
    data = await cached(db, `pl:${listId}:${max}`, () => fetchPlaylist(c.env.YOUTUBE_API_KEY, listId, max))
  } catch (e) {
    return failure(c, e)
  }

  const wanted = new Set(body.ids)
  const chosen = data.items.filter((i) => wanted.has(i.youtubeId)).slice(0, max)
  if (!chosen.length) return c.json({ error: 'nothing_selected' }, 400)

  const title = ((body.title ?? '').trim() || data.title).slice(0, 80)
  const playlistId = crypto.randomUUID()
  await db.prepare("INSERT INTO playlists (id, owner_id, title, description, hue, is_public) VALUES (?, ?, ?, 'Imported from YouTube', ?, 0)").bind(playlistId, user.id, title, Math.floor(Math.random() * 360)).run()

  let inLibrary = 0
  let queued = 0
  let pending = 0
  let alreadyRequested = 0
  let skipped = 0
  const statements: D1PreparedStatement[] = []

  for (let position = 0; position < chosen.length; position++) {
    const item = chosen[position]
    const have = await db.prepare('SELECT id FROM songs WHERE youtube_id = ?').bind(item.youtubeId).first<{ id: string }>()
    if (have) {
      statements.push(db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)').bind(playlistId, have.id, position))
      inLibrary++
      continue
    }
    const r = await createJob(db, user, { youtubeId: item.youtubeId, title: item.title, channel: item.channel, durationSec: item.durationSec, category: item.category }, { skipDailyLimit: true, maxDuration })
    if (!r.ok && r.error !== 'already_requested') {
      skipped++
      continue
    }
    statements.push(db.prepare('INSERT OR IGNORE INTO import_items (playlist_id, youtube_id, position) VALUES (?, ?, ?)').bind(playlistId, item.youtubeId, position))
    if (!r.ok) alreadyRequested++
    else if (r.status === 'pending_approval') pending++
    else queued++
  }

  statements.push(db.prepare('INSERT INTO playlist_imports (id, user_id, playlist_id, list_id, title, songs) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, playlistId, listId, data.title, chosen.length))
  await db.batch(statements)
  await audit(db, user.id, 'playlist.import', playlistId, { title: data.title, songs: chosen.length, inLibrary, queued, pending })
  if (queued) wakeAgent(c.env, c.executionCtx)

  return c.json({ playlistId, title, inLibrary, queued, pendingApproval: pending, alreadyRequested, skipped }, 201)
})
