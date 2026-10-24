export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api'

const DEV_USER_KEY = 'soundly-dev-user'

/** True once the API proved unreachable; the app then runs on bundled demo data. */
let demo = false
export const isDemo = () => demo
export const setDemo = (value: boolean) => {
  demo = value
}

// Local development only. The dev server can act as a seeded user through the X-Dev-User header. An empty value
// means "use the real session cookie", so the login flow can be tried locally. Production builds never send it.
export const DEV_ADMIN = 'akashkumar48874@gmail.com'

export function getDevUser(): string | null {
  if (!import.meta.env.DEV) return null
  try {
    const stored = localStorage.getItem(DEV_USER_KEY)
    return stored === null ? DEV_ADMIN : stored || null
  } catch {
    return DEV_ADMIN
  }
}
export function setDevUser(email: string) {
  try {
    localStorage.setItem(DEV_USER_KEY, email)
  } catch {
    // storage unavailable; the default dev user applies
  }
}

export class ApiError extends Error {
  status: number
  code: string
  data: Record<string, unknown>

  constructor(status: number, code: string, data: Record<string, unknown> = {}) {
    super(code)
    this.status = status
    this.code = code
    this.data = data
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const dev = getDevUser()
  if (dev) headers['X-Dev-User'] = dev

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = (isJson ? await res.json().catch(() => ({})) : null) as Record<string, unknown> | null

  // A static host answers unknown paths with index.html; treat that as "no API here".
  if (!isJson) throw new ApiError(res.status || 0, 'api_unavailable')
  if (!res.ok) throw new ApiError(res.status, String(data?.error ?? 'error'), data ?? {})
  return data as T
}

// <audio> and <img> cannot send headers. In production the session cookie authenticates them; the dev server
// (DEV_AUTH) takes the seeded user from the query string instead.
const devQuery = () => {
  const dev = getDevUser()
  return dev ? `?devUser=${encodeURIComponent(dev)}` : ''
}
export function liveUrl(): string {
  const base = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`
  return `${base.replace(/^http/, 'ws')}/live${devQuery()}`
}
export const streamUrl = (id: string) => `${API_BASE}/stream/${id}${devQuery()}`
export const thumbUrl = (id: string) => `${API_BASE}/thumb/${id}${devQuery()}`

export function logPlay(songId: string, seconds: number) {
  if (demo) return
  void api('/plays', { method: 'POST', body: { songId, seconds } }).catch(() => {})
}
