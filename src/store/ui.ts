import { create } from 'zustand'

interface UiState {
  nowPlaying: boolean
  toast: string | null
  setNowPlaying: (open: boolean) => void
  showToast: (message: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<UiState>((set) => ({
  nowPlaying: false,
  toast: null,
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
}))
