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

/**
 * Push channel to the laptop agent. The agent opens an outbound WebSocket (nothing on the laptop is exposed) and
 * the Worker sends `{type:'wake'}` the moment a job becomes claimable, so the agent never has to poll. The
 * WebSocket is hibernatable: an idle connection costs nothing until a message arrives.
 */
export class AgentHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname

    if (path === '/wake') {
      const sockets = this.ctx.getWebSockets()
      for (const ws of sockets) ws.send(JSON.stringify({ type: 'wake' }))
      return Response.json({ notified: sockets.length })
    }
    if (path === '/status') return Response.json(await this.status())

    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })

    // One agent at a time: a new connection (laptop restarted, network changed) replaces the old one.
    for (const old of this.ctx.getWebSockets()) old.close(1000, 'replaced by a newer connection')
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let msg: { type?: string; agentId?: string; version?: string; onHomeWifi?: boolean; jobId?: string | null }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (msg.type === 'hello' || msg.type === 'status') {
      const stored: Stored = {
        agentId: String(msg.agentId ?? 'laptop').slice(0, 60),
        version: msg.version ? String(msg.version).slice(0, 40) : null,
        onHomeWifi: !!msg.onHomeWifi,
        currentJobId: msg.jobId ?? null,
        lastSeen: Date.now(),
      }
      await this.ctx.storage.put('agent', stored)
      ws.send(JSON.stringify({ type: 'ack' }))
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1005/1006 are reserved for "no status" and cannot be sent back in a close frame.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
    } catch {
      // already closed
    }
  }

  private async status(): Promise<HubStatus> {
    const stored = await this.ctx.storage.get<Stored>('agent')
    return {
      connected: this.ctx.getWebSockets().length > 0,
      agentId: stored?.agentId ?? null,
      version: stored?.version ?? null,
      onHomeWifi: stored?.onHomeWifi ?? false,
      currentJobId: stored?.currentJobId ?? null,
      lastSeen: stored?.lastSeen ?? null,
    }
  }
}
