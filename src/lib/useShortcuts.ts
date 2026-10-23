import { useEffect } from 'react'
import { usePlayer } from '../store/player'

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

/**
 * Space play/pause, left/right seek 5s (Shift: previous/next), M mute.
 * Ignored while typing, with modifier keys, or when a button has focus (Space would double-trigger it).
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const p = usePlayer.getState()
      if (p.index < 0) return

      switch (e.key) {
        case ' ':
          if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return
          e.preventDefault()
          p.toggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) p.next()
          else p.seek(p.time + 5)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) p.prev()
          else p.seek(Math.max(0, p.time - 5))
          break
        case 'm':
        case 'M':
          p.setVolume(p.volume === 0 ? 0.8 : 0)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
