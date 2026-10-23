import type { Env } from '../types'

/** Tells the laptop agent (if connected) that a job just became claimable. Fire and forget. */
export function wakeAgent(env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): void {
  const hub = env.AGENT_HUB.get(env.AGENT_HUB.idFromName('main'))
  ctx.waitUntil(hub.fetch('https://hub/wake', { method: 'POST' }).then(() => undefined, () => undefined))
}

export interface HubStatus {
  connected: boolean
  agentId: string | null
  version: string | null
  onHomeWifi: boolean
  currentJobId: string | null
  lastSeen: number | null
}

export async function agentStatus(env: Env): Promise<HubStatus | null> {
  try {
    const res = await env.AGENT_HUB.get(env.AGENT_HUB.idFromName('main')).fetch('https://hub/status')
    return (await res.json()) as HubStatus
  } catch {
    return null
  }
}
