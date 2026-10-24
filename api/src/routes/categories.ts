import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import { audit } from '../util'
import type { AppEnv } from '../types'
import { forget, memo } from '../util'
import { SONG_SELECT, shapeSong } from './songs'
import type { SongRow } from './songs'

const OTHER = 'Other'

interface Cat {
  genre: string | null
  label: string | null
  hue: number | null
  hidden: number
}

const hueOf = (label: string) => {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return h % 360
}

/** Genres as found, with their counts and any admin edits (label, colour, hidden). */
async function loadGenres(db: D1Database) {
  return memo('categories-raw', 2 * 60000, async () => {
    const [counts, edits] = await Promise.all([
      db.prepare('SELECT genre, COUNT(*) AS n FROM songs GROUP BY genre').all<{ genre: string | null; n: number }>(),
      db.prepare('SELECT genre, label, hue, hidden FROM categories').all<Cat>(),
    ])
    const byGenre = new Map(edits.results.map((e) => [e.genre, e]))
    return counts.results.map((r) => {
      const e = byGenre.get(r.genre ?? OTHER)
      return { genre: r.genre, count: r.n, label: e?.label || r.genre || OTHER, hue: e?.hue ?? null, hidden: !!e?.hidden }
    })
  }, { shared: true })
}

// ---------- For everyone: the categories to browse ----------
export const categories = new Hono<AppEnv>()
categories.use('*', requireUser)

categories.get('/', async (c) => {
  const genres = await loadGenres(c.env.DB)
  const merged = new Map<string, { label: string; count: number; hue: number }>()
  for (const g of genres) {
    if (g.hidden) continue
    const have = merged.get(g.label)
    if (have) have.count += g.count
    else merged.set(g.label, { label: g.label, count: g.count, hue: g.hue ?? hueOf(g.label) })
  }
  return c.json({ categories: [...merged.values()].sort((a, b) => (a.label === OTHER ? 1 : b.label === OTHER ? -1 : b.count - a.count)) })
})

categories.get('/:label/songs', async (c) => {
  const label = c.req.param('label')
  const genres = (await loadGenres(c.env.DB)).filter((g) => g.label === label && !g.hidden)
  if (!genres.length) return c.json({ songs: [] })
  const named = genres.filter((g) => g.genre !== null).map((g) => g.genre as string)
  const withNull = genres.some((g) => g.genre === null)
  const marks = named.map((_, i) => `?${i + 2}`).join(',')
  const where = [named.length ? `s.genre IN (${marks})` : '', withNull ? 's.genre IS NULL' : ''].filter(Boolean).join(' OR ')
  const { results } = await c.env.DB.prepare(`${SONG_SELECT} WHERE ${where} ORDER BY s.created_at DESC LIMIT 200`)
    .bind(c.get('user').id, ...named)
    .all<SongRow>()
  return c.json({ songs: results.map(shapeSong) })
})

// ---------- Admin: manage them ----------
export const adminCategories = new Hono<AppEnv>()
adminCategories.use('*', requireUser, requireAdmin)

adminCategories.get('/', async (c) => {
  forget('categories-raw')
  const [genres, pending] = await Promise.all([
    loadGenres(c.env.DB),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM songs WHERE genre_checked_at IS NULL').first<{ n: number }>(),
  ])
  return c.json({ genres: genres.sort((a, b) => b.count - a.count), unchecked: pending?.n ?? 0 })
})

adminCategories.put('/', async (c) => {
  const body = await c.req.json<{ genre?: string | null; label?: string; hue?: number | null; hidden?: boolean }>().catch(() => ({}) as { genre?: string | null; label?: string; hue?: number | null; hidden?: boolean })
  // Songs without a genre are shown as "Other", so edits to them use that name as the key.
  const genre = body.genre === null || body.genre === undefined || body.genre === OTHER ? OTHER : String(body.genre).slice(0, 80)
  const label = (body.label ?? '').trim().slice(0, 40) || null
  const hue = Number.isFinite(body.hue) ? Math.max(0, Math.min(359, Math.floor(body.hue as number))) : null
  await c.env.DB.prepare(
    `INSERT INTO categories (genre, label, hue, hidden) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(genre) DO UPDATE SET label = ?2, hue = ?3, hidden = ?4`,
  )
    .bind(genre, label, hue, body.hidden ? 1 : 0)
    .run()
  forget('categories-raw')
  return c.json({ ok: true })
})

// Delete a category: its songs go to "Other" (and are not looked up again), and its edits are removed.
adminCategories.delete('/', async (c) => {
  const genre = (c.req.query('genre') ?? '').slice(0, 80)
  if (!genre || genre === OTHER) return c.json({ error: 'invalid_request' }, 400)
  const moved = await c.env.DB.prepare("UPDATE songs SET genre = NULL, genre_checked_at = datetime('now') WHERE genre = ?").bind(genre).run()
  await c.env.DB.prepare('DELETE FROM categories WHERE genre = ?').bind(genre).run()
  forget('categories-raw')
  return c.json({ moved: moved.meta.changes })
})

// Delete a category together with every song in it (audio and covers included). Anyone can request a song again later.
adminCategories.delete('/by-label', async (c) => {
  const label = (c.req.query('label') ?? '').slice(0, 40)
  if (!label) return c.json({ error: 'invalid_request' }, 400)
  const db = c.env.DB
  forget('categories-raw')
  const genres = (await loadGenres(db)).filter((g) => g.label === label)
  if (!genres.length) return c.json({ deleted: 0, freedBytes: 0 })

  const named = genres.filter((g) => g.genre !== null).map((g) => g.genre as string)
  const withNull = genres.some((g) => g.genre === null)
  const marks = named.map((_, i) => `?${i + 1}`).join(',')
  const where = [named.length ? `genre IN (${marks})` : '', withNull ? 'genre IS NULL' : ''].filter(Boolean).join(' OR ')
  const { results } = await db.prepare(`SELECT id, r2_key, thumb_key, size_bytes FROM songs WHERE ${where}`).bind(...named).all<{ id: string; r2_key: string; thumb_key: string | null; size_bytes: number | null }>()

  const keys = results.flatMap((s) => [s.r2_key, ...(s.thumb_key ? [s.thumb_key] : [])])
  for (let i = 0; i < keys.length; i += 500) await c.env.SONGS.delete(keys.slice(i, i + 500))
  for (let i = 0; i < results.length; i += 40) {
    const ids = results.slice(i, i + 40).map((s) => s.id)
    const m = ids.map(() => '?').join(',')
    await db.batch([
      db.prepare(`UPDATE download_jobs SET song_id = NULL WHERE song_id IN (${m})`).bind(...ids),
      db.prepare(`DELETE FROM songs WHERE id IN (${m})`).bind(...ids),
    ])
  }
  for (const g of genres) await db.prepare('DELETE FROM categories WHERE genre = ?').bind(g.genre ?? OTHER).run()
  const freed = results.reduce((n, s) => n + (s.size_bytes ?? 0), 0)
  await audit(db, c.get('user').id, 'category.delete', label, { songs: results.length, bytes: freed })
  forget('categories-raw')
  forget('songs:')
  forget('stats-songs')
  forget('artists')
  return c.json({ deleted: results.length, freedBytes: freed })
})

// Look every song up again (e.g. after the lookup got better).
adminCategories.post('/recheck', async (c) => {
  const r = await c.env.DB.prepare("UPDATE songs SET genre_checked_at = NULL WHERE genre IS NULL").run()
  forget('categories-raw')
  return c.json({ queued: r.meta.changes })
})
