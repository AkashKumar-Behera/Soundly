import { create } from 'zustand'
import { logPlay } from '../api/client'
import type { Song } from '../data/mock'

export type Repeat = 'off' | 'all' | 'one'

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
}

// One audio element for the whole app, kept outside React so re-renders never touch playback.
const audio = new Audio()
audio.preload = 'metadata'
audio.volume = 0.8

// Report a play to the API once a song has been listened to for a while (feeds history and analytics).
let playing: Song | null = null
function flushPlay() {
  if (playing && audio.currentTime >= 15) logPlay(playing.id, Math.floor(audio.currentTime))
  playing = null
}

function load(song: Song) {
  flushPlay()
  playing = song
  audio.src = song.src
  audio.currentTime = 0
  void audio.play().catch(() => {})
  setMediaMetadata(song)
}

function setMediaMetadata(song: Song) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album,
  })
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
    set({ queue: songs, index, sourceId, time: 0 })
    load(songs[index])
  },

  playAt: (index) => {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    set({ index, time: 0 })
    load(queue[index])
  },

  toggle: () => {
    if (get().index < 0) return
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  },

  next: (auto = false) => {
    const { queue, index, shuffle, repeat } = get()
    if (!queue.length) return
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
      audio.currentTime = 0
      return
    }
    get().playAt(index - 1)
  },

  seek: (t) => {
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
    const { queue } = get()
    if (!queue.length) get().playQueue([song], 0)
    else set({ queue: [...queue, song] })
  },

  playNext: (song) => {
    const { queue, index } = get()
    if (!queue.length) {
      get().playQueue([song], 0)
      return
    }
    const copy = queue.slice()
    copy.splice(index + 1, 0, song)
    set({ queue: copy })
  },
}))

audio.addEventListener('timeupdate', () => usePlayer.setState({ time: audio.currentTime }))
audio.addEventListener('loadedmetadata', () => usePlayer.setState({ duration: audio.duration }))
audio.addEventListener('durationchange', () => usePlayer.setState({ duration: audio.duration || 0 }))
audio.addEventListener('play', () => usePlayer.setState({ playing: true }))
audio.addEventListener('pause', () => usePlayer.setState({ playing: false }))
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
}

export const useCurrent = (): Song | undefined => usePlayer((s) => s.queue[s.index] as Song | undefined)
