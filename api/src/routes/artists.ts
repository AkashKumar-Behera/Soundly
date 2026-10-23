import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import { createJob } from '../lib/jobs'
import { wakeAgent } from '../lib/wake'
import { ytmArtists, ytmArtistSongs } from '../lib/ytm'
import type { AppEnv } from '../types'
import { queueArtist } from './artist-pages'
import { annotate } from './youtube'

export const artists = new Hono<AppEnv>()
artists.use('*', requireUser, requireAdmin)

const MAX_PER_REQUEST = 250

artists.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return c.json({ artists: [] })
  try {
    return c.json({ artists: await ytmArtists(q) })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'youtube_error' }, 502)
  }
})

// Artist requests from members, waiting for approval.
artists.get('/requests', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.browse_id AS browseId, r.name, r.image_url AS imageUrl, r.created_at AS createdAt, u.name AS userName
     FROM artist_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at`,
  ).all()
  return c.json({ requests: results })
})

artists.post('/requests/:id/:decision', async (c) => {
  const decision = c.req.param('decision')
  if (decision !== 'approve' && decision !== 'reject') return c.json({ error: 'invalid_request' }, 400)
  const req = await c.env.DB.prepare("SELECT browse_id AS browseId FROM artist_requests WHERE id = ? AND status = 'pending'").bind(c.req.param('id')).first<{ browseId: string }>()
  if (!req) return c.json({ error: 'not_found' }, 404)
  let result = { queued: 0, skipped: 0 }
  if (decision === 'approve') {
    try {
      result = await queueArtist(c.env, c.executionCtx, c.get('user'), req.browseId, MAX_PER_REQUEST)
    } catch (e) {
      console.error(e)
      return c.json({ error: 'youtube_error' }, 502)
    }
  }
  await c.env.DB.prepare('UPDATE artist_requests SET status = ? WHERE id = ?').bind(decision === 'approve' ? 'approved' : 'rejected', c.req.param('id')).run()
  return c.json(result)
})

artists.get('/:browseId/songs', async (c) => {
  const id = c.req.param('browseId')
  if (!/^UC[\w-]{10,40}$/.test(id)) return c.json({ error: 'invalid_request' }, 400)
  try {
    const songs = await ytmArtistSongs(id)
    return c.json({ songs: await annotate(c.env.DB, songs) })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'youtube_error' }, 502)
  }
})

/** Queues the chosen songs (or every missing one) for download. Admin jobs go straight to the queue. */
artists.post('/:browseId/download', async (c) => {
  const id = c.req.param('browseId')
  if (!/^UC[\w-]{10,40}$/.test(id)) return c.json({ error: 'invalid_request' }, 400)
  const body = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] })
  const wanted = Array.isArray(body.ids) ? new Set(body.ids) : null

  let songs
  try {
    songs = await ytmArtistSongs(id)
  } catch (e) {
    console.error(e)
    return c.json({ error: 'youtube_error' }, 502)
  }

  const user = c.get('user')
  let queued = 0
  let skipped = 0
  for (const s of songs) {
    if (wanted && !wanted.has(s.youtubeId)) continue
    if (queued >= MAX_PER_REQUEST) break
    const r = await createJob(c.env.DB, user, { youtubeId: s.youtubeId, title: s.title, channel: s.channel, durationSec: s.durationSec, category: s.category }, { skipDailyLimit: true })
    if (r.ok) queued += 1
    else skipped += 1
  }
  if (queued) wakeAgent(c.env, c.executionCtx)
  return c.json({ queued, skipped })
})
