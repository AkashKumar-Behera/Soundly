export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api'

const DEV_USER_KEY = 'soundly-dev-user'

/** True once the API proved unreachable; the app then runs on bundled demo data. */
let demo = false
export const isDemo = () => demo
export const setDemo = (value: boolean) => {
  demo = value
}

// Phase 2 only: acts as a seeded user through the X-Dev-User header. Phase 3 replaces this with real sessions.
export function getDevUser(): string | null {
  try {
    return localStorage.getItem(DEV_USER_KEY)
  } catch {
    return null
  }
}
export function setDevUser(email: string | null) {
  try {
    if (email) localStorage.setItem(DEV_USER_KEY, email)
    else localStorage.removeItem(DEV_USER_KEY)
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

export const streamUrl = (id: string) => `${API_BASE}/stream/${id}`
export const thumbUrl = (id: string) => `${API_BASE}/thumb/${id}`

export function logPlay(songId: string, seconds: number) {
  if (demo) return
  void api('/plays', { method: 'POST', body: { songId, seconds } }).catch(() => {})
}
