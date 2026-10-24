import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'
import { shapeSong } from './songs'

export const playlists = new Hono<AppEnv>()
playlists.use('*', requireUser)

interface PlaylistRow {
  id: string
  owner_id: string | null
  title: string
  description: string
  hue: number
  is_public: number
  songCount: number
  pendingCount: number
  ownerName?: string | null
}

// The creator is only revealed to admins; everyone else just sees the playlist.
const shape = (p: PlaylistRow, userId: string, admin = false) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  hue: p.hue,
  isPublic: !!p.is_public,
  isOwner: p.owner_id === userId,
  songCount: p.songCount,
  pendingCount: p.pendingCount,
  ...(admin ? { ownerName: p.ownerName ?? null } : {}),
})

playlists.get('/', async (c) => {
  const userId = c.get('user').id
  const admin = c.get('user').role === 'admin'
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS songCount,
            (SELECT COUNT(*) FROM import_items ii WHERE ii.playlist_id = p.id) AS pendingCount,
            (SELECT u.name FROM users u WHERE u.id = p.owner_id) AS ownerName
     FROM playlists p WHERE p.is_public = 1 OR p.owner_id = ?1 OR ?2 = 1 ORDER BY p.created_at, p.title`,
  )
    .bind(userId, admin ? 1 : 0)
    .all<PlaylistRow>()
  return c.json({ playlists: results.map((p) => shape(p, userId, admin)) })
})

async function loadPlayable(c: { env: AppEnv['Bindings']; get: (k: 'user') => AppEnv['Variables']['user'] }, id: string) {
  const userId = c.get('user').id
  return c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS songCount,
            (SELECT COUNT(*) FROM import_items ii WHERE ii.playlist_id = p.id) AS pendingCount,
            (SELECT u.name FROM users u WHERE u.id = p.owner_id) AS ownerName
     FROM playlists p WHERE p.id = ?1 AND (p.is_public = 1 OR p.owner_id = ?2 OR ?3 = 1)`,
  )
    .bind(id, userId, c.get('user').role === 'admin' ? 1 : 0)
    .first<PlaylistRow>()
}

playlists.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('user').id
  const pl = await loadPlayable(c, id)
  if (!pl) return c.json({ error: 'not_found' }, 404)

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, a.name AS artist, s.album, s.duration_sec AS duration,
            s.thumb_key IS NOT NULL AS hasThumb, s.youtube_id AS youtubeId, s.r2_key LIKE '%.m4a' AS aac,
            EXISTS (SELECT 1 FROM likes l WHERE l.user_id = ?2 AND l.song_id = s.id) AS liked
     FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id LEFT JOIN artists a ON a.id = s.artist_id
     WHERE ps.playlist_id = ?1 ORDER BY ps.position, ps.added_at`,
  )
    .bind(id, userId)
    .all<Parameters<typeof shapeSong>[0]>()

  return c.json({ ...shape(pl, userId, c.get('user').role === 'admin'), songs: results.map(shapeSong) })
})

playlists.post('/', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ title?: string; description?: string }>().catch(() => ({}) as { title?: string; description?: string })
  const title = (body.title ?? '').trim().slice(0, 80)
  if (!title) return c.json({ error: 'title_required' }, 400)

  const id = crypto.randomUUID()
  const hue = Math.floor(Math.random() * 360)
  await c.env.DB.prepare('INSERT INTO playlists (id, owner_id, title, description, hue, is_public) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(id, user.id, title, (body.description ?? '').trim().slice(0, 300), hue)
    .run()
  return c.json({ id, title, hue }, 201)
})

playlists.post('/:id/songs', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const owned = await c.env.DB.prepare('SELECT 1 AS ok FROM playlists WHERE id = ? AND (owner_id = ? OR ? = 1)').bind(id, user.id, user.role === 'admin' ? 1 : 0).first()
  if (!owned) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<{ songId?: string }>().catch(() => ({}) as { songId?: string })
  const exists = await c.env.DB.prepare('SELECT 1 AS ok FROM songs WHERE id = ?').bind(body.songId ?? '').first()
  if (!exists) return c.json({ error: 'song_not_found' }, 404)

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position)
     VALUES (?1, ?2, COALESCE((SELECT MAX(position) + 1 FROM playlist_songs WHERE playlist_id = ?1), 0))`,
  )
    .bind(id, body.songId)
    .run()
  return c.json({ ok: true }, 201)
})

playlists.delete('/:id/songs/:songId', async (c) => {
  const owned = await c.env.DB.prepare('SELECT 1 AS ok FROM playlists WHERE id = ? AND (owner_id = ? OR ? = 1)')
    .bind(c.req.param('id'), c.get('user').id, c.get('user').role === 'admin' ? 1 : 0)
    .first()
  if (!owned) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').bind(c.req.param('id'), c.req.param('songId')).run()
  return c.json({ ok: true })
})

playlists.patch('/:id', async (c) => {
  const body = await c.req.json<{ title?: string; isPublic?: boolean }>().catch(() => ({}) as { title?: string; isPublic?: boolean })
  const user = c.get('user')
  const admin = user.role === 'admin' ? 1 : 0
  if (typeof body.isPublic === 'boolean') {
    const r = await c.env.DB.prepare('UPDATE playlists SET is_public = ? WHERE id = ? AND (owner_id = ? OR ? = 1)').bind(body.isPublic ? 1 : 0, c.req.param('id'), user.id, admin).run()
    if (!r.meta.changes) return c.json({ error: 'forbidden' }, 403)
    if (body.title === undefined) return c.json({ ok: true })
  }
  const title = (body.title ?? '').trim().slice(0, 80)
  if (!title) return c.json({ error: 'title_required' }, 400)
  const res = await c.env.DB.prepare('UPDATE playlists SET title = ? WHERE id = ? AND (owner_id = ? OR ? = 1)').bind(title, c.req.param('id'), user.id, admin).run()
  if (!res.meta.changes) return c.json({ error: 'forbidden' }, 403)
  return c.json({ ok: true })
})

playlists.delete('/:id', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM playlists WHERE id = ? AND (owner_id = ? OR ? = 1)').bind(c.req.param('id'), c.get('user').id, c.get('user').role === 'admin' ? 1 : 0).run()
  if (!res.meta.changes) return c.json({ error: 'forbidden' }, 403)
  return c.json({ ok: true })
})
