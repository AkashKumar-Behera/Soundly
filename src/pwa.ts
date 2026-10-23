import { registerSW } from 'virtual:pwa-register'
import { create } from 'zustand'
import { useUi } from './store/ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** The browser offered an install prompt we can trigger. */
  canInstall: boolean
  /** Already running as an installed app. */
  installed: boolean
  isIos: boolean
  install: () => Promise<void>
}

let deferred: BeforeInstallPromptEvent | null = null

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const usePwa = create<PwaState>((set) => ({
  canInstall: false,
  installed: standalone(),
  isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
  install: async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    set({ canInstall: false })
  },
}))

/** Registers the service worker and wires up the install prompt. Call once at startup. */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    usePwa.setState({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    usePwa.setState({ canInstall: false, installed: true })
  })

  if (!('serviceWorker' in navigator)) return
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Shown as a banner; applying it reloads the page, so the user picks the moment.
      useUi.getState().setUpdate(() => void updateSW(true))
    },
  })
}
