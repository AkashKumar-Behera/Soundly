import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './pwa'

setupPwa()

// iPhone home-screen apps: right after launch iOS can report a layout viewport that is shorter than the screen (by the
// status bar), which left an empty strip at the bottom until the app was minimised and reopened. In an installed app the
// page is always the full screen, so size the app container to the screen itself instead of trusting the viewport.
function syncAppHeight() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const portrait = window.innerHeight > window.innerWidth
  const fullWidth = Math.abs(screen.width - window.innerWidth) <= 1
  const root = document.documentElement.style
  if (standalone && portrait && fullWidth) root.setProperty('--app-h', `${screen.height}px`)
  else root.removeProperty('--app-h')
}
syncAppHeight()
window.addEventListener('resize', syncAppHeight)
window.addEventListener('pageshow', syncAppHeight)
window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 300))
document.addEventListener('visibilitychange', syncAppHeight)

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
