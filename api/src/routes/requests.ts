import { Hono } from 'hono'
import { canRequestDirect, requireUser } from '../auth'
import type { AppEnv } from '../types'
import { getSetting } from '../util'

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

const YT_ID = /^[\w-]{11}$/

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

/**
 * Create a download request. Trusted users go straight to the queue, everyone else waits for admin
 * approval, and anything that looks like non-music (or is very long) always needs an admin to look at it.
 */
requests.post('/', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden', message: 'Listeners cannot request songs.' }, 403)

  const body = await c.req.json<RequestBody>().catch(() => ({}) as RequestBody)
  const youtubeId = (body.youtubeId ?? '').trim()
  const title = (body.title ?? '').trim().slice(0, 200)
  if (!YT_ID.test(youtubeId) || !title) return c.json({ error: 'invalid_request' }, 400)

  const db = c.env.DB

  const have = await db.prepare('SELECT id FROM songs WHERE youtube_id = ?').bind(youtubeId).first<{ id: string }>()
  if (have) return c.json({ error: 'already_available', songId: have.id }, 409)

  const used = await db
    .prepare("SELECT COUNT(*) AS n FROM download_jobs WHERE user_id = ? AND created_at >= date('now')")
    .bind(user.id)
    .first<{ n: number }>()
  if ((used?.n ?? 0) >= user.daily_request_limit) {
    return c.json({ error: 'daily_limit_reached', limit: user.daily_request_limit }, 429)
  }

  const maxDuration = await getSetting(db, 'max_duration_sec', 1200)
  const durationSec = Number.isFinite(body.durationSec) ? Math.max(0, Math.floor(body.durationSec as number)) : null
  const category = (body.category ?? '').trim().slice(0, 40) || null

  const flags: string[] = []
  if (category && category.toLowerCase() !== 'music') flags.push('not_music')
  if (durationSec !== null && durationSec > maxDuration) flags.push('too_long')

  const status = canRequestDirect(user) && flags.length === 0 ? 'queued' : 'pending_approval'
  const id = crypto.randomUUID()

  try {
    await db
      .prepare(
        `INSERT INTO download_jobs (id, user_id, youtube_id, youtube_url, title, channel, duration_sec, category, flags, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        youtubeId,
        (body.url ?? `https://www.youtube.com/watch?v=${youtubeId}`).slice(0, 300),
        title,
        (body.channel ?? '').slice(0, 120) || null,
        durationSec,
        category,
        JSON.stringify(flags),
        status,
      )
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ error: 'already_requested' }, 409)
    throw e
  }

  return c.json({ id, status, flags }, 201)
})

requests.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM download_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(c.get('user').id)
    .all<JobRow>()
  return c.json({ requests: results.map(shapeJob) })
})
