import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './pwa'

setupPwa()

// iPhone home-screen apps: the page is drawn full screen (under the status bar) but iOS reports a layout viewport that is
// shorter by the status bar's height, which left an empty strip at the bottom. Measure that gap and let the layout use it.
function syncViewportGap() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const gap = screen.height - window.innerHeight
  const portrait = window.innerHeight > window.innerWidth
  document.documentElement.style.setProperty('--vgap', standalone && portrait && gap >= 20 && gap <= 90 ? `${gap}px` : '0px')
}
syncViewportGap()
window.addEventListener('resize', syncViewportGap)
window.addEventListener('orientationchange', () => setTimeout(syncViewportGap, 300))
document.addEventListener('visibilitychange', syncViewportGap)

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
