import { create } from 'zustand'
import type { Song } from '../data/mock'
import { onLive, onLiveOpen, sendLive } from '../lib/live'
import { useLibrary } from './library'
import { usePlayer } from './player'
import { useUi } from './ui'

export interface DeviceState {
  playing: boolean
  title: string
  artist: string
  thumbUrl?: string
  songId: string
  position: number
  duration: number
  at: number
}
export interface Device {
  id: string
  name: string
  kind: string
  state: DeviceState | null
}

const ID_KEY = 'soundly.device-id'
const NAME_KEY = 'soundly.device-name'

function myId(): string {
  try {
    let id = localStorage.getItem(ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    return 'session-' + Math.random().toString(36).slice(2, 10)
  }
}

function guessKind(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return 'phone'
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet'
  if (/Android/.test(ua)) return 'phone'
  return 'computer'
}

function guessName(): string {
  const ua = navigator.userAgent
  const base = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'This device'
  return base
}

interface ConnectState {
  id: string
  name: string
  kind: string
  devices: Device[]
  /** The device being controlled from this one (null: this device plays). */
  remoteId: string | null
  setName: (name: string) => void
  /** Plays what is queued here on another device. */
  playOn: (deviceId: string) => void
  /** Brings playback from another device back to this one. */
  playHere: (deviceId: string) => void
  control: (deviceId: string, cmd: 'toggle' | 'next' | 'prev' | 'seek' | 'volume', payload?: unknown) => void
}

export const useConnect = create<ConnectState>((set, get) => ({
  id: myId(),
  name: (() => {
    try {
      return localStorage.getItem(NAME_KEY) || guessName()
    } catch {
      return guessName()
    }
  })(),
  kind: guessKind(),
  devices: [],
  remoteId: null,

  setName: (name) => {
    const clean = name.trim().slice(0, 40) || guessName()
    try {
      localStorage.setItem(NAME_KEY, clean)
    } catch {
      /* private mode */
    }
    set({ name: clean })
    sendLive({ type: 'rename', name: clean })
  },

  playOn: (deviceId) => {
    const p = usePlayer.getState()
    if (!p.queue.length) return useUi.getState().showToast('Play something first, then pick a device')
    const from = Math.max(0, p.index - 1)
    const songs = p.queue.slice(from, from + 40)
    sendLive({ type: 'cmd', to: deviceId, cmd: 'play', payload: { songs, index: p.index - from, position: p.time, playing: true } })
    if (p.playing) p.toggle() // the music moves to the other device
    set({ remoteId: deviceId })
    useUi.getState().showToast('Playing on ' + (get().devices.find((d) => d.id === deviceId)?.name ?? 'that device'))
  },

  playHere: (deviceId) => {
    sendLive({ type: 'cmd', to: deviceId, cmd: 'handoff', payload: null })
    set({ remoteId: null })
  },

  control: (deviceId, cmd, payload) => sendLive({ type: 'cmd', to: deviceId, cmd, payload: payload ?? null }),
}))

const snapshot = (): DeviceState | null => {
  const p = usePlayer.getState()
  const s = p.queue[p.index] as Song | undefined
  if (!s) return null
  return { playing: p.playing, title: s.title, artist: s.artist, thumbUrl: s.thumbUrl, songId: s.id, position: Math.floor(p.time), duration: Math.floor(p.duration || s.duration), at: Date.now() }
}

let lastKey = ''
let lastSent = 0
function publish(force = false) {
  const st = snapshot()
  const key = st ? `${st.songId}|${st.playing}` : ''
  const now = Date.now()
  if (!force && key === lastKey && now - lastSent < 6000) return
  if (!force && !st && !lastKey) return
  lastKey = key
  lastSent = now
  sendLive({ type: 'state', state: st })
}

type Cmd = { type: 'cmd'; from: string; cmd: string; payload: unknown }

function handle(e: Cmd) {
  const p = usePlayer.getState()
  const payload = (e.payload ?? {}) as Record<string, unknown>
  switch (e.cmd) {
    case 'play': {
      const songs = payload.songs as Song[] | undefined
      if (!songs?.length) return
      // Songs sent over the wire keep their ids; rebuild the stream and cover links for this device.
      p.playQueue(songs.map((s) => ({ ...s, src: useLibrary.getState().songs.find((x) => x.id === s.id)?.src ?? s.src })), Number(payload.index) || 0)
      const at = Number(payload.position) || 0
      if (at > 1) setTimeout(() => usePlayer.getState().seek(at), 600)
      useConnect.setState({ remoteId: null })
      break
    }
    case 'toggle':
      p.toggle()
      break
    case 'next':
      p.next()
      break
    case 'prev':
      p.prev()
      break
    case 'seek':
      p.seek(Number(payload.position) || 0)
      break
    case 'volume':
      p.setVolume(Math.max(0, Math.min(1, Number(payload.volume) || 0)))
      break
    case 'handoff': {
      // Someone wants the music on their device: send them the queue and where we are, then stop here.
      const from = Math.max(0, p.index - 1)
      sendLive({ type: 'cmd', to: e.from, cmd: 'play', payload: { songs: p.queue.slice(from, from + 40), index: p.index - from, position: p.time, playing: true } })
      if (p.playing) p.toggle()
      break
    }
  }
  setTimeout(() => publish(true), 400)
}

let wired = false
/** Starts sharing this device with the user's other devices. Called once when the app is signed in. */
export function startConnect() {
  if (wired) return
  wired = true
  const hello = () => {
    const c = useConnect.getState()
    sendLive({ type: 'hello', id: c.id, name: c.name, kind: c.kind })
    publish(true)
  }
  onLiveOpen(hello)
  hello()
  onLive((e) => {
    const ev = e as unknown as { type: string; devices?: Device[]; from: string; cmd: string; payload: unknown }
    if (ev.type === 'devices') {
      const c = useConnect.getState()
      useConnect.setState({ devices: (ev.devices ?? []).filter((d) => d.id !== c.id) })
    } else if (ev.type === 'cmd') handle(ev as Cmd)
  })
  // Share what is playing, and keep the position fresh while it plays.
  usePlayer.subscribe((s, prev) => {
    const a = s.queue[s.index]
    const b = prev.queue[prev.index]
    if (a?.id !== b?.id || s.playing !== prev.playing) publish(true)
  })
  setInterval(() => {
    if (usePlayer.getState().playing) publish(true)
  }, 10000)
}
