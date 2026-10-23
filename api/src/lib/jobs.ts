import { canRequestDirect } from '../auth'
import type { User } from '../types'
import { getSetting } from '../util'

export const YT_ID = /^[\w-]{11}$/

export interface JobInput {
  youtubeId: string
  title: string
  channel?: string | null
  durationSec?: number | null
  category?: string | null
  url?: string | null
}

export type JobResult =
  | { ok: true; id: string; status: 'queued' | 'pending_approval'; flags: string[] }
  | { ok: false; error: 'invalid_request' | 'already_available' | 'already_requested' | 'daily_limit_reached'; songId?: string; limit?: number }

/**
 * Creates a download job. Trusted users and admins go straight to the queue, everyone else waits for approval,
 * and anything that looks like non-music or very long always needs an admin. Shared by single requests and
 * playlist imports (which skip the per-day request cap and are limited by import size instead).
 */
export async function createJob(db: D1Database, user: User, input: JobInput, opts: { skipDailyLimit?: boolean; maxDuration?: number } = {}): Promise<JobResult> {
  const youtubeId = input.youtubeId.trim()
  const title = (input.title ?? '').trim().slice(0, 200)
  if (!YT_ID.test(youtubeId) || !title) return { ok: false, error: 'invalid_request' }

  const have = await db.prepare('SELECT id FROM songs WHERE youtube_id = ?').bind(youtubeId).first<{ id: string }>()
  if (have) return { ok: false, error: 'already_available', songId: have.id }

  if (!opts.skipDailyLimit) {
    const used = await db.prepare("SELECT COUNT(*) AS n FROM download_jobs WHERE user_id = ? AND created_at >= date('now')").bind(user.id).first<{ n: number }>()
    if ((used?.n ?? 0) >= user.daily_request_limit) return { ok: false, error: 'daily_limit_reached', limit: user.daily_request_limit }
  }

  const maxDuration = opts.maxDuration ?? (await getSetting(db, 'max_duration_sec', 1200))
  const durationSec = Number.isFinite(input.durationSec) ? Math.max(0, Math.floor(input.durationSec as number)) : null
  const category = (input.category ?? '').trim().slice(0, 40) || null

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
        (input.url ?? `https://www.youtube.com/watch?v=${youtubeId}`).slice(0, 300),
        title,
        (input.channel ?? '').slice(0, 120) || null,
        durationSec,
        category,
        JSON.stringify(flags),
        status,
      )
      .run()
  } catch (e) {
    if (String(e).includes('UNIQUE')) return { ok: false, error: 'already_requested' }
    throw e
  }
  return { ok: true, id, status, flags }
}
