import { create } from 'zustand'
import { api, ApiError, setDemo, streamUrl, thumbUrl } from '../api/client'
import { clearDeviceData } from '../lib/deviceCache'
import { playlists as mockPlaylists, songById as mockSongById, songs as mockSongs } from '../data/mock'
import type { Song } from '../data/mock'

export type Role = 'listener' | 'member' | 'trusted' | 'admin'
export type RequestStatus = 'pending_approval' | 'queued' | 'downloading' | 'uploading' | 'done' | 'failed' | 'rejected'

export interface Me {
  id: string
  email: string
  name: string
  role: Role
  canRequestDirect: boolean
  dailyRequestLimit: number
  requestsToday: number
  isPro: boolean
  proUntil: string | null
}

export interface Playlist {
  id: string
  title: string
  description: string
  hue: number
  songCount: number
}

export interface SongRequest {
  id: string
  userName?: string
  youtubeId: string
  title: string
  channel: string | null
  flags: string[]
  status: RequestStatus
  rejectReason: string | null
}

export interface RequestInput {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  category: string
}

export type RequestResult = { ok: true; status: RequestStatus } | { ok: false; error: string; songId?: string }

export interface YoutubeResult {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  category: string
  thumbnail: string
  /** Set when the song is already in the library. */
  songId: string | null
  /** Set while a request for this video is pending, queued or downloading. */
  requestStatus: string | null
}

export type YoutubeSearch = { ok: true; results: YoutubeResult[] } | { ok: false; error: string }

/** Deterministic 11-character id so a demo result always maps to the same request. */
function fakeVideoId(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  return (h.toString(36) + (h ^ 0x9e3779b9).toString(36) + 'abcdefghijk').slice(0, 11)
}

function demoYoutube(q: string): YoutubeResult[] {
  return [
    { suffix: '(Official Audio)', channel: `${q} - Topic`, durationSec: 222 },
    { suffix: '| Lyrics', channel: 'Lyrics Hub', durationSec: 220 },
    { suffix: '(Live Session)', channel: 'Live Sessions', durationSec: 250 },
  ].map((v) => ({
    youtubeId: fakeVideoId(`${q} ${v.suffix}`),
    title: `${q} ${v.suffix}`,
    channel: v.channel,
    durationSec: v.durationSec,
    category: 'Music',
    thumbnail: '',
    songId: null,
    requestStatus: null,
  }))
}

interface ApiSong {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  hasThumb: boolean
  youtubeId: string | null
  liked: boolean
}

/** Stable hue per song id, so generated cover art never changes between loads. */
export function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}

export function toSong(s: ApiSong): Song {
  const hue = hueFromId(s.id)
  return {
    id: s.id,
    title: s.title,
    artist: s.artist ?? 'Unknown Artist',
    album: s.album ?? 'Single',
    duration: s.duration ?? 0,
    hue,
    hue2: (hue + 55) % 360,
    src: streamUrl(s.id),
    thumbUrl: s.hasThumb ? thumbUrl(s.id) : undefined,
  }
}

interface LibraryState {
  /** `unauth`: the API is reachable but nobody is signed in. */
  status: 'loading' | 'ready' | 'unauth' | 'offline'
  mode: 'api' | 'demo'
  me: Me | null
  songs: Song[]
  playlists: Playlist[]
  liked: string[]
  recent: Song[]
  requests: SongRequest[]
  demoRole: Role
  load: () => Promise<void>
  logout: () => Promise<void>
  toggleLike: (songId: string) => Promise<void>
  getPlaylist: (id: string) => Promise<{ playlist: Playlist; songs: Song[] } | null>
  searchSongs: (q: string) => Promise<Song[]>
  searchYoutube: (q: string) => Promise<YoutubeSearch>
  createRequest: (input: RequestInput) => Promise<RequestResult>
  loadRequests: () => Promise<void>
  decideRequest: (id: string, decision: 'approve' | 'reject') => Promise<void>
  setDemoRole: (role: Role) => void
}

const LIKED_ID = 'liked'

export const useLibrary = create<LibraryState>((set, get) => ({
  status: 'loading',
  mode: 'api',
  me: null,
  songs: [],
  playlists: [],
  liked: [],
  recent: [],
  requests: [],
  demoRole: 'member',

  load: async () => {
    try {
      const me = await api<Me>('/me')
      const [songs, playlists, likes, recent] = await Promise.all([
        api<{ songs: ApiSong[] }>('/songs?limit=100'),
        api<{ playlists: Playlist[] }>('/playlists'),
        api<{ songs: ApiSong[] }>('/likes'),
        api<{ songs: ApiSong[] }>('/plays/recent'),
      ])
      setDemo(false)
      set({
        status: 'ready',
        mode: 'api',
        me,
        songs: songs.songs.map(toSong),
        playlists: playlists.playlists,
        liked: likes.songs.map((s) => s.id),
        recent: recent.songs.map(toSong),
      })
      void get().loadRequests()
    } catch (e) {
      // fetch itself failed (TypeError) and no cached copy exists: the device is offline, not "no API".
      if (e instanceof TypeError) {
        set({ status: 'offline' })
        return
      }
      if (e instanceof ApiError && e.status === 401) {
        setDemo(false)
        set({ status: 'unauth', mode: 'api', me: null, songs: [], playlists: [], liked: [], recent: [], requests: [] })
        return
      }
      // No reachable API (static hosting, or the Worker is down): run on bundled demo data.
      if (e instanceof ApiError && e.code !== 'api_unavailable' && e.status !== 0) console.error(e)
      setDemo(true)
      set({
        status: 'ready',
        mode: 'demo',
        me: null,
        songs: mockSongs,
        playlists: mockPlaylists.map((p) => ({ id: p.id, title: p.title, description: p.description, hue: p.hue, songCount: p.songIds.length })),
        liked: ['s1', 's2', 's9'],
        recent: [],
        requests: [],
      })
    }
  },

  logout: async () => {
    if (get().mode === 'api') await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {})
    // Wipe what this device kept for the account (library snapshot, covers, saved songs), then reload so the
    // audio element, queue and every in-memory list go with it.
    await clearDeviceData()
    window.location.assign('/login')
  },

  toggleLike: async (songId) => {
    const was = get().liked.includes(songId)
    set((s) => ({ liked: was ? s.liked.filter((x) => x !== songId) : [...s.liked, songId] }))
    if (get().mode === 'demo') return
    try {
      await api(`/likes/${songId}`, { method: was ? 'DELETE' : 'PUT' })
    } catch {
      set((s) => ({ liked: was ? [...s.liked, songId] : s.liked.filter((x) => x !== songId) })) // roll back
    }
  },

  getPlaylist: async (id) => {
    const { mode, liked } = get()
    if (id === LIKED_ID) {
      const list =
        mode === 'demo'
          ? liked.map(mockSongById).filter((s): s is Song => !!s)
          : (await api<{ songs: ApiSong[] }>('/likes').catch(() => ({ songs: [] as ApiSong[] }))).songs.map(toSong)
      return { playlist: { id: LIKED_ID, title: 'Liked Songs', description: 'Songs you hearted.', hue: 150, songCount: list.length }, songs: list }
    }
    if (mode === 'demo') {
      const p = mockPlaylists.find((x) => x.id === id)
      if (!p) return null
      const list = p.songIds.map(mockSongById).filter((s): s is Song => !!s)
      return { playlist: { id: p.id, title: p.title, description: p.description, hue: p.hue, songCount: list.length }, songs: list }
    }
    try {
      const d = await api<Playlist & { songs: ApiSong[] }>(`/playlists/${id}`)
      return { playlist: d, songs: d.songs.map(toSong) }
    } catch {
      return null
    }
  },

  searchSongs: async (q) => {
    if (get().mode === 'demo') {
      const needle = q.toLowerCase()
      return mockSongs.filter((s) => [s.title, s.artist, s.album].some((f) => f.toLowerCase().includes(needle)))
    }
    const d = await api<{ songs: ApiSong[] }>(`/songs?q=${encodeURIComponent(q)}&limit=50`)
    return d.songs.map(toSong)
  },

  searchYoutube: async (q) => {
    if (get().mode === 'demo') return { ok: true, results: demoYoutube(q) }
    try {
      const d = await api<{ results: YoutubeResult[] }>(`/youtube/search?q=${encodeURIComponent(q)}`)
      return { ok: true, results: d.results }
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.code : 'network' }
    }
  },

  createRequest: async (input) => {
    if (get().mode === 'demo') {
      const role = get().demoRole
      const status: RequestStatus = role === 'trusted' || role === 'admin' ? 'queued' : 'pending_approval'
      if (role === 'listener') return { ok: false, error: 'forbidden' }
      const item: SongRequest = { id: crypto.randomUUID(), youtubeId: input.youtubeId, title: input.title, channel: input.channel, flags: [], status, rejectReason: null }
      set((s) => ({ requests: [item, ...s.requests] }))
      return { ok: true, status }
    }
    try {
      const r = await api<{ status: RequestStatus }>('/requests', { method: 'POST', body: input })
      void get().loadRequests()
      return { ok: true, status: r.status }
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, error: e.code, songId: e.data.songId as string | undefined }
      return { ok: false, error: 'network' }
    }
  },

  loadRequests: async () => {
    if (get().mode === 'demo') return
    const admin = get().me?.role === 'admin'
    try {
      const d = await api<{ requests: SongRequest[] }>(admin ? '/admin/requests' : '/requests')
      set({ requests: d.requests })
    } catch {
      // keep what we have
    }
  },

  decideRequest: async (id, decision) => {
    const status: RequestStatus = decision === 'approve' ? 'queued' : 'rejected'
    if (get().mode === 'demo') {
      set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status } : r)) }))
      return
    }
    await api(`/admin/requests/${id}/${decision}`, { method: 'POST', body: {} }).catch(() => {})
    await get().loadRequests()
  },

  setDemoRole: (demoRole) => set({ demoRole }),
}))

/** The effective role: from the API when signed in, otherwise the demo switch. */
export const useRole = (): Role => useLibrary((s) => (s.mode === 'api' && s.me ? s.me.role : s.demoRole))
export const useCanRequestDirect = (): boolean =>
  useLibrary((s) => (s.mode === 'api' && s.me ? s.me.canRequestDirect : s.demoRole === 'trusted' || s.demoRole === 'admin'))
