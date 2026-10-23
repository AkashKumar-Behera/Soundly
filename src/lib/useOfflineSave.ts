import { useCallback } from 'react'
import type { Song } from '../data/mock'
import { useLibrary } from '../store/library'
import { useOffline } from '../store/offline'
import { useUi } from '../store/ui'

/** Saving for offline is a Pro perk (admins and trusted users included), and needs the real API (not demo data). */
export function useCanSaveOffline(): boolean {
  return useLibrary((s) => s.mode === 'api' && !!s.me && (s.me.isPro || s.me.role === 'admin' || s.me.role === 'trusted'))
}

/** Toggle one song on this device, with the right messages. */
export function useOfflineSave() {
  const allowed = useCanSaveOffline()
  const showToast = useUi((s) => s.showToast)

  return useCallback(
    async (song: Song) => {
      const { saved, save, remove } = useOffline.getState()
      if (saved[song.id] !== undefined) {
        await remove(song.id)
        return showToast('Removed from this device')
      }
      if (!allowed) return showToast('Saving songs for offline is a Pro perk')
      if (!navigator.onLine) return showToast('Connect to the internet to save songs')
      showToast(`Saving “${song.title}”…`)
      showToast((await save(song)) ? 'Saved for offline' : 'Could not save that song')
    },
    [allowed, showToast],
  )
}
