import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type UiStyle = 'classic' | 'blend' | 'spotify'
export type PlayerStyle = 'classic' | 'immersive' | 'vinyl' | 'modern'
export type LogoChoice = 'bars' | 'gold'

interface AppState {
  theme: ThemeMode
  ui: UiStyle
  playerStyle: PlayerStyle
  /** Keep playing similar songs when the queue runs low. */
  autoplay: boolean
  logo: LogoChoice
  setLogo: (l: LogoChoice) => void
  setAutoplay: (on: boolean) => void
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
      autoplay: true,
      logo: 'bars',
      setLogo: (logo) => set({ logo }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setTheme: (theme) => set({ theme }),
      setUi: (ui) => set({ ui }),
      setPlayerStyle: (playerStyle) => set({ playerStyle }),
    }),
    { name: 'soundly-app' },
  ),
)
