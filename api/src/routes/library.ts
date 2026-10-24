import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'
import { isPro } from '../util'
import { shapeSong } from './songs'

export const me = new Hono<AppEnv>()
me.use('*', requireUser)

me.get('/', async (c) => {
  const u = c.get('user')
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM download_jobs WHERE user_id = ? AND created_at >= date('now')")
    .bind(u.id)
    .first<{ n: number }>()
  return c.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    canRequestDirect: u.role === 'admin' || u.role === 'trusted' || u.can_request_direct === 1,
    dailyRequestLimit: u.daily_request_limit,
    requestsToday: used?.n ?? 0,
    proUntil: u.pro_until,
    isPro: isPro(u.pro_until),
  })
})

// ---------- Likes ----------
export const likes = new Hono<AppEnv>()
likes.use('*', requireUser)

likes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, a.name AS artist, s.album, s.duration_sec AS duration,
            s.thumb_key IS NOT NULL AS hasThumb, s.youtube_id AS youtubeId, s.r2_key LIKE '%.m4a' AS aac, 1 AS liked
     FROM likes l JOIN songs s ON s.id = l.song_id LEFT JOIN artists a ON a.id = s.artist_id
     WHERE l.user_id = ? ORDER BY l.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<Parameters<typeof shapeSong>[0]>()
  return c.json({ songs: results.map(shapeSong) })
})

likes.put('/:songId', async (c) => {
  const songId = c.req.param('songId')
  const exists = await c.env.DB.prepare('SELECT 1 AS ok FROM songs WHERE id = ?').bind(songId).first()
  if (!exists) return c.json({ error: 'not_found' }, 404)
  await c.env.DB.prepare('INSERT OR IGNORE INTO likes (user_id, song_id) VALUES (?, ?)').bind(c.get('user').id, songId).run()
  return c.json({ liked: true })
})

likes.delete('/:songId', async (c) => {
  await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND song_id = ?').bind(c.get('user').id, c.req.param('songId')).run()
  return c.json({ liked: false })
})

// ---------- Play history (feeds "recently played" and the admin analytics) ----------
export const plays = new Hono<AppEnv>()
plays.use('*', requireUser)

plays.post('/', async (c) => {
  const body = await c.req.json<{ songId?: string; seconds?: number }>().catch(() => ({}) as { songId?: string; seconds?: number })
  const songId = typeof body.songId === 'string' ? body.songId : ''
  const seconds = Math.max(0, Math.min(Math.floor(Number(body.seconds) || 0), 24 * 3600))
  const exists = await c.env.DB.prepare('SELECT 1 AS ok FROM songs WHERE id = ?').bind(songId).first()
  if (!exists) return c.json({ error: 'not_found' }, 404)
  await c.env.DB.prepare('INSERT INTO plays (user_id, song_id, seconds_listened) VALUES (?, ?, ?)')
    .bind(c.get('user').id, songId, seconds)
    .run()
  return c.json({ ok: true }, 201)
})

plays.get('/recent', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, a.name AS artist, s.album, s.duration_sec AS duration,
            s.thumb_key IS NOT NULL AS hasThumb, s.youtube_id AS youtubeId, s.r2_key LIKE '%.m4a' AS aac,
            EXISTS (SELECT 1 FROM likes l WHERE l.user_id = ?1 AND l.song_id = s.id) AS liked
     FROM (SELECT song_id, MAX(played_at) AS last_played FROM plays WHERE user_id = ?1 GROUP BY song_id) r
     JOIN songs s ON s.id = r.song_id LEFT JOIN artists a ON a.id = s.artist_id
     ORDER BY r.last_played DESC LIMIT 20`,
  )
    .bind(c.get('user').id)
    .all<Parameters<typeof shapeSong>[0]>()
  return c.json({ songs: results.map(shapeSong) })
})
