import { create } from 'zustand'
import type { Song } from '../data/mock'

export interface SongMenuState {
  song: Song
  x: number
  y: number
  /** Set when opened from a playlist page, so the menu can offer "remove from this playlist". */
  playlistId?: string
}

interface UiState {
  nowPlaying: boolean
  toast: string | null
  /** Set when a new app version is ready; calling it installs the update and reloads. */
  applyUpdate: (() => void) | null
  roomModal: boolean
  devicesOpen: boolean
  setDevicesOpen: (open: boolean) => void
  songMenu: SongMenuState | null
  playlistPicker: Song | null
  lyricsEditor: Song | null
  createPlaylistOpen: boolean
  setCreatePlaylist: (open: boolean) => void
  openSongMenu: (menu: SongMenuState | null) => void
  setPlaylistPicker: (song: Song | null) => void
  setLyricsEditor: (song: Song | null) => void
  setNowPlaying: (open: boolean) => void
  showToast: (message: string) => void
  setUpdate: (apply: (() => void) | null) => void
  setRoomModal: (open: boolean) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<UiState>((set) => ({
  nowPlaying: false,
  toast: null,
  applyUpdate: null,
  roomModal: false,
  devicesOpen: false,
  setDevicesOpen: (devicesOpen) => set({ devicesOpen }),
  songMenu: null,
  playlistPicker: null,
  lyricsEditor: null,
  createPlaylistOpen: false,
  setCreatePlaylist: (createPlaylistOpen) => set({ createPlaylistOpen }),
  openSongMenu: (songMenu) => set({ songMenu }),
  setPlaylistPicker: (playlistPicker) => set({ playlistPicker, songMenu: null }),
  setLyricsEditor: (lyricsEditor) => set({ lyricsEditor, songMenu: null }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
  setUpdate: (apply) => set({ applyUpdate: apply }),
  setRoomModal: (roomModal) => set({ roomModal }),
}))
