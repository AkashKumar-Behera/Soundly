import type { CSSProperties } from 'react'
import { usePlayer } from '../store/player'

const BARS = Array.from({ length: 28 }, (_, i) => ({
  delay: -((i * 137) % 900) / 1000,
  speed: 0.7 + ((i * 53) % 60) / 100,
  peak: 0.35 + ((i * 29) % 65) / 100,
}))

/** Decorative equalizer: CSS-only transform animation, paused when playback is paused. */
export function Visualizer() {
  const playing = usePlayer((s) => s.playing)
  return (
    <div className={`viz ${playing ? '' : 'paused'}`} aria-hidden="true">
      {BARS.map((b, i) => (
        <i
          key={i}
          style={{ animationDelay: `${b.delay}s`, animationDuration: `${b.speed}s`, '--peak': b.peak } as CSSProperties}
        />
      ))}
    </div>
  )
}
