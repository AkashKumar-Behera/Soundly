import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  hue: number
  hue2: number
  thumb: boolean
}

export interface RoomState {
  v: number
  queue: Track[]
  index: number
  playing: boolean
  /** Playback position in seconds at server time `at` (ms). While playing, "now" is pos + (now - at) / 1000. */
  pos: number
  at: number
}

interface Member {
  id: string
  name: string
}

const MAX_MEMBERS = 12
const MAX_QUEUE = 300
const IDLE_MS = 6 * 3600 * 1000

const ID = /^[\w-]{1,64}$/
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '')

function toTrack(raw: unknown): Track | null {
  const t = raw as Partial<Track> | null
  if (!t || typeof t.id !== 'string' || !ID.test(t.id)) return null
  return {
    id: t.id,
    title: clean(t.title, 200),
    artist: clean(t.artist, 120),
    album: clean(t.album, 120),
    duration: Math.max(0, Math.min(Number(t.duration) || 0, 36000)),
    hue: Math.floor(Number(t.hue) || 0) % 360,
    hue2: Math.floor(Number(t.hue2) || 0) % 360,
    thumb: !!t.thumb,
  }
}

/**
 * One listening room. Everyone in it can control playback; the server keeps a single authoritative state
 * (queue, index, playing, position at a server timestamp) and broadcasts every change. Clients compute the live
 * position from that timestamp and correct drift, so the room stays in sync without a host.
 */
export class Room extends DurableObject<Env> {
  private state: RoomState | null = null

  private async load(): Promise<RoomState> {
    if (!this.state) this.state = (await this.ctx.storage.get<RoomState>('state')) ?? { v: 0, queue: [], index: -1, playing: false, pos: 0, at: Date.now() }
    return this.state
  }

  private async save(next: RoomState) {
    this.state = next
    await this.ctx.storage.put('state', next)
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS)
  }

  private members(): Member[] {
    const seen = new Map<string, Member>()
    for (const ws of this.ctx.getWebSockets()) {
      const m = ws.deserializeAttachment() as Member | null
      if (m) seen.set(m.id, m)
    }
    return [...seen.values()]
  }

  private broadcast(message: unknown) {
    const text = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) ws.send(text)
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    if (this.ctx.getWebSockets().length >= MAX_MEMBERS) return new Response('Room is full', { status: 429 })

    const member: Member = { id: request.headers.get('X-User-Id') ?? 'anon', name: (request.headers.get('X-User-Name') ?? 'Listener').slice(0, 60) }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(member)

    const state = await this.load()
    server.send(JSON.stringify({ type: 'state', state, serverNow: Date.now() }))
    this.broadcast({ type: 'members', members: this.members() })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t, serverNow: Date.now() }))
      return
    }

    const s = { ...(await this.load()) }
    const now = Date.now()
    const position = Math.max(0, Number(msg.position) || 0)
    let changed = true

    switch (msg.type) {
      case 'play': {
        const queue = (Array.isArray(msg.queue) ? msg.queue : []).map(toTrack).filter((t): t is Track => !!t).slice(0, MAX_QUEUE)
        const index = Math.floor(Number(msg.index) || 0)
        if (!queue.length || index < 0 || index >= queue.length) return
        Object.assign(s, { queue, index, playing: true, pos: 0, at: now })
        break
      }
      case 'toggle':
        if (s.index < 0) return
        Object.assign(s, { playing: !!msg.playing, pos: position, at: now })
        break
      case 'seek':
        if (s.index < 0) return
        Object.assign(s, { pos: position, at: now })
        break
      case 'jump': {
        const index = Math.floor(Number(msg.index))
        if (!Number.isFinite(index) || index < 0 || index >= s.queue.length) return
        Object.assign(s, { index, playing: true, pos: 0, at: now })
        break
      }
      case 'next': {
        // Every client reports "my song ended" at about the same moment; only the first one advances the room.
        if (Number(msg.from) !== s.index) {
          changed = false
          break
        }
        if (s.index + 1 < s.queue.length) Object.assign(s, { index: s.index + 1, playing: true, pos: 0, at: now })
        else Object.assign(s, { playing: false, pos: 0, at: now })
        break
      }
      case 'enqueue': {
        const track = toTrack(msg.track)
        if (!track || s.queue.length >= MAX_QUEUE) return
        s.queue = [...s.queue, track]
        if (s.index < 0) Object.assign(s, { index: 0, playing: true, pos: 0, at: now })
        break
      }
      default:
        return
    }

    if (!changed) {
      ws.send(JSON.stringify({ type: 'state', state: s, serverNow: now }))
      return
    }
    s.v += 1
    await this.save(s)
    this.broadcast({ type: 'state', state: s, serverNow: now })
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1005/1006 are reserved for "no status" and cannot be sent back in a close frame.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason)
    } catch {
      // already closed
    }
    this.announceMembers(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.announceMembers(ws)
  }

  /** Tell everyone who is still here (the socket that just went away may still be listed, so skip it). */
  private announceMembers(gone: WebSocket) {
    const seen = new Map<string, Member>()
    for (const other of this.ctx.getWebSockets()) {
      if (other === gone) continue
      try {
        const m = other.deserializeAttachment() as Member | null
        if (m) seen.set(m.id, m)
      } catch {
        // socket closed meanwhile
      }
    }
    const text = JSON.stringify({ type: 'members', members: [...seen.values()] })
    for (const other of this.ctx.getWebSockets()) {
      if (other === gone) continue
      try {
        other.send(text)
      } catch {
        // ignore a socket that is closing
      }
    }
  }

  /** Nobody touched the room for 6 hours: drop it. */
  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'room expired')
    await this.ctx.storage.deleteAll()
    this.state = null
  }
}
