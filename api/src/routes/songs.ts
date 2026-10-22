import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'
import { clampInt, likePattern, parseRange } from '../util'

export const songs = new Hono<AppEnv>()
songs.use('*', requireUser)

const SONG_SELECT = `
  SELECT s.id, s.title, a.name AS artist, s.album, s.duration_sec AS duration,
         s.thumb_key IS NOT NULL AS hasThumb, s.youtube_id AS youtubeId,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = ?1 AND l.song_id = s.id) AS liked
  FROM songs s LEFT JOIN artists a ON a.id = s.artist_id`

interface SongRow {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  hasThumb: number
  youtubeId: string | null
  liked: number
}

export const shapeSong = (r: SongRow) => ({ ...r, hasThumb: !!r.hasThumb, liked: !!r.liked })

songs.get('/', async (c) => {
  const user = c.get('user')
  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  const limit = clampInt(c.req.query('limit'), 50, 1, 100)
  const offset = clampInt(c.req.query('offset'), 0, 0, 100000)
  const pattern = likePattern(q)

  const { results } = await c.env.DB.prepare(
    `${SONG_SELECT}
     WHERE (?2 = '' OR s.title LIKE ?3 ESCAPE '\\' OR a.name LIKE ?3 ESCAPE '\\' OR s.album LIKE ?3 ESCAPE '\\')
     ORDER BY s.created_at DESC, s.title LIMIT ?4 OFFSET ?5`,
  )
    .bind(user.id, q, pattern, limit, offset)
    .all<SongRow>()

  return c.json({ songs: results.map(shapeSong), limit, offset })
})

songs.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`${SONG_SELECT} WHERE s.id = ?2`)
    .bind(c.get('user').id, c.req.param('id'))
    .first<SongRow>()
  return row ? c.json(shapeSong(row)) : c.json({ error: 'not_found' }, 404)
})

/** Audio streaming with HTTP Range support so seeking works without downloading the whole file. */
export const stream = new Hono<AppEnv>()
stream.use('*', requireUser)

stream.get('/:id', async (c) => {
  const song = await c.env.DB.prepare('SELECT r2_key FROM songs WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ r2_key: string }>()
  if (!song) return c.json({ error: 'not_found' }, 404)

  const head = await c.env.SONGS.head(song.r2_key)
  if (!head) return c.json({ error: 'audio_missing' }, 404)

  const headers = new Headers({
    'Content-Type': head.httpMetadata?.contentType ?? 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    ETag: head.httpEtag,
  })

  const range = parseRange(c.req.header('Range') ?? null, head.size)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${head.size}`)
    return new Response(null, { status: 416, headers })
  }

  if (range) {
    const length = range.end - range.start + 1
    const obj = await c.env.SONGS.get(song.r2_key, { range: { offset: range.start, length } })
    if (!obj) return c.json({ error: 'audio_missing' }, 404)
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`)
    headers.set('Content-Length', String(length))
    return new Response(obj.body, { status: 206, headers })
  }

  const obj = await c.env.SONGS.get(song.r2_key)
  if (!obj) return c.json({ error: 'audio_missing' }, 404)
  headers.set('Content-Length', String(head.size))
  return new Response(obj.body, { status: 200, headers })
})

export const thumbs = new Hono<AppEnv>()
thumbs.use('*', requireUser)

thumbs.get('/:id', async (c) => {
  const song = await c.env.DB.prepare('SELECT thumb_key FROM songs WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ thumb_key: string | null }>()
  if (!song?.thumb_key) return c.json({ error: 'not_found' }, 404)

  const obj = await c.env.SONGS.get(song.thumb_key)
  if (!obj) return c.json({ error: 'not_found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'private, max-age=86400',
    },
  })
})
