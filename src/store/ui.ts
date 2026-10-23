import { create } from 'zustand'

interface UiState {
  nowPlaying: boolean
  toast: string | null
  /** Set when a new app version is ready; calling it installs the update and reloads. */
  applyUpdate: (() => void) | null
  setNowPlaying: (open: boolean) => void
  showToast: (message: string) => void
  setUpdate: (apply: (() => void) | null) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<UiState>((set) => ({
  nowPlaying: false,
  toast: null,
  applyUpdate: null,
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
  setUpdate: (apply) => set({ applyUpdate: apply }),
}))
