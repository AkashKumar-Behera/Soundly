import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'

export const rooms = new Hono<AppEnv>()
rooms.use('*', requireUser)

// Unambiguous characters only (no 0/O, 1/I), so a code read aloud or typed from a screenshot survives.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE = /^[A-HJ-NP-Z2-9]{6}$/

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

function allowedOrigin(env: AppEnv['Bindings'], origin: string | undefined): boolean {
  if (!origin) return false
  const allowed = [new URL(env.PUBLIC_URL).origin, ...String(env.ALLOWED_ORIGIN ?? '').split(',').map((o) => o.trim())]
  return allowed.includes(origin)
}

/** A room exists as soon as someone connects to its code; this just hands out an unused-looking code. */
rooms.post('/', (c) => {
  if (c.get('user').role === 'listener') return c.json({ error: 'forbidden' }, 403)
  const code = newCode()
  return c.json({ code, link: `${c.env.PUBLIC_URL}/room/${code}` }, 201)
})

rooms.get('/:code/ws', async (c) => {
  const code = c.req.param('code').toUpperCase()
  if (!CODE.test(code)) return c.json({ error: 'invalid_code' }, 400)
  if (c.req.header('Upgrade') !== 'websocket') return c.json({ error: 'expected_websocket' }, 426)
  // Block cross-site WebSocket hijacking: browsers always send Origin on the handshake.
  if (!allowedOrigin(c.env, c.req.header('Origin'))) return c.json({ error: 'bad_origin' }, 403)

  const user = c.get('user')
  const headers = new Headers(c.req.raw.headers)
  headers.set('X-User-Id', user.id)
  headers.set('X-User-Name', user.name)
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(code))
  return stub.fetch(new Request(c.req.raw, { headers }))
})
