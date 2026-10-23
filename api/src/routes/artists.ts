import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import { createJob } from '../lib/jobs'
import { wakeAgent } from '../lib/wake'
import { ytmArtists, ytmArtistSongs } from '../lib/ytm'
import type { AppEnv } from '../types'
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
