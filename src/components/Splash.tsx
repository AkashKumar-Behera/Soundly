import { CloudOff } from 'lucide-react'

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
