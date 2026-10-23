export interface Env {
  DB: D1Database
  SONGS: R2Bucket
  DEV_AUTH: string
  /** Extra origins allowed to make state-changing calls (local dev servers). */
  ALLOWED_ORIGIN: string
  /** Where the app is served from, e.g. https://soundly-api.example.workers.dev (no trailing slash). */
  PUBLIC_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** YouTube Data API v3 key, a Wrangler secret. Without it, YouTube search answers 503. */
  YOUTUBE_API_KEY: string
  AGENT_TOKEN: string
  /** Push channel to the laptop agent (one instance, named "main"). */
  AGENT_HUB: DurableObjectNamespace
  /** Listening rooms, one instance per room code. */
  ROOM: DurableObjectNamespace
}

export type Role = 'listener' | 'member' | 'trusted' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  can_request_direct: number
  daily_request_limit: number
  pro_until: string | null
  disabled: number
}

export type AppEnv = { Bindings: Env; Variables: { user: User } }

export const USER_COLUMNS = 'u.id, u.email, u.name, u.role, u.can_request_direct, u.daily_request_limit, u.pro_until, u.disabled'
