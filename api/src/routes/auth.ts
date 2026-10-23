import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { requireUser } from '../auth'
import { base64Url, cookieOptions, createSession, destroySession, OAUTH_COOKIE, randomToken } from '../session'
import type { AppEnv, Env, Role } from '../types'
import { audit, getSetting } from '../util'

export const auth = new Hono<AppEnv>()

interface Profile {
  sub: string
  email: string
  emailVerified: boolean
  name: string
  picture?: string
}

type LoginResult = { ok: true; userId: string } | { ok: false; error: string }

const DEFAULT_LIMITS: Record<Role, { daily: number; direct: number }> = {
  listener: { daily: 0, direct: 0 },
  member: { daily: 3, direct: 0 },
  trusted: { daily: 10, direct: 1 },
  admin: { daily: 50, direct: 1 },
}

const cleanInvite = (code: string | null | undefined) => (code ?? '').trim().toUpperCase().slice(0, 40)

/**
 * Shared by the Google callback and the dev-only login. Existing accounts (matched by Google id, then by
 * email) just sign in. New accounts need an unused, unexpired invite and a free seat under max_users.
 */
async function completeLogin(env: Env, profile: Profile, inviteCode: string): Promise<LoginResult> {
  if (!profile.emailVerified) return { ok: false, error: 'email_unverified' }
  const db = env.DB
  const email = profile.email.trim().toLowerCase()

  const existing = await db
    .prepare('SELECT id, disabled, google_sub FROM users WHERE google_sub = ?1 OR lower(email) = ?2 ORDER BY (google_sub = ?1) DESC LIMIT 1')
    .bind(profile.sub, email)
    .first<{ id: string; disabled: number; google_sub: string | null }>()

  if (existing) {
    if (existing.disabled) return { ok: false, error: 'account_disabled' }
    if (existing.google_sub && existing.google_sub !== profile.sub) return { ok: false, error: 'google_mismatch' }
    await db
      .prepare('UPDATE users SET google_sub = COALESCE(google_sub, ?), avatar_url = COALESCE(?, avatar_url), last_seen_at = datetime(\'now\') WHERE id = ?')
      .bind(profile.sub, profile.picture ?? null, existing.id)
      .run()
    return { ok: true, userId: existing.id }
  }

  if (!inviteCode) return { ok: false, error: 'invite_required' }
  const invite = await db
    .prepare("SELECT code, role, used_by, expires_at < datetime('now') AS expired FROM invites WHERE code = ?")
    .bind(inviteCode)
    .first<{ code: string; role: Role; used_by: string | null; expired: number | null }>()
  if (!invite) return { ok: false, error: 'invite_invalid' }
  if (invite.used_by) return { ok: false, error: 'invite_used' }
  if (invite.expired) return { ok: false, error: 'invite_expired' }

  const [count, max] = await Promise.all([db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(), getSetting(db, 'max_users', 30)])
  if ((count?.n ?? 0) >= max) return { ok: false, error: 'user_limit_reached' }

  const userId = crypto.randomUUID()
  const limits = DEFAULT_LIMITS[invite.role] ?? DEFAULT_LIMITS.member
  await db
    .prepare('INSERT INTO users (id, email, name, avatar_url, google_sub, role, can_request_direct, daily_request_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, email, profile.name.trim().slice(0, 80) || email.split('@')[0], profile.picture ?? null, profile.sub, invite.role, limits.direct, limits.daily)
    .run()

  // Claim the invite last; if someone else just used it, undo the account.
  const claimed = await db
    .prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code = ? AND used_by IS NULL")
    .bind(userId, invite.code)
    .run()
  if (!claimed.meta.changes) {
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
    return { ok: false, error: 'invite_used' }
  }

  await audit(db, userId, 'user.signup', userId, { invite: invite.code, role: invite.role })
  return { ok: true, userId }
}

const toLogin = (env: Env, error?: string, invite?: string) => {
  const q = new URLSearchParams()
  if (error) q.set('error', error)
  if (invite) q.set('invite', invite)
  const qs = q.toString()
  return `${env.PUBLIC_URL}/login${qs ? `?${qs}` : ''}`
}

// ---------- Is this invite usable? (lets the login page tell people early) ----------
auth.get('/invite/:code', async (c) => {
  const code = cleanInvite(c.req.param('code'))
  const row = await c.env.DB.prepare("SELECT used_by, expires_at < datetime('now') AS expired FROM invites WHERE code = ?")
    .bind(code)
    .first<{ used_by: string | null; expired: number | null }>()
  const valid = !!row && !row.used_by && !row.expired
  return c.json({ valid })
})

// ---------- Google OAuth (authorization code + PKCE) ----------
auth.get('/google/start', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.redirect(toLogin(c.env, 'google_not_configured'))

  const invite = cleanInvite(c.req.query('invite'))
  const state = randomToken(24)
  const verifier = randomToken(48)
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')"),
    c.env.DB.prepare('INSERT INTO oauth_states (state, code_verifier, invite) VALUES (?, ?, ?)').bind(state, verifier, invite || null),
  ])
  setCookie(c, OAUTH_COOKIE, state, cookieOptions(c.env, 600))

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${c.env.PUBLIC_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return c.redirect(url.toString())
})

auth.get('/google/callback', async (c) => {
  const env = c.env
  const state = c.req.query('state') ?? ''
  const code = c.req.query('code') ?? ''
  const cookieState = getCookie(c, OAUTH_COOKIE)
  deleteCookie(c, OAUTH_COOKIE, { path: '/' })

  if (c.req.query('error')) return c.redirect(toLogin(env, 'google_denied'))
  if (!state || !code || !cookieState || cookieState !== state) return c.redirect(toLogin(env, 'google_failed'))

  const row = await env.DB.prepare("SELECT code_verifier, invite FROM oauth_states WHERE state = ? AND created_at > datetime('now', '-10 minutes')")
    .bind(state)
    .first<{ code_verifier: string; invite: string | null }>()
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run()
  if (!row) return c.redirect(toLogin(env, 'google_failed'))

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${env.PUBLIC_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: row.code_verifier,
      }),
    })
    if (!tokenRes.ok) return c.redirect(toLogin(env, 'google_failed'))
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) return c.redirect(toLogin(env, 'google_failed'))

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })
    if (!infoRes.ok) return c.redirect(toLogin(env, 'google_failed'))
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string }
    if (!info.sub || !info.email) return c.redirect(toLogin(env, 'google_failed'))

    const result = await completeLogin(
      env,
      { sub: info.sub, email: info.email, emailVerified: info.email_verified === true, name: info.name ?? '', picture: info.picture },
      row.invite ?? '',
    )
    if (!result.ok) return c.redirect(toLogin(env, result.error, row.invite ?? undefined))

    await createSession(c, result.userId)
    return c.redirect(`${env.PUBLIC_URL}/`)
  } catch (e) {
    console.error(e)
    return c.redirect(toLogin(env, 'google_failed'))
  }
})

// ---------- Dev-only sign-in, so the invite and session logic can be exercised without Google ----------
auth.post('/dev-login', async (c) => {
  if (c.env.DEV_AUTH !== 'true') return c.json({ error: 'not_found' }, 404)
  const body = await c.req.json<{ email?: string; name?: string; invite?: string }>().catch(() => ({}) as { email?: string; name?: string; invite?: string })
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email.includes('@')) return c.json({ error: 'invalid_email' }, 400)

  const result = await completeLogin(
    c.env,
    { sub: `dev:${email}`, email, emailVerified: true, name: body.name ?? '' },
    cleanInvite(body.invite),
  )
  if (!result.ok) return c.json({ error: result.error }, 403)
  await createSession(c, result.userId)
  return c.json({ ok: true })
})

auth.post('/logout', requireUser, async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

