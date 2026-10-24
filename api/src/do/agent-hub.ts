import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'

export interface HubStatus {
  connected: boolean
  agentId: string | null
  version: string | null
  onHomeWifi: boolean
  currentJobId: string | null
  lastSeen: number | null
}

interface Stored {
  agentId: string
  version: string | null
  onHomeWifi: boolean
  currentJobId: string | null
  lastSeen: number
}

export interface Progress {
  jobId: string
  stage: string
  progress: number
  etaSec: number | null
  speedBps: number | null
  at: number
}

/** What the Worker and the laptop agent push to every open app. Nothing here touches the database. */
export type LiveEvent =
  | { type: 'progress'; jobId: string; stage: string; progress: number; etaSec: number | null; speedBps: number | null }
  | { type: 'job'; id: string; status: string; songId?: string | null; error?: string | null }
  | { type: 'hint'; topic: 'requests' | 'library' | 'agent' | 'lyrics' | 'artists' | 'users' | 'invites' }

const STAGES = ['starting', 'downloading', 'converting', 'uploading', 'saving']
const STALE_MS = 3 * 60 * 1000

/**
 * One Durable Object for everything "live":
 *  - the laptop agent's outbound WebSocket (tag `agent`): the Worker sends `{type:'wake'}` the moment a job is
 *    claimable, and the agent streams download progress back over it;
 *  - every open app's WebSocket (tag `client`): changes and progress are pushed to them, so no page ever polls.
 * Sockets are hibernatable, so an idle connection costs nothing. Live progress lives only in memory.
 */
export class AgentHub extends DurableObject<Env> {
  private progress = new Map<string, Progress>()

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname

    if (path === '/wake') {
      const sockets = this.ctx.getWebSockets('agent')
      for (const ws of sockets) ws.send(JSON.stringify({ type: 'wake' }))
      return Response.json({ notified: sockets.length })
    }
    if (path === '/status') return Response.json(await this.status())
    if (path === '/emit') {
      this.emit((await request.json()) as LiveEvent)
      return Response.json({ ok: true })
    }
    if (path === '/progress') return Response.json(this.snapshot())

    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    if (request.headers.get('X-Live') === '1') {
      const user = (request.headers.get('X-User') ?? '').slice(0, 64)
      this.ctx.acceptWebSocket(server, user ? ['client', `u:${user}`] : ['client'])
      return new Response(null, { status: 101, webSocket: client })
    }

    // One agent at a time: a new connection (laptop restarted, network changed) replaces the old one.
    for (const old of this.ctx.getWebSockets('agent')) old.close(1000, 'replaced by a newer connection')
    this.ctx.acceptWebSocket(server, ['agent'])
    return new Response(null, { status: 101, webSocket: client })
  }

  private snapshot(): Record<string, Progress> {
    const now = Date.now()
    for (const [id, p] of this.progress) if (now - p.at > STALE_MS) this.progress.delete(id)
    return Object.fromEntries(this.progress)
  }

  private emit(event: LiveEvent): void {
    if (event.type === 'progress') {
      this.progress.set(event.jobId, { ...event, at: Date.now() })
    } else if (event.type === 'job' && event.status !== 'downloading' && event.status !== 'uploading') {
      this.progress.delete(event.id)
    }
    const text = JSON.stringify(event)
    for (const ws of this.ctx.getWebSockets('client')) {
      try {
        ws.send(text)
      } catch {
        // closed while sending; the runtime drops it
      }
    }
  }

  /** Devices that connected before but are not connected right now (a phone with the app in the background). */
  private async known(userTag: string): Promise<Record<string, { name: string; kind: string; seen: number }>> {
    return (await this.ctx.storage.get<Record<string, { name: string; kind: string; seen: number }>>(`dev:${userTag}`)) ?? {}
  }

  private async remember(userTag: string, id: string, name: string, kind: string): Promise<void> {
    const all = await this.known(userTag)
    const week = Date.now() - 7 * 86400000
    for (const k of Object.keys(all)) if (all[k].seen < week) delete all[k]
    all[id] = { name, kind, seen: Date.now() }
    await this.ctx.storage.put(`dev:${userTag}`, all)
  }

  /** One entry per device: connected ones with what they play, plus ones that are away right now. */
  private async devicesOf(userTag: string, except?: WebSocket) {
    const live = new Map<string, { id: string; name: string; kind: string; state: unknown; away: boolean }>()
    for (const s of this.ctx.getWebSockets(userTag)) {
      if (s === except) continue
      const a = s.deserializeAttachment() as { id?: string; name?: string; kind?: string; state?: unknown } | null
      if (a?.id) live.set(a.id, { id: a.id, name: a.name ?? 'Device', kind: a.kind ?? 'web', state: a.state ?? null, away: false })
    }
    const known = await this.known(userTag)
    for (const [id, k] of Object.entries(known)) {
      if (!live.has(id)) live.set(id, { id, name: k.name, kind: k.kind, state: null, away: true })
    }
    return [...live.values()]
  }

  private async tellDevices(userTag: string, except?: WebSocket): Promise<void> {
    const text = JSON.stringify({ type: 'devices', devices: await this.devicesOf(userTag, except) })
    for (const s of this.ctx.getWebSockets(userTag)) {
      if (s === except) continue
      try {
        s.send(text)
      } catch {
        // closing
      }
    }
  }

  /** Messages from an app: it introduces itself, shares what it is playing, and sends commands to its other devices. */
  private async handleClient(ws: WebSocket, userTag: string, message: string): Promise<void> {
    let msg: { type?: string; id?: string; name?: string; kind?: string; state?: unknown; to?: string; cmd?: string; payload?: unknown }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    const mine = (ws.deserializeAttachment() as { id?: string; name?: string; kind?: string; state?: unknown } | null) ?? {}

    if (msg.type === 'hello' && typeof msg.id === 'string') {
      const id = msg.id.slice(0, 40)
      // A reload or reconnect of the same device replaces its older connection (and drops its listing right away).
      for (const s of this.ctx.getWebSockets(userTag)) {
        if (s !== ws && (s.deserializeAttachment() as { id?: string } | null)?.id === id) {
          s.serializeAttachment({})
          s.close(1000, 'replaced')
        }
      }
      const name = String(msg.name ?? 'Device').slice(0, 40)
      const kind = String(msg.kind ?? 'web').slice(0, 12)
      ws.serializeAttachment({ id, name, kind, state: null })
      await this.remember(userTag, id, name, kind)
      await this.tellDevices(userTag)
      // Something was sent to this device while it was away: hand it over now (if it is still fresh).
      const pend = await this.ctx.storage.get<{ text: string; at: number }>(`pend:${userTag}:${id}`)
      if (pend) {
        await this.ctx.storage.delete(`pend:${userTag}:${id}`)
        if (Date.now() - pend.at < 5 * 60000) ws.send(pend.text)
      }
      return
    }
    if (!mine.id) return

    if (msg.type === 'state') {
      ws.serializeAttachment({ ...mine, state: msg.state ?? null })
      await this.tellDevices(userTag)
      return
    }
    if (msg.type === 'rename' && typeof msg.name === 'string') {
      const name = msg.name.slice(0, 40)
      ws.serializeAttachment({ ...mine, name })
      await this.remember(userTag, mine.id, name, mine.kind ?? 'web')
      await this.tellDevices(userTag)
      return
    }
    if (msg.type === 'cmd' && typeof msg.to === 'string' && typeof msg.cmd === 'string') {
      const text = JSON.stringify({ type: 'cmd', from: mine.id, fromName: mine.name, cmd: msg.cmd.slice(0, 20), payload: msg.payload ?? null })
      let delivered = false
      for (const s of this.ctx.getWebSockets(userTag)) {
        if ((s.deserializeAttachment() as { id?: string } | null)?.id === msg.to) {
          try {
            s.send(text)
            delivered = true
          } catch {
            // closing
          }
        }
      }
      // The device is away (app in the background): keep a "play" for it, delivered when the app opens again.
      if (!delivered && msg.cmd === 'play') await this.ctx.storage.put(`pend:${userTag}:${msg.to}`, { text, at: Date.now() })
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    const tags = this.ctx.getTags(ws)
    const userTag = tags.find((t) => t.startsWith('u:'))
    if (userTag && tags.includes('client')) return await this.handleClient(ws, userTag, message)
    // Other apps only listen. Only the agent talks back.
    if (!tags.includes('agent')) return

    let msg: { type?: string; agentId?: string; version?: string; onHomeWifi?: boolean; jobId?: string | null; stage?: string; progress?: number; etaSec?: number | null; speedBps?: number | null }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }

    if (msg.type === 'progress') {
      const jobId = String(msg.jobId ?? '')
      if (!jobId || !STAGES.includes(msg.stage ?? '')) return
      this.emit({
        type: 'progress',
        jobId,
        stage: msg.stage as string,
        progress: Math.max(0, Math.min(1, Number(msg.progress) || 0)),
        etaSec: Number.isFinite(msg.etaSec) ? Math.max(0, Math.round(msg.etaSec as number)) : null,
        speedBps: Number.isFinite(msg.speedBps) ? Math.max(0, Math.round(msg.speedBps as number)) : null,
      })
      return
    }

    if (msg.type === 'hello' || msg.type === 'status') {
      const before = await this.ctx.storage.get<Stored>('agent')
      const stored: Stored = {
        agentId: String(msg.agentId ?? 'laptop').slice(0, 60),
        version: msg.version ? String(msg.version).slice(0, 40) : null,
        onHomeWifi: !!msg.onHomeWifi,
        currentJobId: msg.jobId ?? null,
        lastSeen: Date.now(),
      }
      await this.ctx.storage.put('agent', stored)
      ws.send(JSON.stringify({ type: 'ack' }))
      // Admin screens show whether the laptop is online and on home Wi-Fi: tell them when that changes.
      if (msg.type === 'hello' || before?.onHomeWifi !== stored.onHomeWifi) this.emit({ type: 'hint', topic: 'agent' })
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1005/1006 are reserved for "no status" and cannot be sent back in a close frame.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
    } catch {
      // already closed
    }
    const tags = this.ctx.getTags(ws)
    if (tags.includes('agent')) this.emit({ type: 'hint', topic: 'agent' })
    const userTag = tags.find((t) => t.startsWith('u:'))
    if (userTag) await this.tellDevices(userTag, ws)
  }

  private async status(): Promise<HubStatus> {
    const stored = await this.ctx.storage.get<Stored>('agent')
    return {
      connected: this.ctx.getWebSockets('agent').length > 0,
      agentId: stored?.agentId ?? null,
      version: stored?.version ?? null,
      onHomeWifi: stored?.onHomeWifi ?? false,
      currentJobId: stored?.currentJobId ?? null,
      lastSeen: stored?.lastSeen ?? null,
    }
  }
}
