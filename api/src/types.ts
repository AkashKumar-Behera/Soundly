export interface Env {
  DB: D1Database
  SONGS: R2Bucket
  DEV_AUTH: string
  ALLOWED_ORIGIN: string
  AGENT_TOKEN: string
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
