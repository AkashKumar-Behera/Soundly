import { create } from 'zustand'
import { logPlay } from '../api/client'
import type { Song } from '../data/mock'
import { mediaArtwork, squareArtwork } from '../lib/artwork'
import { useUi } from './ui'

export type Repeat = 'off' | 'all' | 'one'

/** What the local user asked for while in a listening room: the room decides, then everyone (us included) applies it. */
export type RoomAction =
  | { kind: 'play'; songs: Song[]; index: number }
  | { kind: 'jump'; index: number }
  | { kind: 'toggle'; playing: boolean; position: number }
  | { kind: 'seek'; position: number }
  | { kind: 'next'; from: number }
  | { kind: 'enqueue'; song: Song }

export interface RoomHook {
  active: () => boolean
  send: (action: RoomAction) => void
}

let roomHook: RoomHook | null = null
export function setRoomHook(hook: RoomHook | null) {
  roomHook = hook
}
const inRoom = () => !!roomHook?.active()

let queueLowHook: ((song: Song) => void) | null = null
/** Called with the song that just started when 3 or fewer songs remain in the queue (not in listening rooms). */
export function setQueueLowHook(hook: ((song: Song) => void) | null) {
  queueLowHook = hook
}

interface PlayerState {
  queue: Song[]
  index: number
  /** Where the queue came from (a playlist id), so shelves can show which playlist is playing. */
  sourceId: string | null
  playing: boolean
  time: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: Repeat
  playQueue: (songs: Song[], index: number, sourceId?: string | null) => void
  playAt: (index: number) => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  enqueue: (song: Song) => void
  playNext: (song: Song) => void
  /** Apply the shared room state: load the right song, jump to the right moment, play or pause. */
  applyRoom: (queue: Song[], index: number, playing: boolean, position: number, onBlocked: () => void) => void
  /** Start audio after the browser blocked autoplay (needs a tap). */
  resume: () => void
}

// One audio element for the whole app, kept outside React so re-renders never touch playback.
const audio = new Audio()
audio.preload = 'auto'
audio.volume = 0.8

/** Songs you listened to (80%+) are kept on this device, so they replay instantly and work offline. */
async function keepOnDevice(song: Song) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (!navigator.onLine || conn?.saveData) return
  const { useLibrary } = await import('./library')
  const me = useLibrary.getState().me
  if (useLibrary.getState().mode !== 'api' || !me || !(me.isPro || me.role === 'admin' || me.role === 'trusted')) return
  const { useOffline } = await import('./offline')
  await useOffline.getState().autoKeep(song)
}

// Report a play to the API once a song has been listened to for a while (feeds history and analytics).
let playing: Song | null = null
function flushPlay() {
  if (playing && audio.currentTime >= 15) logPlay(playing.id, Math.floor(audio.currentTime))
  if (playing && audio.duration > 0 && audio.currentTime / audio.duration >= 0.8) void keepOnDevice(playing)
  playing = null
}

/** play() can be refused while the app is in the background (e.g. right after a track ended). Try again a few times. */
function startPlayback(tries = 0) {
  audio.play().catch(() => {
    if (tries < 3) setTimeout(() => startPlayback(tries + 1), 400 * (tries + 1))
  })
}

let recoveries = 0
let stallTimer: ReturnType<typeof setTimeout> | undefined
/** The stream died mid-song (network dropped while the phone was locked): reload it and carry on from the same second. */
function recoverPlayback(): boolean {
  if (!playing || recoveries >= 3 || !navigator.onLine) return false
  recoveries++
  const at = audio.currentTime
  const src = audio.src
  audio.addEventListener(
    'loadedmetadata',
    () => {
      audio.currentTime = at
      startPlayback()
    },
    { once: true },
  )
  audio.src = src
  audio.load()
  return true
}

function load(song: Song) {
  flushPlay()
  playing = song
  audio.src = song.src
  audio.currentTime = 0
  recoveries = 0
  startPlayback()
  setMediaMetadata(song)
  const { queue, index } = usePlayer.getState()
  if (!inRoom() && queue.length - index <= 3) queueLowHook?.(song)
}

function loadSilently(song: Song) {
  flushPlay()
  playing = song
  audio.src = song.src
  setMediaMetadata(song)
}

function setMediaMetadata(song: Song) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album,
    artwork: mediaArtwork(song),
  })
  if (song.thumbUrl) {
    void squareArtwork(song.thumbUrl).then((artwork) => {
      if (artwork && playing?.id === song.id && navigator.mediaSession.metadata) navigator.mediaSession.metadata.artwork = artwork
    })
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  sourceId: null,
  playing: false,
  time: 0,
  duration: 0,
  volume: 0.8,
  shuffle: false,
  repeat: 'off',

  playQueue: (songs, index, sourceId = null) => {
    if (!songs.length) return
    if (inRoom()) return roomHook?.send({ kind: 'play', songs, index })
    set({ queue: songs, index, sourceId, time: 0 })
    load(songs[index])
  },

  playAt: (index) => {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    if (inRoom()) return roomHook?.send({ kind: 'jump', index })
    set({ index, time: 0 })
    load(queue[index])
  },

  toggle: () => {
    if (get().index < 0) return
    if (inRoom()) return roomHook?.send({ kind: 'toggle', playing: audio.paused, position: audio.currentTime })
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  },

  next: (auto = false) => {
    const { queue, index, shuffle, repeat } = get()
    if (!queue.length) return
    // The room advances once even though every listener's song ends at the same moment.
    if (inRoom()) return roomHook?.send({ kind: 'next', from: index })
    if (auto && repeat === 'one') {
      audio.currentTime = 0
      void audio.play().catch(() => {})
      return
    }
    let nextIndex = index + 1
    if (shuffle && queue.length > 1) {
      do nextIndex = Math.floor(Math.random() * queue.length)
      while (nextIndex === index)
    } else if (nextIndex >= queue.length) {
      if (repeat === 'all') nextIndex = 0
      else {
        if (auto) audio.pause()
        return
      }
    }
    get().playAt(nextIndex)
  },

  prev: () => {
    const { index } = get()
    if (audio.currentTime > 3 || index <= 0) {
      if (inRoom()) return roomHook?.send({ kind: 'seek', position: 0 })
      audio.currentTime = 0
      return
    }
    get().playAt(index - 1)
  },

  seek: (t) => {
    if (inRoom() && Number.isFinite(t)) return roomHook?.send({ kind: 'seek', position: Math.max(0, t) })
    if (Number.isFinite(t)) audio.currentTime = t
  },

  setVolume: (v) => {
    audio.volume = v
    set({ volume: v })
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

  enqueue: (song) => {
    if (inRoom()) return roomHook?.send({ kind: 'enqueue', song })
    const { queue } = get()
    if (!queue.length) get().playQueue([song], 0)
    else set({ queue: [...queue, song] })
  },

  playNext: (song) => {
    if (inRoom()) return roomHook?.send({ kind: 'enqueue', song })
    const { queue, index } = get()
    if (!queue.length) {
      get().playQueue([song], 0)
      return
    }
    const copy = queue.slice()
    copy.splice(index + 1, 0, song)
    set({ queue: copy })
  },

  applyRoom: (queue, index, playing, position, onBlocked) => {
    const song = queue[index]
    set({ queue, index, sourceId: 'room' })
    if (!song) {
      audio.pause()
      return
    }
    const sameSong = get().queue[index]?.id === song.id && audio.src.includes(`/stream/${song.id}`)
    if (!sameSong) loadSilently(song)
    if (Math.abs(audio.currentTime - position) > 0.6) audio.currentTime = position
    if (playing) void audio.play().catch(onBlocked)
    else audio.pause()
  },

  resume: () => {
    void audio.play().catch(() => {})
  },
}))

const warm = new Audio()
warm.preload = 'auto'
warm.muted = true
let warmed = ''
function warmNext() {
  const { queue, index, shuffle, repeat } = usePlayer.getState()
  const next = queue[index + 1]
  if (!next || shuffle || repeat === 'one' || warmed === next.id || !navigator.onLine) return
  warmed = next.id
  warm.src = next.src
  warm.load()
}

let lastPosition = 0
audio.addEventListener('timeupdate', () => {
  usePlayer.setState({ time: audio.currentTime })
  if (audio.duration > 0 && audio.currentTime / audio.duration > 0.4) warmNext()
  const now = Date.now()
  if (now - lastPosition > 1000 && 'mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
    lastPosition = now
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate })
    } catch {
      // some browsers reject odd values mid-seek; the next tick fixes it
    }
  }
})
audio.addEventListener('loadedmetadata', () => usePlayer.setState({ duration: audio.duration }))
audio.addEventListener('durationchange', () => usePlayer.setState({ duration: audio.duration || 0 }))
// Consecutive playback failures, so one missing file skips ahead but a dead network does not loop forever.
let failures = 0
audio.addEventListener('playing', () => {
  failures = 0
  clearTimeout(stallTimer)
})
// Waiting for data for 10 seconds while we should be playing: kick the stream.
audio.addEventListener('waiting', () => {
  clearTimeout(stallTimer)
  stallTimer = setTimeout(() => {
    if (!audio.paused && audio.readyState < 3) recoverPlayback()
  }, 10000)
})
audio.addEventListener('play', () => {
  usePlayer.setState({ playing: true })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
})
audio.addEventListener('pause', () => {
  usePlayer.setState({ playing: false })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
})
audio.addEventListener('error', () => {
  if (audio.currentTime > 1 && recoverPlayback()) return
  const { queue, index } = usePlayer.getState()
  const song = queue[index]
  if (!song) return
  failures++
  useUi.getState().showToast(`Couldn't play “${song.title}”${navigator.onLine ? '' : ' (offline, not saved on this device)'}`)
  if (failures < 3 && index < queue.length - 1) setTimeout(() => usePlayer.getState().next(true), 600)
  else usePlayer.setState({ playing: false })
})
audio.addEventListener('ended', () => {
  if (playing) logPlay(playing.id, Math.floor(audio.duration || 0))
  playing = null
  usePlayer.getState().next(true)
})

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => usePlayer.getState().toggle())
  ms.setActionHandler('pause', () => usePlayer.getState().toggle())
  ms.setActionHandler('nexttrack', () => usePlayer.getState().next())
  ms.setActionHandler('previoustrack', () => usePlayer.getState().prev())
  ms.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) usePlayer.getState().seek(d.seekTime)
  })
  // No handlers for seekbackward/seekforward: with them, iPhones replace Previous/Next with +-10 second buttons.
  for (const action of ['seekbackward', 'seekforward'] as const) {
    try {
      ms.setActionHandler(action, null)
    } catch {
      // not supported here
    }
  }
}

export const useCurrent = (): Song | undefined => usePlayer((s) => s.queue[s.index] as Song | undefined)
