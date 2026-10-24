import { Hono } from 'hono'
import { requireAgent } from '../auth'
import { emit } from '../lib/live'
import { forget } from '../util'
import { wakeAgent } from '../lib/wake'
import type { Env } from '../types'

/**
 * Endpoints for the laptop agent. The agent polls outbound (nothing on the laptop is exposed):
 * heartbeat -> claim a queued job -> download with yt-dlp -> upload to R2 -> complete.
 */
export const agent = new Hono<{ Bindings: Env }>()
agent.use('*', requireAgent)

/** The agent's outbound WebSocket. Frames from the Worker: {type:'wake'} (a job is claimable), {type:'ack'}. */
agent.get('/ws', async (c): Promise<Response> => {
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'expected_websocket' }, 426)
  return c.env.AGENT_HUB.get(c.env.AGENT_HUB.idFromName('main')).fetch(c.req.raw)
})

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
// Every song with a cover, so the agent can re-fetch covers in better quality (`agent.py --refresh-covers`).
agent.get('/songs', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT title, youtube_id AS youtubeId, thumb_key AS thumbKey FROM songs WHERE youtube_id IS NOT NULL AND thumb_key IS NOT NULL').all()
  return c.json({ songs: results })
})

// Songs whose genre has not been looked up yet; the agent asks iTunes and reports back.
agent.get('/genres/todo', async (c) => {
  const limit = Math.max(1, Math.min(40, Number(c.req.query('limit')) || 20))
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.duration_sec AS duration, a.name AS artist
     FROM songs s LEFT JOIN artists a ON a.id = s.artist_id WHERE s.genre_checked_at IS NULL ORDER BY s.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all()
  return c.json({ songs: results })
})

agent.post('/genres', async (c) => {
  const body = await c.req.json<{ results?: { id?: string; genre?: string | null }[] }>().catch(() => ({}) as { results?: { id?: string; genre?: string | null }[] })
  const rows = (body.results ?? []).slice(0, 60).filter((r) => typeof r.id === 'string')
  if (!rows.length) return c.json({ ok: true })
  await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare("UPDATE songs SET genre = ?, genre_checked_at = datetime('now') WHERE id = ?").bind(r.genre ? String(r.genre).slice(0, 80) : null, r.id),
    ),
  )
  forget('categories-raw')
  return c.json({ ok: true, saved: rows.length })
})

agent.post('/claim', async (c) => {
  await c.env.DB.prepare(
    "UPDATE download_jobs SET status = 'queued', updated_at = datetime('now') WHERE status IN ('downloading', 'uploading') AND claimed_at < datetime('now', '-30 minutes')",
  ).run()

  const job = await c.env.DB.prepare(
    `UPDATE download_jobs
     SET status = 'downloading', attempts = attempts + 1, claimed_at = datetime('now'), updated_at = datetime('now'),
         stage = 'starting', progress = 0, eta_sec = NULL, speed_bps = NULL, progress_at = datetime('now')
     WHERE id = (SELECT id FROM download_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued'
     RETURNING id, youtube_id AS youtubeId, youtube_url AS url, title, channel, duration_sec AS durationSec`,
  ).first()

  const claimed = job as { id?: string } | null
  if (claimed?.id) emit(c.env, c.executionCtx, { type: 'job', id: claimed.id, status: 'downloading' })
  return c.json({ job: job ?? null })
})

agent.put('/upload', async (c) => {
  const key = c.req.query('key') ?? ''
  if (!KEY.test(key) || !c.req.raw.body) return c.json({ error: 'invalid_key' }, 400)
  const type = c.req.header('Content-Type') ?? 'application/octet-stream'
  const obj = await c.env.SONGS.put(key, c.req.raw.body, { httpMetadata: { contentType: type } })
  return c.json({ key, size: obj.size })
})

/** Live progress from the agent (throttled on its side). Ignored once the job is no longer active. */
agent.post('/jobs/:id/progress', async (c) => {
  const b = await c.req.json<{ stage?: string; progress?: number; etaSec?: number | null; speedBps?: number | null }>().catch(() => ({}) as { stage?: string; progress?: number; etaSec?: number | null; speedBps?: number | null })
  const stage = ['starting', 'downloading', 'converting', 'uploading', 'saving'].includes(b.stage ?? '') ? b.stage : null
  if (!stage) return c.json({ error: 'invalid_stage' }, 400)
  const progress = Math.max(0, Math.min(1, Number(b.progress) || 0))
  const eta = Number.isFinite(b.etaSec) ? Math.max(0, Math.round(b.etaSec as number)) : null
  const speed = Number.isFinite(b.speedBps) ? Math.max(0, Math.round(b.speedBps as number)) : null
  // Older agents report over HTTP. Progress is only ever pushed to the apps, never written to the database.
  emit(c.env, c.executionCtx, { type: 'progress', jobId: c.req.param('id'), stage: stage as string, progress, etaSec: eta, speedBps: speed })
  return c.json({ ok: true })
})

agent.post('/jobs/:id/uploading', async (c) => {
  await c.env.DB.prepare("UPDATE download_jobs SET status = 'uploading', updated_at = datetime('now') WHERE id = ? AND status = 'downloading'")
    .bind(c.req.param('id'))
    .run()
  emit(c.env, c.executionCtx, { type: 'job', id: c.req.param('id'), status: 'uploading' })
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
    .prepare("SELECT id, youtube_id, title, channel, user_id, replace_song_id FROM download_jobs WHERE id = ? AND status IN ('downloading', 'uploading')")
    .bind(id)
    .first<{ id: string; youtube_id: string; title: string; channel: string | null; user_id: string; replace_song_id: string | null }>()
  if (!job) return c.json({ error: 'job_not_active' }, 409)

  const r2Key = body.r2Key ?? ''
  if (!KEY.test(r2Key) || !r2Key.startsWith('songs/')) return c.json({ error: 'invalid_key' }, 400)
  if (!(await c.env.SONGS.head(r2Key))) return c.json({ error: 'audio_not_uploaded' }, 400)
  const thumbKey = body.thumbKey && KEY.test(body.thumbKey) && body.thumbKey.startsWith('thumbs/') ? body.thumbKey : null

  if (job.replace_song_id) {
    // AAC upgrade: same song id (likes, playlists and history stay), new audio file; the old one is removed.
    const old = await db.prepare('SELECT r2_key FROM songs WHERE id = ?').bind(job.replace_song_id).first<{ r2_key: string }>()
    await db.batch([
      db
        .prepare('UPDATE songs SET r2_key = ?, thumb_key = COALESCE(?, thumb_key), size_bytes = ?, bitrate_kbps = ? WHERE id = ?')
        .bind(r2Key, thumbKey, Number.isFinite(body.sizeBytes) ? Math.floor(body.sizeBytes as number) : null, Number.isFinite(body.bitrateKbps) ? Math.floor(body.bitrateKbps as number) : null, job.replace_song_id),
      db.prepare("UPDATE download_jobs SET status = 'done', song_id = ?, error = NULL, stage = NULL, progress = 1, eta_sec = NULL, speed_bps = NULL, updated_at = datetime('now') WHERE id = ?").bind(job.replace_song_id, id),
    ])
    if (old && old.r2_key !== r2Key) await c.env.SONGS.delete(old.r2_key)
    forget('songs:')
    forget('stats-songs')
    emit(c.env, c.executionCtx, { type: 'job', id, status: 'done', songId: job.replace_song_id })
    emit(c.env, c.executionCtx, { type: 'hint', topic: 'library' })
    return c.json({ songId: job.replace_song_id })
  }

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
    db.prepare("UPDATE download_jobs SET status = 'done', song_id = ?, error = NULL, stage = NULL, progress = 1, eta_sec = NULL, speed_bps = NULL, updated_at = datetime('now') WHERE id = ?").bind(songId, id),
    db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) SELECT playlist_id, ?1, position FROM import_items WHERE youtube_id = ?2').bind(songId, job.youtube_id),
    db.prepare('DELETE FROM import_items WHERE youtube_id = ?').bind(job.youtube_id),
  ])

  forget('songs:')
  forget('stats-songs')
  forget('artists')
  emit(c.env, c.executionCtx, { type: 'job', id, status: 'done', songId })
  emit(c.env, c.executionCtx, { type: 'hint', topic: 'library' })
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
  wakeAgent(c.env, c.executionCtx) // a requeued job is claimable again
  emit(c.env, c.executionCtx, { type: 'hint', topic: 'requests' })
  return c.json({ ok: true })
})
