import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'

function allowedOrigin(env: AppEnv['Bindings'], origin: string | undefined): boolean {
  if (!origin) return false
  const allowed = [new URL(env.PUBLIC_URL).origin, ...String(env.ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim())]
  return allowed.includes(origin)
}

export const live = new Hono<AppEnv>()
live.use('*', requireUser)

/** One WebSocket per open app: changes and download progress arrive here, so pages never need to poll. */
live.get('/', async (c): Promise<Response> => {
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'expected_websocket' }, 426)
  // Block cross-site WebSocket hijacking: browsers always send Origin on the handshake.
  if (!allowedOrigin(c.env, c.req.header('Origin'))) return c.json({ error: 'bad_origin' }, 403)
  const headers = new Headers(c.req.raw.headers)
  headers.set('X-Live', '1')
  headers.set('X-User', c.get('user').id) // from the session, never from the client
  return c.env.AGENT_HUB.get(c.env.AGENT_HUB.idFromName('main')).fetch(new Request(c.req.raw, { headers }))
})
