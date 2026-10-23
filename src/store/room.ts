import { create } from 'zustand'
import { API_BASE, api, getDevUser, streamUrl, thumbUrl } from '../api/client'
import type { Song } from '../data/mock'
import { setRoomHook, usePlayer } from './player'
import type { RoomAction } from './player'
import { useUi } from './ui'

interface Track {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  hue: number
  hue2: number
  thumb: boolean
}

interface SharedState {
  v: number
  queue: Track[]
  index: number
  playing: boolean
  pos: number
  at: number
}

export interface Member {
  id: string
  name: string
}

interface RoomStore {
  code: string | null
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting'
  members: Member[]
  /** The browser blocked autoplay for the room's music; one tap starts it. */
  needsTap: boolean
  create: () => Promise<string | null>
  join: (code: string) => void
  leave: () => void
  tapToPlay: () => void
}

const toTrack = (s: Song): Track => ({ id: s.id, title: s.title, artist: s.artist, album: s.album, duration: s.duration, hue: s.hue, hue2: s.hue2, thumb: !!s.thumbUrl })
const toSong = (t: Track): Song => ({ ...t, src: streamUrl(t.id), thumbUrl: t.thumb ? thumbUrl(t.id) : undefined })

let socket: WebSocket | null = null
let intentional = false
let attempts = 0
let offset = 0 // serverNow - clientNow, refined by ping round trips (smallest round trip wins)
let bestRtt = Infinity
let shared: SharedState | null = null
let driftTimer: ReturnType<typeof setInterval> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

const serverNow = () => Date.now() + offset

function socketUrl(code: string): string {
  const base = API_BASE.startsWith('http') ? API_BASE : `${location.origin}${API_BASE}`
  const url = new URL(`${base}/rooms/${code}/ws`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const dev = getDevUser() // browsers cannot set headers on a WebSocket; the dev server accepts it as a query
  if (dev) url.searchParams.set('devUser', dev)
  return url.toString()
}

/** Where the shared track should be right now. */
function targetPosition(s: SharedState): number {
  return Math.max(0, s.playing ? s.pos + (serverNow() - s.at) / 1000 : s.pos)
}

function applyShared() {
  if (!shared) return
  usePlayer.getState().applyRoom(shared.queue.map(toSong), shared.index, shared.playing, targetPosition(shared), () => useRoom.setState({ needsTap: true }))
}

function startTimers() {
  stopTimers()
  // Keep everyone within a fraction of a second of the room, even after a stall or a slow device.
  driftTimer = setInterval(() => {
    if (!shared?.playing) return
    const p = usePlayer.getState()
    if (Math.abs(p.time - targetPosition(shared)) > 0.8) applyShared()
  }, 3000)
}

function stopTimers() {
  clearInterval(driftTimer)
  clearTimeout(retryTimer)
}

function ping(sock: WebSocket) {
  if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'ping', t: Date.now() }))
}

function connect(code: string) {
  const sock = new WebSocket(socketUrl(code))
  socket = sock

  sock.onopen = () => {
    attempts = 0
    useRoom.setState({ status: 'connected' })
    startTimers()
    // A few pings pick the lowest-latency estimate of the server clock.
    for (let i = 0; i < 4; i++) setTimeout(() => ping(sock), i * 400)
  }

  sock.onmessage = (event) => {
    let msg: { type: string; state?: SharedState; serverNow?: number; members?: Member[]; t?: number }
    try {
      msg = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (msg.type === 'state' && msg.state) {
      if (msg.serverNow && bestRtt === Infinity) offset = msg.serverNow - Date.now() // rough until a ping lands
      shared = msg.state
      applyShared()
    } else if (msg.type === 'members' && msg.members) {
      useRoom.setState({ members: msg.members })
    } else if (msg.type === 'pong' && msg.serverNow && msg.t) {
      const rtt = Date.now() - msg.t
      if (rtt < bestRtt) {
        bestRtt = rtt
        offset = msg.serverNow + rtt / 2 - Date.now()
      }
    }
  }

  sock.onclose = () => {
    if (intentional || socket !== sock) return
    stopTimers()
    if (attempts >= 6) {
      useUi.getState().showToast('Lost connection to the room')
      useRoom.getState().leave()
      return
    }
    attempts++
    useRoom.setState({ status: 'reconnecting' })
    retryTimer = setTimeout(() => connect(code), Math.min(1000 * attempts, 5000))
  }
}

function send(action: RoomAction) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    useUi.getState().showToast('Reconnecting to the room…')
    return
  }
  const out = (() => {
    switch (action.kind) {
      case 'play':
        return { type: 'play', queue: action.songs.map(toTrack), index: action.index }
      case 'jump':
        return { type: 'jump', index: action.index }
      case 'toggle':
        return { type: 'toggle', playing: action.playing, position: action.position }
      case 'seek':
        return { type: 'seek', position: action.position }
      case 'next':
        return { type: 'next', from: action.from }
      case 'enqueue':
        return { type: 'enqueue', track: toTrack(action.song) }
    }
  })()
  socket.send(JSON.stringify(out))
}

export const useRoom = create<RoomStore>((set, get) => ({
  code: null,
  status: 'idle',
  members: [],
  needsTap: false,

  create: async () => {
    try {
      const r = await api<{ code: string }>('/rooms', { method: 'POST', body: {} })
      get().join(r.code)
      return r.code
    } catch {
      useUi.getState().showToast('Could not start a room')
      return null
    }
  },

  join: (raw) => {
    const code = raw.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return useUi.getState().showToast('That room code does not look right')
    if (get().code === code) return
    if (get().code) get().leave()
    intentional = false
    attempts = 0
    bestRtt = Infinity
    shared = null
    set({ code, status: 'connecting', members: [], needsTap: false })
    connect(code)
  },

  leave: () => {
    intentional = true
    stopTimers()
    socket?.close()
    socket = null
    shared = null
    set({ code: null, status: 'idle', members: [], needsTap: false })
  },

  tapToPlay: () => {
    set({ needsTap: false })
    usePlayer.getState().resume()
    applyShared()
  },
}))

setRoomHook({ active: () => !!useRoom.getState().code, send })
