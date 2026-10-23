import { Hono } from 'hono'
import { canRequestDirect, requireUser } from '../auth'
import { createJob } from '../lib/jobs'
import { wakeAgent } from '../lib/wake'
import { ytmArtists, ytmArtistSongs } from '../lib/ytm'
import type { AppEnv, Env, User } from '../types'

export const artistPages = new Hono<AppEnv>()
artistPages.use('*', requireUser)

const TRUSTED_ARTISTS_PER_DAY = 3
const TRUSTED_MAX_SONGS = 120
const ADMIN_MAX_SONGS = 250
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** Queues every missing song of an artist. Returns how many were queued. */
export async function queueArtist(env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }, user: User, browseId: string, max: number): Promise<{ queued: number; skipped: number }> {
  const songs = await ytmArtistSongs(browseId, max)
  let queued = 0
  let skipped = 0
  for (const s of songs) {
    const r = await createJob(env.DB, user, { youtubeId: s.youtubeId, title: s.title, channel: s.channel, durationSec: s.durationSec, category: s.category }, { skipDailyLimit: true })
    if (r.ok) queued += 1
    else skipped += 1
  }
  if (queued) wakeAgent(env, ctx)
  return { queued, skipped }
}

/** Artists in the library with their photo. Photos are looked up from YouTube Music a few at a time and then kept. */
artistPages.get('/', async (c) => {
  const db = c.env.DB
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, a.browse_id AS browseId, a.image_url AS imageUrl, a.image_checked_at AS checked, COUNT(s.id) AS songCount
       FROM artists a JOIN songs s ON s.artist_id = a.id
       GROUP BY a.id ORDER BY songCount DESC, a.name`,
    )
    .all<{ id: string; name: string; browseId: string | null; imageUrl: string | null; checked: string | null; songCount: number }>()

  const todo = results.filter((a) => !a.checked && a.name !== 'Unknown Artist').slice(0, 8)
  await Promise.all(
    todo.map(async (a) => {
      try {
        const hit = (await ytmArtists(a.name)).find((x) => norm(x.name) === norm(a.name))
        a.browseId = hit?.browseId ?? null
        a.imageUrl = hit?.thumbnail ?? null
        await db.prepare("UPDATE artists SET browse_id = ?, image_url = ?, image_checked_at = datetime('now') WHERE id = ?").bind(a.browseId, a.imageUrl, a.id).run()
      } catch (e) {
        console.error('artist lookup failed', e) // try again on the next visit
      }
    }),
  )
  return c.json({ artists: results.map(({ checked: _checked, ...a }) => a) })
})

artistPages.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return c.json({ artists: [] })
  try {
    return c.json({ artists: await ytmArtists(q) })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'youtube_error' }, 502)
  }
})

/**
 * Ask for an artist's whole catalogue. Trusted users and admins get it queued right away; members create a
 * request that an admin approves.
 */
artistPages.post('/request', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ browseId?: string; name?: string; imageUrl?: string }>().catch(() => ({}) as { browseId?: string; name?: string; imageUrl?: string })
  const browseId = body.browseId ?? ''
  const name = (body.name ?? '').trim().slice(0, 80)
  if (!/^UC[\w-]{10,40}$/.test(browseId) || !name) return c.json({ error: 'invalid_request' }, 400)
  const db = c.env.DB

  if (canRequestDirect(user)) {
    if (user.role !== 'admin') {
      const used = await db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE user_id = ? AND q LIKE 'ar:%' AND created_at >= date('now')").bind(user.id).first<{ n: number }>()
      if ((used?.n ?? 0) >= TRUSTED_ARTISTS_PER_DAY) return c.json({ error: 'daily_limit_reached', limit: TRUSTED_ARTISTS_PER_DAY }, 429)
      await db.prepare('INSERT INTO yt_searches (user_id, q) VALUES (?, ?)').bind(user.id, `ar:${browseId}`).run()
    }
    try {
      const r = await queueArtist(c.env, c.executionCtx, user, browseId, user.role === 'admin' ? ADMIN_MAX_SONGS : TRUSTED_MAX_SONGS)
      return c.json({ status: 'queued', ...r })
    } catch (e) {
      console.error(e)
      return c.json({ error: 'youtube_error' }, 502)
    }
  }

  try {
    await db
      .prepare('INSERT INTO artist_requests (id, user_id, browse_id, name, image_url) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, browseId, name, body.imageUrl?.slice(0, 400) ?? null)
      .run()
  } catch {
    return c.json({ error: 'already_requested' }, 409)
  }
  return c.json({ status: 'pending' })
})
