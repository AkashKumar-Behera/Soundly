import { Hono } from 'hono'
import { requireAdmin, requireUser } from '../auth'
import type { AppEnv } from '../types'
import { queueInfo } from '../lib/queue'
import { agentStatus, wakeAgent } from '../lib/wake'
import { audit, getSetting } from '../util'
import { shapeJob } from './requests'
import type { JobRow } from './requests'

export const admin = new Hono<AppEnv>()
admin.use('*', requireUser, requireAdmin)

// ---------- Request approvals and queue control ----------
admin.get('/requests', async (c) => {
  const status = c.req.query('status')
  const base = `SELECT j.*, u.name AS userName FROM download_jobs j JOIN users u ON u.id = j.user_id`
  const stmt = status
    ? c.env.DB.prepare(`${base} WHERE j.status = ? ORDER BY j.created_at DESC LIMIT 200`).bind(status)
    : c.env.DB.prepare(`${base} ORDER BY j.created_at DESC LIMIT 200`)
  const { results } = await stmt.all<JobRow>()
  const q = await queueInfo(c.env.DB)
  return c.json({ requests: results.map((j) => shapeJob(j, q)) })
})

admin.post('/requests/:id/approve', async (c) => {
  const id = c.req.param('id')
  const res = await c.env.DB.prepare(
    "UPDATE download_jobs SET status = 'queued', approved_by = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending_approval'",
  )
    .bind(c.get('user').id, id)
    .run()
  if (!res.meta.changes) return c.json({ error: 'not_pending' }, 409)
  await audit(c.env.DB, c.get('user').id, 'request.approve', id)
  wakeAgent(c.env, c.executionCtx)
  return c.json({ status: 'queued' })
})

admin.post('/requests/:id/reject', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string })
  const reason = (body.reason ?? '').trim().slice(0, 200) || null
  const res = await c.env.DB.prepare(
    "UPDATE download_jobs SET status = 'rejected', reject_reason = ?, updated_at = datetime('now') WHERE id = ? AND status IN ('pending_approval', 'queued')",
  )
    .bind(reason, id)
    .run()
  if (!res.meta.changes) return c.json({ error: 'not_rejectable' }, 409)
  await c.env.DB.prepare('DELETE FROM import_items WHERE youtube_id = (SELECT youtube_id FROM download_jobs WHERE id = ?)').bind(id).run()
  await audit(c.env.DB, c.get('user').id, 'request.reject', id, { reason })
  return c.json({ status: 'rejected' })
})

// Remove failed or rejected requests from the list (nothing in the library is touched).
admin.delete('/requests', async (c) => {
  const status = c.req.query('status')
  if (status !== 'failed' && status !== 'rejected') return c.json({ error: 'invalid_request' }, 400)
  await c.env.DB.prepare('DELETE FROM import_items WHERE youtube_id IN (SELECT youtube_id FROM download_jobs WHERE status = ?)').bind(status).run()
  const res = await c.env.DB.prepare('DELETE FROM download_jobs WHERE status = ?').bind(status).run()
  await audit(c.env.DB, c.get('user').id, 'request.clear', status, { removed: res.meta.changes })
  return c.json({ removed: res.meta.changes })
})

admin.delete('/requests/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare("DELETE FROM import_items WHERE youtube_id = (SELECT youtube_id FROM download_jobs WHERE id = ? AND status IN ('failed', 'rejected'))").bind(id).run()
  const res = await c.env.DB.prepare("DELETE FROM download_jobs WHERE id = ? AND status IN ('failed', 'rejected')").bind(id).run()
  if (!res.meta.changes) return c.json({ error: 'not_removable' }, 409)
  await audit(c.env.DB, c.get('user').id, 'request.delete', id)
  return c.json({ ok: true })
})

admin.post('/requests/:id/retry', async (c) => {
  const id = c.req.param('id')
  const res = await c.env.DB.prepare(
    "UPDATE download_jobs SET status = 'queued', error = NULL, attempts = 0, updated_at = datetime('now') WHERE id = ? AND status = 'failed'",
  )
    .bind(id)
    .run()
  if (!res.meta.changes) return c.json({ error: 'not_failed' }, 409)
  await audit(c.env.DB, c.get('user').id, 'request.retry', id)
  wakeAgent(c.env, c.executionCtx)
  return c.json({ status: 'queued' })
})

// ---------- Dashboard numbers ----------
admin.get('/stats', async (c) => {
  const db = c.env.DB
  const [users, songs, jobs, plays, agent, maxUsers, window, hub] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE disabled = 0').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM songs').first<{ n: number; bytes: number }>(),
    db.prepare('SELECT status, COUNT(*) AS n FROM download_jobs GROUP BY status').all<{ status: string; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM plays WHERE played_at >= date('now', '-7 days')").first<{ n: number }>(),
    db.prepare('SELECT * FROM agent_heartbeats ORDER BY last_seen_at DESC LIMIT 1').first<{
      agent_id: string
      last_seen_at: string
      on_home_wifi: number
      version: string | null
      current_job_id: string | null
    }>(),
    getSetting(db, 'max_users', 30),
    getSetting(db, 'agent_online_window_sec', 90),
    agentStatus(c.env),
  ])

  // A live push connection is the best signal; an older polling agent is recognised by its recent heartbeat.
  const polled = agent ? Date.now() - new Date(agent.last_seen_at.replace(' ', 'T') + 'Z').getTime() < window * 1000 : false
  const online = !!hub?.connected || polled

  return c.json({
    users: { count: users?.n ?? 0, max: maxUsers },
    songs: { count: songs?.n ?? 0, storageBytes: songs?.bytes ?? 0, freeLimitBytes: 10 * 1024 ** 3 },
    jobs: Object.fromEntries(jobs.results.map((r) => [r.status, r.n])),
    playsLast7Days: plays?.n ?? 0,
    agent: agent
      ? { id: agent.agent_id, online, push: !!hub?.connected, onHomeWifi: hub?.connected ? hub.onHomeWifi : !!agent.on_home_wifi, lastSeenAt: hub?.connected && hub.lastSeen ? new Date(hub.lastSeen).toISOString().slice(0, 19).replace('T', ' ') : agent.last_seen_at, version: hub?.connected ? hub.version : agent.version, currentJobId: hub?.connected ? hub.currentJobId : agent.current_job_id }
      : hub?.connected
        ? { id: hub.agentId ?? 'laptop', online: true, push: true, onHomeWifi: hub.onHomeWifi, lastSeenAt: hub.lastSeen ? new Date(hub.lastSeen).toISOString().slice(0, 19).replace('T', ' ') : '', version: hub.version, currentJobId: hub.currentJobId }
        : null,
  })
})

// ---------- Users ----------
admin.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar_url AS avatarUrl, u.role, u.can_request_direct AS canRequestDirect, u.daily_request_limit AS dailyRequestLimit,
            u.pro_until AS proUntil, u.contribution_note AS contributionNote, u.disabled, u.created_at AS createdAt, u.last_seen_at AS lastSeenAt,
            (SELECT COUNT(*) FROM download_jobs j WHERE j.user_id = u.id) AS requestCount,
            (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id) AS playCount,
            (SELECT COALESCE(SUM(p.seconds_listened), 0) / 60 FROM plays p WHERE p.user_id = u.id) AS minutesListened,
            (SELECT COUNT(*) FROM songs s WHERE s.added_by = u.id) AS songsAdded,
            (SELECT COALESCE(SUM(s.size_bytes), 0) FROM songs s WHERE s.added_by = u.id) AS storageBytes
     FROM users u ORDER BY u.created_at`,
  ).all()
  return c.json({ users: results })
})

const ROLES = ['listener', 'member', 'trusted', 'admin']

admin.patch('/users/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req
    .json<{ role?: string; canRequestDirect?: boolean; dailyRequestLimit?: number; proUntil?: string | null; disabled?: boolean; contributionNote?: string }>()
    .catch(() => ({}) as Record<string, never>)

  const sets: string[] = []
  const vals: (string | number | null)[] = []
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return c.json({ error: 'invalid_role' }, 400)
    sets.push('role = ?')
    vals.push(body.role)
  }
  if (body.canRequestDirect !== undefined) {
    sets.push('can_request_direct = ?')
    vals.push(body.canRequestDirect ? 1 : 0)
  }
  if (body.dailyRequestLimit !== undefined) {
    sets.push('daily_request_limit = ?')
    vals.push(Math.max(0, Math.min(Math.floor(Number(body.dailyRequestLimit) || 0), 200)))
  }
  if (body.proUntil !== undefined) {
    sets.push('pro_until = ?')
    vals.push(body.proUntil)
  }
  if (body.disabled !== undefined) {
    if (id === c.get('user').id && body.disabled) return c.json({ error: 'cannot_disable_self' }, 400)
    sets.push('disabled = ?')
    vals.push(body.disabled ? 1 : 0)
  }
  if (body.contributionNote !== undefined) {
    sets.push('contribution_note = ?')
    vals.push(String(body.contributionNote).slice(0, 300))
  }
  if (!sets.length) return c.json({ error: 'nothing_to_update' }, 400)

  const res = await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals, id)
    .run()
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404)
  await audit(c.env.DB, c.get('user').id, 'user.update', id, body)
  return c.json({ ok: true })
})

// ---------- Invites (invite-only signup is enforced in Phase 3) ----------
admin.get('/invites', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT code, role, created_at AS createdAt, expires_at AS expiresAt, used_by AS usedBy, used_at AS usedAt FROM invites ORDER BY created_at DESC LIMIT 100',
  ).all()
  return c.json({ invites: results })
})

admin.post('/invites', async (c) => {
  const body = await c.req.json<{ role?: string; expiresInDays?: number }>().catch(() => ({}) as { role?: string; expiresInDays?: number })
  const role = body.role ?? 'member'
  if (!ROLES.includes(role) || role === 'admin') return c.json({ error: 'invalid_role' }, 400)

  const db = c.env.DB
  const [users, max] = await Promise.all([db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(), getSetting(db, 'max_users', 30)])
  if ((users?.n ?? 0) >= max) return c.json({ error: 'user_limit_reached', max }, 409)

  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const code = `SND-${Array.from(bytes, (b) => (b % 36).toString(36)).join('').toUpperCase()}`
  const days = Math.max(1, Math.min(Math.floor(Number(body.expiresInDays) || 7), 90))
  await db
    .prepare("INSERT INTO invites (code, role, created_by, expires_at) VALUES (?, ?, ?, datetime('now', ?))")
    .bind(code, role, c.get('user').id, `+${days} days`)
    .run()
  await audit(db, c.get('user').id, 'invite.create', code, { role, days })
  return c.json({ code, role, expiresInDays: days, link: `${c.env.PUBLIC_URL}/login?invite=${code}` }, 201)
})
