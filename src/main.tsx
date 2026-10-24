import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './pwa'

setupPwa()

// iPhone home-screen apps: right after launch the web view can be shorter than the screen and grow a moment later (that is
// why the app looked wrong until it was minimised and reopened). The layout therefore follows the real visible height, and
// keeps checking it for the first few seconds and on every touch, instead of trusting the first measurement.
function syncAppHeight() {
  const h = Math.round(window.visualViewport?.height ?? window.innerHeight)
  document.documentElement.style.setProperty('--app-h', `${h}px`)
}
syncAppHeight()
window.addEventListener('resize', syncAppHeight)
window.visualViewport?.addEventListener('resize', syncAppHeight)
window.addEventListener('pageshow', syncAppHeight)
window.addEventListener('focus', syncAppHeight)
window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 300))
document.addEventListener('visibilitychange', syncAppHeight)
document.addEventListener('touchstart', syncAppHeight, { passive: true })
for (const ms of [50, 150, 400, 900, 1600, 3000]) setTimeout(syncAppHeight, ms)

// Feels like an app: no browser context menu, copy or drag outside text fields. Song rows open their own menu.
const editable = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, [contenteditable="true"]')
document.addEventListener('contextmenu', (e) => !editable(e.target) && e.preventDefault())
document.addEventListener('copy', (e) => !editable(e.target) && e.preventDefault())
document.addEventListener('dragstart', (e) => !editable(e.target) && e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
