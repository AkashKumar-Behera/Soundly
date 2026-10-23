import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useUi } from '../store/ui'

/** Top strip: shown while the device is offline, and when a new app version is waiting. */
export function Banners() {
  const [online, setOnline] = useState(navigator.onLine)
  const applyUpdate = useUi((s) => s.applyUpdate)

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

  if (online && !applyUpdate) return null
  return (
    <div className="banners" role="status">
      {!online && (
        <div className="banner">
          <CloudOff size={16} /> You’re offline. Songs saved on this device still play.
        </div>
      )}
      {applyUpdate && (
        <div className="banner update">
          <RefreshCw size={16} /> A new version of Soundly is ready.
          <button className="link-btn" onClick={applyUpdate}>
            Reload
          </button>
        </div>
      )}
    </div>
  )
}
