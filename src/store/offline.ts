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
}

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
    set((s) => {
      const saved = { ...s.saved }
      delete saved[id]
      return { saved }
    })
  },

  clear: async () => {
    if (cachesSupported()) await caches.delete(AUDIO_CACHE)
    set({ saved: {} })
  },
}))
