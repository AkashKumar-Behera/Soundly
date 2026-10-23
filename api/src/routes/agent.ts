import { Hono } from 'hono'
import { requireAgent } from '../auth'
import type { Env } from '../types'

/**
 * Endpoints for the laptop agent. The agent polls outbound (nothing on the laptop is exposed):
 * heartbeat -> claim a queued job -> download with yt-dlp -> upload to R2 -> complete.
 */
export const agent = new Hono<{ Bindings: Env }>()
agent.use('*', requireAgent)

const KEY = /^(songs|thumbs)\/[A-Za-z0-9._-]{1,120}$/

agent.post('/heartbeat', async (c) => {
  const body = await c.req
    .json<{ agentId?: string; onHomeWifi?: boolean; version?: string; currentJobId?: string | null }>()
    .catch(() => ({}) as { agentId?: string; onHomeWifi?: boolean; version?: string; currentJobId?: string | null })
  const agentId = (body.agentId ?? 'laptop').slice(0, 60)
  await c.env.DB.prepare(
    `INSERT INTO agent_heartbeats (agent_id, last_seen_at, on_home_wifi, version, current_job_id)
     VALUES (?1, datetime('now'), ?2, ?3, ?4)
     ON CONFLICT(agent_id) DO UPDATE SET last_seen_at = datetime('now'), on_home_wifi = ?2, version = ?3, current_job_id = ?4`,
  )
    .bind(agentId, body.onHomeWifi ? 1 : 0, (body.version ?? '').slice(0, 40) || null, body.currentJobId ?? null)
    .run()
  return c.json({ ok: true })
})

/** Atomically hand the oldest queued job to the agent. Claims stuck for 30 minutes are released first. */
agent.post('/claim', async (c) => {
  await c.env.DB.prepare(
    "UPDATE download_jobs SET status = 'queued', updated_at = datetime('now') WHERE status IN ('downloading', 'uploading') AND claimed_at < datetime('now', '-30 minutes')",
  ).run()

  const job = await c.env.DB.prepare(
    `UPDATE download_jobs
     SET status = 'downloading', attempts = attempts + 1, claimed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = (SELECT id FROM download_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued'
     RETURNING id, youtube_id AS youtubeId, youtube_url AS url, title, channel, duration_sec AS durationSec`,
  ).first()

  return c.json({ job: job ?? null })
})

agent.put('/upload', async (c) => {
  const key = c.req.query('key') ?? ''
  if (!KEY.test(key) || !c.req.raw.body) return c.json({ error: 'invalid_key' }, 400)
  const type = c.req.header('Content-Type') ?? 'application/octet-stream'
  const obj = await c.env.SONGS.put(key, c.req.raw.body, { httpMetadata: { contentType: type } })
  return c.json({ key, size: obj.size })
})

agent.post('/jobs/:id/uploading', async (c) => {
  await c.env.DB.prepare("UPDATE download_jobs SET status = 'uploading', updated_at = datetime('now') WHERE id = ? AND status = 'downloading'")
    .bind(c.req.param('id'))
    .run()
  return c.json({ ok: true })
})

interface CompleteBody {
  title?: string
  artist?: string
  album?: string
  durationSec?: number
  r2Key?: string
  thumbKey?: string | null
  sizeBytes?: number
  bitrateKbps?: number
}

agent.post('/jobs/:id/complete', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<CompleteBody>().catch(() => ({}) as CompleteBody)
  const db = c.env.DB

  const job = await db
    .prepare("SELECT id, youtube_id, title, channel, user_id FROM download_jobs WHERE id = ? AND status IN ('downloading', 'uploading')")
    .bind(id)
    .first<{ id: string; youtube_id: string; title: string; channel: string | null; user_id: string }>()
  if (!job) return c.json({ error: 'job_not_active' }, 409)

  const r2Key = body.r2Key ?? ''
  if (!KEY.test(r2Key) || !r2Key.startsWith('songs/')) return c.json({ error: 'invalid_key' }, 400)
  if (!(await c.env.SONGS.head(r2Key))) return c.json({ error: 'audio_not_uploaded' }, 400)
  const thumbKey = body.thumbKey && KEY.test(body.thumbKey) && body.thumbKey.startsWith('thumbs/') ? body.thumbKey : null

  const songId = crypto.randomUUID()
  const artist = (body.artist ?? job.channel ?? 'Unknown Artist').replace(/ - Topic$/, '').trim().slice(0, 120) || 'Unknown Artist'

  await db.batch([
    db.prepare('INSERT OR IGNORE INTO artists (id, name) VALUES (?, ?)').bind(crypto.randomUUID(), artist),
    db
      .prepare(
        `INSERT INTO songs (id, title, artist_id, album, duration_sec, r2_key, thumb_key, youtube_id, size_bytes, bitrate_kbps, added_by)
         VALUES (?, ?, (SELECT id FROM artists WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        songId,
        (body.title ?? job.title).slice(0, 200),
        artist,
        (body.album ?? '').slice(0, 120) || null,
        Number.isFinite(body.durationSec) ? Math.floor(body.durationSec as number) : null,
        r2Key,
        thumbKey,
        job.youtube_id,
        Number.isFinite(body.sizeBytes) ? Math.floor(body.sizeBytes as number) : null,
        Number.isFinite(body.bitrateKbps) ? Math.floor(body.bitrateKbps as number) : null,
        job.user_id,
      ),
    db.prepare("UPDATE download_jobs SET status = 'done', song_id = ?, error = NULL, updated_at = datetime('now') WHERE id = ?").bind(songId, id),
    db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) SELECT playlist_id, ?1, position FROM import_items WHERE youtube_id = ?2').bind(songId, job.youtube_id),
    db.prepare('DELETE FROM import_items WHERE youtube_id = ?').bind(job.youtube_id),
  ])

  return c.json({ songId })
})

/**
 * Failed jobs retry automatically until 3 attempts, then wait for an admin. `fatal` (private video, too long,
 * live stream...) skips the retries since another attempt cannot succeed.
 */
agent.post('/jobs/:id/fail', async (c) => {
  const body = await c.req.json<{ error?: string; fatal?: boolean }>().catch(() => ({}) as { error?: string; fatal?: boolean })
  await c.env.DB.prepare(
    `UPDATE download_jobs
     SET status = CASE WHEN ?2 = 1 OR attempts >= 3 THEN 'failed' ELSE 'queued' END, error = ?1, updated_at = datetime('now')
     WHERE id = ?3 AND status IN ('downloading', 'uploading')`,
  )
    .bind((body.error ?? 'unknown error').slice(0, 300), body.fatal ? 1 : 0, c.req.param('id'))
    .run()
  return c.json({ ok: true })
})
