import { CloudOff, Wrench } from 'lucide-react'
import { useEffect } from 'react'

const BARS = [0.45, 0.8, 1, 0.65, 0.4]

/** Launch screen: the logo's bars moving, so opening the app feels alive instead of blank. */
export function Splash({ offline, onRetry }: { offline?: boolean; onRetry?: () => void }) {
  return (
    <div className="boot" aria-busy={!offline}>
      <div className="splash">
        <div className="splash-bars" aria-hidden="true">
          {BARS.map((h, i) => (
            <i key={i} style={{ height: `${h * 64}px`, animationDelay: `${-i * 0.18}s` }} />
          ))}
        </div>
        {offline ? (
          <>
            <p className="splash-msg">
              <CloudOff size={18} /> You’re offline
            </p>
            <p className="muted splash-sub">Soundly needs a connection the first time. Reconnect and try again.</p>
            <button className="btn-pill" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <p className="splash-msg">Soundly</p>
        )}
      </div>
    </div>
  )
}

/** Shown when the server is down (for example its daily database allowance ran out). Retries by itself every minute. */
export function Maintenance({ resumeAt, onRetry }: { resumeAt: string | null; onRetry: () => void }) {
  useEffect(() => {
    const t = setInterval(onRetry, 60000)
    return () => clearInterval(t)
  }, [onRetry])

  const when = resumeAt ? new Date(resumeAt) : null
  const time = when?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = when ? when.toDateString() === new Date().toDateString() : false

  return (
    <div className="boot">
      <div className="splash">
        <div className="splash-bars" aria-hidden="true">
          {BARS.map((h, i) => (
            <i key={i} style={{ height: `${h * 64}px`, animationDelay: `${-i * 0.18}s` }} />
          ))}
        </div>
        <p className="splash-msg">
          <Wrench size={18} /> Soundly is under maintenance
        </p>
        <p className="muted splash-sub">
          {time ? `It will be back ${sameDay ? 'today' : 'tomorrow'} at ${time}.` : 'It will be back soon.'} Sorry for the inconvenience!
        </p>
        <button className="btn-pill" onClick={onRetry}>
          Check again
        </button>
      </div>
    </div>
  )
}
