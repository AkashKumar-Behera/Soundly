/** Escape LIKE wildcards in user input; pair with `ESCAPE '\'` in the query. */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

export function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export async function getSetting(db: D1Database, key: string, fallback: number): Promise<number> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  const n = Number(row?.value)
  return Number.isFinite(n) ? n : fallback
}

export function audit(db: D1Database, actorId: string | null, action: string, target: string, detail?: unknown) {
  return db
    .prepare('INSERT INTO audit_log (actor_id, action, target, detail) VALUES (?, ?, ?, ?)')
    .bind(actorId, action, target, detail === undefined ? null : JSON.stringify(detail))
    .run()
}

export function isPro(proUntil: string | null): boolean {
  return !!proUntil && new Date(proUntil.replace(' ', 'T') + (proUntil.includes('Z') ? '' : 'Z')).getTime() > Date.now()
}

/** Parses an HTTP Range header for a single range. `null` = no range, 'invalid' = unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, a, b] = m
  let start: number
  let end: number
  if (a === '' && b === '') return 'invalid'
  if (a === '') {
    const suffix = Number(b)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(a)
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

const memoStore = new Map<string, { at: number; value: unknown }>()
const sharedUrl = (key: string) => `https://memo.local/${encodeURIComponent(key)}`

/**
 * Remembers an expensive result for `ttlMs`. In memory per Worker instance, and with `shared` also in Cloudflare's
 * cache (one copy for every instance in the data centre), so a busy day does not recompute it on each instance.
 * This saves D1 row reads on hot, slow-changing numbers.
 */
export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { shared?: boolean } = {}): Promise<T> {
  const hit = memoStore.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T

  const cache = opts.shared && typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  if (cache) {
    try {
      const res = await cache.match(sharedUrl(key))
      if (res) {
        const value = (await res.json()) as T
        memoStore.set(key, { at: Date.now(), value })
        return value
      }
    } catch {
      // the shared cache is a bonus; fall through to the database
    }
  }

  const value = await load()
  memoStore.set(key, { at: Date.now(), value })
  if (cache) {
    try {
      await cache.put(sharedUrl(key), new Response(JSON.stringify(value), { headers: { 'Cache-Control': `max-age=${Math.max(1, Math.round(ttlMs / 1000))}`, 'Content-Type': 'application/json' } }))
    } catch {
      // ignore
    }
  }
  return value
}

/** Forgets cached results whose key starts with `prefix` (and the shared copy of that exact key). */
export function forget(prefix: string): void {
  for (const k of memoStore.keys()) if (k.startsWith(prefix)) memoStore.delete(k)
  try {
    const cache = (caches as unknown as { default?: Cache }).default
    void cache?.delete(sharedUrl(prefix))
  } catch {
    // ignore
  }
}
