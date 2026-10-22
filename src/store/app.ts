import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type UiStyle = 'classic' | 'blend'
export type PlayerStyle = 'classic' | 'immersive' | 'vinyl'

interface AppState {
  theme: ThemeMode
  ui: UiStyle
  playerStyle: PlayerStyle
  setTheme: (t: ThemeMode) => void
  setUi: (u: UiStyle) => void
  setPlayerStyle: (p: PlayerStyle) => void
}

/** Per-device preferences only. Library data (likes, requests, role) lives in the library store / API. */
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      ui: 'classic',
      playerStyle: 'immersive',
      setTheme: (theme) => set({ theme }),
      setUi: (ui) => set({ ui }),
      setPlayerStyle: (playerStyle) => set({ playerStyle }),
    }),
    { name: 'soundly-app' },
  ),
)
