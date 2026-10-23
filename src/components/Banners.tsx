import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useUi } from '../store/ui'

/** Top strip while offline. A waiting app update gets a centred dialog, so it is easy to tap on any screen. */
export function Banners() {
  const [online, setOnline] = useState(navigator.onLine)
  const applyUpdate = useUi((s) => s.applyUpdate)
  const [later, setLater] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <>
      {!online && (
        <div className="banners" role="status">
          <div className="banner">
            <CloudOff size={16} /> You’re offline. Songs saved on this device still play.
          </div>
        </div>
      )}
      {applyUpdate && !later && (
        <div className="modal-back update-back" role="dialog" aria-modal="true" aria-label="Update available">
          <div className="modal update-modal">
            <div className="update-icon">
              <RefreshCw size={26} className={updating ? 'spin' : ''} />
            </div>
            <h3>New version ready</h3>
            <p className="modal-body">Refresh to get the latest Soundly. Your music keeps its place.</p>
            <div className="modal-actions">
              <button className="btn-pill ghost" onClick={() => setLater(true)} disabled={updating}>
                Later
              </button>
              <button
                className="btn-pill"
                disabled={updating}
                onClick={() => {
                  setUpdating(true)
                  applyUpdate()
                }}
              >
                Refresh now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
