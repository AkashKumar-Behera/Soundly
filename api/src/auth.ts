import { createMiddleware } from 'hono/factory'
import { userFromSession } from './session'
import type { AppEnv, Env, User } from './types'
import { USER_COLUMNS } from './types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function allowedOrigins(env: Env): string[] {
  const extra = String(env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return [new URL(env.PUBLIC_URL).origin, ...extra]
}

/**
 * Resolves the caller from the session cookie. In local dev (DEV_AUTH=true) an X-Dev-User header may stand in
 * for a session. Cookie-authenticated writes must come from an allowed Origin, which blocks cross-site forgery.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  let user = await userFromSession(c)

  if (user) {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('Origin')
      if (!origin || !allowedOrigins(c.env).includes(origin)) return c.json({ error: 'bad_origin' }, 403)
    }
  } else if (c.env.DEV_AUTH === 'true') {
    const email = c.req.header('X-Dev-User')
    if (email) {
      user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.email = ?`).bind(email).first<User>()
    }
  }

  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.disabled) return c.json({ error: 'account_disabled' }, 403)

  c.set('user', user)
  // Best-effort "last seen", at most every 5 minutes per user.
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-5 minutes'))")
      .bind(user.id)
      .run(),
  )
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  await next()
})

export function canRequestDirect(user: User): boolean {
  return user.role === 'admin' || user.role === 'trusted' || user.can_request_direct === 1
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** The laptop agent authenticates with a shared secret, not a user session. */
export const requireAgent = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!c.env.AGENT_TOKEN || !safeEqual(token, c.env.AGENT_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
  await next()
})
