import { create } from 'zustand'
import { AUDIO_CACHE, cachesSupported } from '../lib/deviceCache'
import type { Song } from '../data/mock'

interface OfflineState {
  supported: boolean
  /** Saved song id -> size in bytes. */
  saved: Record<string, number>
  /** Songs being saved right now, with progress 0..1. */
  busy: Record<string, number>
  ready: boolean
  init: () => Promise<void>
  save: (song: Song) => Promise<boolean>
  saveMany: (songs: Song[], onProgress?: (done: number, total: number) => void) => Promise<number>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
  /** Quietly keeps a song you listened to (oldest auto-kept songs are dropped past the limit). */
  autoKeep: (song: Song) => Promise<void>
}

const META_KEY = 'soundly.device-songs'
const AUTO_KEY = 'soundly.auto-kept'
const AUTO_LIMIT = 40

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: it just will not be remembered */
  }
}

/** Enough about a saved song to list it offline (the library API is not reachable then). */
export function rememberSong(song: Song) {
  const meta = readJson<Record<string, Song>>(META_KEY, {})
  meta[song.id] = { id: song.id, title: song.title, artist: song.artist, album: song.album, duration: song.duration, hue: song.hue, hue2: song.hue2, src: song.src, thumbUrl: song.thumbUrl, aac: song.aac }
  writeJson(META_KEY, meta)
}
export const rememberedSongs = (): Record<string, Song> => readJson<Record<string, Song>>(META_KEY, {})

const urlFor = (song: Song) => new URL(song.src, window.location.origin).href
const idFromUrl = (url: string) => new URL(url).pathname.split('/').pop() ?? ''

/**
 * Songs saved for offline play live in the Cache Storage under their stream URL. The service worker answers
 * /api/stream/:id from there (with Range support), so saved songs play with no network at all.
 */
export const useOffline = create<OfflineState>((set, get) => ({
  supported: cachesSupported(),
  saved: {},
  busy: {},
  ready: false,

  init: async () => {
    if (!cachesSupported()) return set({ ready: true })
    const cache = await caches.open(AUDIO_CACHE)
    const saved: Record<string, number> = {}
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      saved[idFromUrl(req.url)] = Number(res?.headers.get('content-length') ?? 0)
    }
    set({ saved, ready: true })
  },

  save: async (song) => {
    if (!cachesSupported() || get().saved[song.id] !== undefined || get().busy[song.id] !== undefined) return true
    set((s) => ({ busy: { ...s.busy, [song.id]: 0 } }))
    try {
      const res = await fetch(urlFor(song), { cache: 'no-store' })
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
      const total = Number(res.headers.get('content-length') ?? 0)
      const reader = res.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value as Uint8Array<ArrayBuffer>)
        got += value.length
        if (total) set((s) => ({ busy: { ...s.busy, [song.id]: got / total } }))
      }
      const body = new Blob(chunks, { type: res.headers.get('content-type') ?? 'audio/mpeg' })
      const cache = await caches.open(AUDIO_CACHE)
      await cache.put(urlFor(song), new Response(body, { status: 200, headers: { 'Content-Type': body.type, 'Content-Length': String(body.size) } }))
      set((s) => ({ saved: { ...s.saved, [song.id]: body.size } }))
      rememberSong(song)
      return true
    } catch {
      return false
    } finally {
      set((s) => {
        const busy = { ...s.busy }
        delete busy[song.id]
        return { busy }
      })
    }
  },

  saveMany: async (songs, onProgress) => {
    let ok = 0
    for (let i = 0; i < songs.length; i++) {
      if (await get().save(songs[i])) ok++
      onProgress?.(i + 1, songs.length)
    }
    return ok
  },

  remove: async (id) => {
    if (!cachesSupported()) return
    const cache = await caches.open(AUDIO_CACHE)
    await cache.delete(new URL(`/api/stream/${id}`, window.location.origin).href)
    const meta = readJson<Record<string, Song>>(META_KEY, {})
    delete meta[id]
    writeJson(META_KEY, meta)
    set((s) => {
      const saved = { ...s.saved }
      delete saved[id]
      return { saved }
    })
  },

  clear: async () => {
    if (cachesSupported()) await caches.delete(AUDIO_CACHE)
    writeJson(META_KEY, {})
    writeJson(AUTO_KEY, [])
    set({ saved: {} })
  },

  autoKeep: async (song) => {
    if (!cachesSupported() || get().saved[song.id] !== undefined || get().busy[song.id] !== undefined) return
    if (!(await get().save(song))) return
    const kept = [...readJson<string[]>(AUTO_KEY, []).filter((id) => id !== song.id), song.id]
    while (kept.length > AUTO_LIMIT) {
      const oldest = kept.shift() as string
      await get().remove(oldest)
    }
    writeJson(AUTO_KEY, kept)
  },
}))
