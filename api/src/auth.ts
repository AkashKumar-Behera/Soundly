import { createMiddleware } from 'hono/factory'
import type { AppEnv, Env, User } from './types'

const DEV_DEFAULT_USER = 'akashkumar48874@gmail.com'

/**
 * Phase 2 stand-in for real sessions. With DEV_AUTH=true the caller is whichever seeded user the
 * X-Dev-User header names (default: the admin). Phase 3 replaces this with Better Auth sessions.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.DEV_AUTH !== 'true') return c.json({ error: 'unauthorized' }, 401)

  const email = c.req.header('X-Dev-User') ?? DEV_DEFAULT_USER
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, can_request_direct, daily_request_limit, pro_until, disabled FROM users WHERE email = ?',
  )
    .bind(email)
    .first<User>()

  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.disabled) return c.json({ error: 'account_disabled' }, 403)

  c.set('user', user)
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
