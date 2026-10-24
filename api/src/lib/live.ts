import type { LiveEvent, Progress } from '../do/agent-hub'
import type { Env } from '../types'

type Ctx = { waitUntil(promise: Promise<unknown>): void }

const hub = (env: Env) => env.AGENT_HUB.get(env.AGENT_HUB.idFromName('main'))

/** Pushes an event to every open app. Fire and forget; it never reads or writes the database. */
export function emit(env: Env, ctx: Ctx, event: LiveEvent): void {
  ctx.waitUntil(
    hub(env)
      .fetch('https://hub/emit', { method: 'POST', body: JSON.stringify(event) })
      .then(() => undefined, () => undefined),
  )
}

/** Live download progress (only in memory), merged into job lists so a freshly opened page is already up to date. */
export async function liveProgress(env: Env): Promise<Record<string, Progress>> {
  try {
    const res = await hub(env).fetch('https://hub/progress')
    return (await res.json()) as Record<string, Progress>
  } catch {
    return {}
  }
}
