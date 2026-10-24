import { create } from 'zustand'
import { API_BASE } from '../api/client'

interface ConnectionState {
  /** True while the device has no way to reach Soundly. The app then shows only what is on the device. */
  offline: boolean
  checking: boolean
  /** Set for a moment when the connection returns, so the app can play a "back online" animation. */
  justBack: boolean
  /** Really tries to reach the server (the browser's own "online" flag is only a hint). Returns true if it can. */
  refresh: () => Promise<boolean>
}

async function reachable(): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 5000)
  try {
    // Any answer from the server, even "not signed in", means we are online. The service worker never caches this.
    const res = await fetch(`${API_BASE}/health?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal })
    return res.status < 500 || res.status === 503
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export const useConnection = create<ConnectionState>((set, get) => ({
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  checking: false,
  justBack: false,
  refresh: async () => {
    if (get().checking) return !get().offline
    set({ checking: true })
    const [ok] = await Promise.all([reachable(), new Promise((r) => setTimeout(r, 600))]) // a visible beat, so it feels like it checked
    if (ok && get().offline) {
      set({ offline: false, checking: false, justBack: true })
      setTimeout(() => set({ justBack: false }), 1400)
    } else set({ offline: !ok, checking: false })
    return ok
  },
}))

window.addEventListener('offline', () => useConnection.setState({ offline: true }))
window.addEventListener('online', () => void useConnection.getState().refresh())
