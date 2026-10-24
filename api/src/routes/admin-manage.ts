import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import type { AppEnv } from '../types'
import { audit, clampInt, likePattern, memo } from '../util'

/** Library, analytics, settings and activity management for the admin panel (complements routes/admin.ts). */
export const adminManage = new Hono<AppEnv>()
adminManage.use('*', requireUser, requireAdmin)

// ---------- Analytics ----------
adminManage.get('/analytics', async (c) => {
  const db = c.env.DB
  const days = clampInt(c.req.query('days'), 30, 7, 90)
  const since = `-${days - 1} days`

  const [perDay, requestsPerDay, topSongs, topListeners, totals, active] = await Promise.all([
    db
      .prepare(
        `SELECT date(played_at) AS day, COUNT(*) AS plays, COUNT(DISTINCT user_id) AS listeners, COALESCE(SUM(seconds_listened), 0) AS seconds
         FROM plays WHERE played_at >= date('now', ?) GROUP BY day`,
      )
      .bind(since)
      .all<{ day: string; plays: number; listeners: number; seconds: number }>(),
    db
      .prepare("SELECT date(created_at) AS day, COUNT(*) AS n FROM download_jobs WHERE created_at >= date('now', ?) GROUP BY day")
      .bind(since)
      .all<{ day: string; n: number }>(),
    db
      .prepare(
        `SELECT s.id, s.title, a.name AS artist, COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds
         FROM plays p JOIN songs s ON s.id = p.song_id LEFT JOIN artists a ON a.id = s.artist_id
         WHERE p.played_at >= date('now', ?) GROUP BY s.id ORDER BY plays DESC, seconds DESC LIMIT 10`,
      )
      .bind(since)
      .all(),
    db
      .prepare(
        `SELECT u.id, u.name, COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds
         FROM plays p JOIN users u ON u.id = p.user_id
         WHERE p.played_at >= date('now', ?) GROUP BY u.id ORDER BY plays DESC, seconds DESC LIMIT 10`,
      )
      .bind(since)
      .all(),
    db
      .prepare("SELECT COUNT(*) AS plays, COALESCE(SUM(seconds_listened), 0) AS seconds FROM plays WHERE played_at >= date('now', ?)")
      .bind(since)
      .first<{ plays: number; seconds: number }>(),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM plays WHERE played_at >= date('now', '-6 days')").first<{ n: number }>(),
  ])

  // One entry per day, including days with no activity, so the chart has no gaps.
  const playMap = new Map(perDay.results.map((r) => [r.day, r]))
  const reqMap = new Map(requestsPerDay.results.map((r) => [r.day, r.n]))
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10)
    const p = playMap.get(d)
    return { day: d, plays: p?.plays ?? 0, listeners: p?.listeners ?? 0, minutes: Math.round((p?.seconds ?? 0) / 60), requests: reqMap.get(d) ?? 0 }
  })

  return c.json({
    days,
    series,
    totals: { plays: totals?.plays ?? 0, minutes: Math.round((totals?.seconds ?? 0) / 60), activeListeners7d: active?.n ?? 0 },
    topSongs: topSongs.results,
    topListeners: topListeners.results,
  })
})

// ---------- Library ----------
adminManage.get('/songs', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  const limit = clampInt(c.req.query('limit'), 50, 1, 200)
  const offset = clampInt(c.req.query('offset'), 0, 0, 100000)
  const pattern = likePattern(q)
  // Optional filter: only AAC (.m4a) songs, or only the older MP3 ones.
  const format = c.req.query('format') === 'aac' ? 'aac' : c.req.query('format') === 'mp3' ? 'mp3' : ''
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, a.name AS artist, s.album, s.duration_sec AS duration, s.size_bytes AS sizeBytes, s.youtube_id AS youtubeId, s.r2_key LIKE '%.m4a' AS aac,
            s.created_at AS createdAt, s.thumb_key IS NOT NULL AS hasThumb, u.name AS addedBy,
            (SELECT COUNT(*) FROM plays p WHERE p.song_id = s.id) AS plays,
            (SELECT COUNT(*) FROM likes l WHERE l.song_id = s.id) AS likes
     FROM songs s LEFT JOIN artists a ON a.id = s.artist_id LEFT JOIN users u ON u.id = s.added_by
     WHERE (?1 = '' OR s.title LIKE ?2 ESCAPE '\\' OR a.name LIKE ?2 ESCAPE '\\' OR s.album LIKE ?2 ESCAPE '\\')
       AND (?5 = '' OR (?5 = 'aac' AND s.r2_key LIKE '%.m4a') OR (?5 = 'mp3' AND s.r2_key NOT LIKE '%.m4a'))
     ORDER BY s.created_at DESC, s.title LIMIT ?3 OFFSET ?4`,
  )
    .bind(q, pattern, limit, offset, format)
    .all()
  // Totals for the filter chips, kept for a minute (a finished download clears them).
  const counts = await memo('stats-songs-formats', 60000, () =>
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(r2_key LIKE '%.m4a'), 0) AS aac FROM songs").first<{ n: number; aac: number }>(),
  )
  return c.json({ songs: results, total: counts?.n ?? 0, aacCount: counts?.aac ?? 0, mp3Count: (counts?.n ?? 0) - (counts?.aac ?? 0), limit, offset })
})

adminManage.patch('/songs/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ title?: string; artist?: string; album?: string }>().catch(() => ({}) as { title?: string; artist?: string; album?: string })
  const db = c.env.DB

  const title = body.title?.trim().slice(0, 200)
  const artist = body.artist?.trim().slice(0, 120)
  if (body.title !== undefined && !title) return c.json({ error: 'title_required' }, 400)
  if (body.artist !== undefined && !artist) return c.json({ error: 'artist_required' }, 400)

  const statements = []
  if (artist) {
    statements.push(db.prepare('INSERT OR IGNORE INTO artists (id, name) VALUES (?, ?)').bind(crypto.randomUUID(), artist))
    statements.push(db.prepare('UPDATE songs SET artist_id = (SELECT id FROM artists WHERE name = ?) WHERE id = ?').bind(artist, id))
  }
  if (title) statements.push(db.prepare('UPDATE songs SET title = ? WHERE id = ?').bind(title, id))
  if (body.album !== undefined) statements.push(db.prepare('UPDATE songs SET album = ? WHERE id = ?').bind(body.album.trim().slice(0, 120) || null, id))
  if (!statements.length) return c.json({ error: 'nothing_to_update' }, 400)

  const exists = await db.prepare('SELECT 1 AS ok FROM songs WHERE id = ?').bind(id).first()
  if (!exists) return c.json({ error: 'not_found' }, 404)
  await db.batch(statements)
  await audit(db, c.get('user').id, 'song.edit', id, body)
  return c.json({ ok: true })
})

/** Removes the audio and cover from R2 first, then the database rows (likes, plays and playlist entries cascade). */
adminManage.delete('/songs/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const song = await db
    .prepare('SELECT s.title, s.r2_key, s.thumb_key, s.size_bytes, a.name AS artist FROM songs s LEFT JOIN artists a ON a.id = s.artist_id WHERE s.id = ?')
    .bind(id)
    .first<{ title: string; r2_key: string; thumb_key: string | null; size_bytes: number | null; artist: string | null }>()
  if (!song) return c.json({ error: 'not_found' }, 404)

  await c.env.SONGS.delete([song.r2_key, ...(song.thumb_key ? [song.thumb_key] : [])])
  await db.batch([
    db.prepare('UPDATE download_jobs SET song_id = NULL WHERE song_id = ?').bind(id),
    db.prepare('DELETE FROM songs WHERE id = ?').bind(id),
  ])
  await audit(db, c.get('user').id, 'song.delete', id, { title: song.title, artist: song.artist, bytes: song.size_bytes })
  return c.json({ ok: true, freedBytes: song.size_bytes ?? 0 })
})

// ---------- Settings ----------
const SETTING_RULES: Record<string, { min: number; max: number }> = {
  max_users: { min: 1, max: 100 },
  max_playlist_import: { min: 1, max: 200 },
  max_duration_sec: { min: 60, max: 7200 },
  agent_online_window_sec: { min: 30, max: 900 },
}
const SETTING_DEFAULTS: Record<string, number> = { max_users: 30, max_playlist_import: 50, max_duration_sec: 1200, agent_online_window_sec: 90 }

adminManage.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const stored = new Map(results.map((r) => [r.key, Number(r.value)]))
  return c.json({ settings: Object.fromEntries(Object.keys(SETTING_RULES).map((k) => [k, stored.get(k) ?? SETTING_DEFAULTS[k]])), rules: SETTING_RULES })
})

adminManage.patch('/settings', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const db = c.env.DB
  const statements = []
  for (const [key, raw] of Object.entries(body)) {
    const rule = SETTING_RULES[key]
    const value = Math.floor(Number(raw))
    if (!rule || !Number.isFinite(value) || value < rule.min || value > rule.max) return c.json({ error: 'invalid_setting', key }, 400)
    statements.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)))
  }
  if (!statements.length) return c.json({ error: 'nothing_to_update' }, 400)
  await db.batch(statements)
  await audit(db, c.get('user').id, 'settings.update', 'settings', body)
  return c.json({ ok: true })
})

// ---------- Invites and activity ----------
adminManage.delete('/invites/:code', async (c) => {
  const code = c.req.param('code')
  const res = await c.env.DB.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').bind(code).run()
  if (!res.meta.changes) return c.json({ error: 'not_revocable' }, 409)
  await audit(c.env.DB, c.get('user').id, 'invite.revoke', code)
  return c.json({ ok: true })
})

adminManage.get('/audit', async (c) => {
  const limit = clampInt(c.req.query('limit'), 50, 1, 200)
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.action, a.target, a.detail, a.created_at AS createdAt, u.name AS actor
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`,
  )
    .bind(limit)
    .all()
  return c.json({ entries: results })
})
