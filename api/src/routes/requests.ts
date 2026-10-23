import { Hono } from 'hono'
import { requireUser } from '../auth'
import { createJob } from '../lib/jobs'
import type { AppEnv } from '../types'

export const requests = new Hono<AppEnv>()
requests.use('*', requireUser)

interface RequestBody {
  youtubeId?: string
  title?: string
  channel?: string
  durationSec?: number
  category?: string
  url?: string
}

export interface JobRow {
  id: string
  user_id: string
  userName?: string
  youtube_id: string
  title: string
  channel: string | null
  duration_sec: number | null
  category: string | null
  flags: string
  status: string
  error: string | null
  reject_reason: string | null
  song_id: string | null
  created_at: string
}

export const shapeJob = (j: JobRow) => ({
  id: j.id,
  userId: j.user_id,
  userName: j.userName,
  youtubeId: j.youtube_id,
  title: j.title,
  channel: j.channel,
  durationSec: j.duration_sec,
  category: j.category,
  flags: JSON.parse(j.flags) as string[],
  status: j.status,
  error: j.error,
  rejectReason: j.reject_reason,
  songId: j.song_id,
  createdAt: j.created_at,
})

/** Create a download request (rules live in lib/jobs.ts). */
requests.post('/', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden', message: 'Listeners cannot request songs.' }, 403)

  const body = await c.req.json<RequestBody>().catch(() => ({}) as RequestBody)
  const r = await createJob(c.env.DB, user, {
    youtubeId: body.youtubeId ?? '',
    title: body.title ?? '',
    channel: body.channel,
    durationSec: body.durationSec,
    category: body.category,
    url: body.url,
  })
  if (r.ok) return c.json({ id: r.id, status: r.status, flags: r.flags }, 201)

  const status = r.error === 'invalid_request' ? 400 : r.error === 'daily_limit_reached' ? 429 : 409
  return c.json({ error: r.error, songId: r.songId, limit: r.limit }, status)
})

requests.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM download_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(c.get('user').id)
    .all<JobRow>()
  return c.json({ requests: results.map(shapeJob) })
})
