import { useEffect, useRef } from 'react'
import { usePlayer } from '../store/player'
import { formatTime } from '../lib/format'

/**
 * The seek bar writes straight to the DOM from a store subscription,
 * so playback ticks never re-render React components.
 */
export function ProgressBar({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const seek = usePlayer((s) => s.seek)

  useEffect(() => {
    const apply = (time: number, duration: number) => {
      const el = ref.current
      if (!el || dragging.current) return
      const p = duration > 0 ? time / duration : 0
      el.value = String(p * 1000)
      el.style.setProperty('--p', `${p * 100}%`)
    }
    const { time, duration } = usePlayer.getState()
    apply(time, duration)
    return usePlayer.subscribe((s) => apply(s.time, s.duration))
  }, [])

  return (
    <input
      ref={ref}
      type="range"
      min={0}
      max={1000}
      defaultValue={0}
      aria-label="Seek"
      className={`range seek ${className}`}
      onPointerDown={() => (dragging.current = true)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onChange={(e) => {
        const p = Number(e.target.value) / 1000
        e.target.style.setProperty('--p', `${p * 100}%`)
        seek(p * usePlayer.getState().duration)
      }}
    />
  )
}

export function CurrentTime() {
  const t = usePlayer((s) => Math.floor(s.time))
  return <span>{formatTime(t)}</span>
}

export function TotalTime() {
  const d = usePlayer((s) => Math.floor(s.duration))
  return <span>{formatTime(d)}</span>
}
