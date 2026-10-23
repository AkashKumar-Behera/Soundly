import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './pwa'

setupPwa()

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
