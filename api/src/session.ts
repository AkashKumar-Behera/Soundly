import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Env, User } from './types'
import { USER_COLUMNS } from './types'

export const SESSION_COOKIE = 'soundly_session'
export const OAUTH_COOKIE = 'soundly_oauth'
const SESSION_DAYS = 30

// Works with any route's context (with or without the `user` variable); `env` is typed explicitly below.
type Ctx = Context<any>

const enc = new TextEncoder()

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export const isHttps = (env: Env) => env.PUBLIC_URL.startsWith('https://')

export function cookieOptions(env: Env, maxAge: number) {
  return { httpOnly: true, secure: isHttps(env), sameSite: 'Lax' as const, path: '/', maxAge }
}

export async function createSession(c: Ctx, userId: string): Promise<void> {
  const env = c.env as Env
  const token = randomToken()
  const id = await sha256Hex(token)
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, datetime('now', ?), ?)").bind(
      id,
      userId,
      `+${SESSION_DAYS} days`,
      (c.req.header('User-Agent') ?? '').slice(0, 200),
    ),
  ])
  setCookie(c, SESSION_COOKIE, token, cookieOptions(env, SESSION_DAYS * 86400))
}

export async function userFromSession(c: Ctx): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  return (c.env as Env).DB.prepare(
    `SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime('now')`,
  )
    .bind(await sha256Hex(token))
    .first<User>()
}

export async function destroySession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await (c.env as Env).DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}
