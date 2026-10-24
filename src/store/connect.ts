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
  /** Not connected right now (the app is in the background or closed). */
  away?: boolean
  /** When it was last connected (ms since 1970). */
  seen?: number
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
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return `${base} ${installed ? '(app)' : '(browser)'}`
}

interface ConnectState {
  id: string
  name: string
  kind: string
  devices: Device[]
  /** The device being controlled from this one (null: this device plays). */
  remoteId: string | null
  /** A device that follows this one (and the other way round) while both play together. */
  linkedId: string | null
  /** Play together with another device, or go back to playing separately. */
  toggleSync: (deviceId: string) => void
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
  linkedId: null,

  toggleSync: (deviceId) => {
    const p = usePlayer.getState()
    if (get().linkedId === deviceId) {
      sendLive({ type: 'cmd', to: deviceId, cmd: 'unlink', payload: null })
      set({ linkedId: null })
      useUi.getState().showToast('Playing separately')
      return
    }
    set({ linkedId: deviceId })
    sendLive({ type: 'cmd', to: deviceId, cmd: 'link', payload: null })
    // The other device joins in with the same song and position.
    if (p.queue.length) {
      const from = Math.max(0, p.index - 1)
      sendLive({ type: 'cmd', to: deviceId, cmd: 'play', payload: { songs: p.queue.slice(from, from + 40), index: p.index - from, position: p.time, playing: p.playing } })
    }
    useUi.getState().showToast('Playing together')
  },

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

/** Commands that arrive from the partner must not be echoed back to it. */
let quietUntil = 0
let playTimer: ReturnType<typeof setTimeout> | undefined

function handle(e: Cmd) {
  quietUntil = Date.now() + 1800
  const p = usePlayer.getState()
  const payload = (e.payload ?? {}) as Record<string, unknown>
  switch (e.cmd) {
    case 'play': {
      const songs = payload.songs as Song[] | undefined
      if (!songs?.length) return
      const want = songs[Number(payload.index) || 0]
      const at0 = Number(payload.position) || 0
      if (want && p.queue[p.index]?.id === want.id) {
        // Already on this song: only line up the position and the play/pause state, never restart it.
        if (Math.abs(p.time - at0) > 3) p.seek(at0)
        if (typeof payload.playing === 'boolean' && payload.playing !== p.playing) p.toggle()
        useConnect.setState({ remoteId: null })
        break
      }
      // Songs sent over the wire keep their ids; rebuild the stream and cover links for this device.
      p.playQueue(songs.map((s) => ({ ...s, src: useLibrary.getState().songs.find((x) => x.id === s.id)?.src ?? s.src })), Number(payload.index) || 0)
      const at = Number(payload.position) || 0
      if (at > 1) setTimeout(() => usePlayer.getState().seek(at), 600)
      if (payload.playing === false) setTimeout(() => usePlayer.getState().playing && usePlayer.getState().toggle(), 900)
      useConnect.setState({ remoteId: null })
      break
    }
    case 'toggle':
      p.toggle()
      break
    case 'setPlaying':
      if (Boolean(payload.playing) !== p.playing) p.toggle()
      break
    case 'link':
      useConnect.setState({ linkedId: e.from })
      break
    case 'unlink':
      useConnect.setState({ linkedId: null })
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
    const changed = a?.id !== b?.id || s.playing !== prev.playing
    if (changed) publish(true)

    // Playing together: whatever happens here (song, pause or play, a jump in the song) happens on the partner too.
    const link = useConnect.getState().linkedId
    if (!link || Date.now() < quietUntil) return
    if (a?.id !== b?.id && a) {
      const from = Math.max(0, s.index - 1)
      sendLive({ type: 'cmd', to: link, cmd: 'play', payload: { songs: s.queue.slice(from, from + 40), index: s.index - from, position: 0, playing: s.playing } })
    } else if (s.playing !== prev.playing) {
      // Brief pauses are not the user's doing: a song ending, the network stalling, a call interrupting. Only a pause or
      // play that is still true a moment later, and not at the very end of a song, is passed on.
      const want = s.playing
      const nearEnd = s.duration > 0 && s.duration - s.time < 2.5
      if (!nearEnd) {
        clearTimeout(playTimer)
        playTimer = setTimeout(() => {
          const now = usePlayer.getState()
          const link2 = useConnect.getState().linkedId
          if (link2 && now.playing === want && Date.now() >= quietUntil) sendLive({ type: 'cmd', to: link2, cmd: 'setPlaying', payload: { playing: want } })
        }, 700)
      }
    } else if (Math.abs(s.time - prev.time) > 3 && a?.id === b?.id) {
      sendLive({ type: 'cmd', to: link, cmd: 'seek', payload: { position: s.time } })
    }
  })
  setInterval(() => {
    if (usePlayer.getState().playing) publish(true)
  }, 10000)
}
