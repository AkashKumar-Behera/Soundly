import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type UiStyle = 'classic' | 'blend'
export type PlayerStyle = 'classic' | 'immersive' | 'vinyl'
export type Role = 'listener' | 'member' | 'trusted' | 'admin'
export type RequestStatus = 'pending_approval' | 'queued' | 'downloading' | 'done' | 'rejected'

export interface SongRequest {
  id: string
  title: string
  channel: string
  status: RequestStatus
}

interface AppState {
  theme: ThemeMode
  ui: UiStyle
  playerStyle: PlayerStyle
  role: Role
  liked: string[]
  requests: SongRequest[]
  setTheme: (t: ThemeMode) => void
  setUi: (u: UiStyle) => void
  setPlayerStyle: (p: PlayerStyle) => void
  setRole: (r: Role) => void
  toggleLike: (id: string) => void
  addRequest: (title: string, channel: string) => RequestStatus
  setRequestStatus: (id: string, status: RequestStatus) => void
}

export const canRequestDirect = (role: Role) => role === 'trusted' || role === 'admin'

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      ui: 'classic',
      playerStyle: 'immersive',
      role: 'member',
      liked: ['s1', 's2', 's9'],
      requests: [],

      setTheme: (theme) => set({ theme }),
      setUi: (ui) => set({ ui }),
      setPlayerStyle: (playerStyle) => set({ playerStyle }),
      setRole: (role) => set({ role }),

      toggleLike: (id) =>
        set((s) => ({ liked: s.liked.includes(id) ? s.liked.filter((x) => x !== id) : [...s.liked, id] })),

      addRequest: (title, channel) => {
        const status: RequestStatus = canRequestDirect(get().role) ? 'queued' : 'pending_approval'
        const item: SongRequest = { id: crypto.randomUUID(), title, channel, status }
        set((s) => ({ requests: [item, ...s.requests] }))
        return status
      },

      setRequestStatus: (id, status) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status } : r)) })),
    }),
    { name: 'soundly-app' },
  ),
)
