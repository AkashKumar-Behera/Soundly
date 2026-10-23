import { ChevronDown, Heart, ListMusic, Mic2, MoreVertical, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Song } from '../data/mock'
import { useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Cover } from './Cover'
import { Lyrics, Queue } from './NpPanels'
import { CurrentTime, TotalTime } from './ProgressBar'

const AMP = 4
const WAVE = 18

/** A progress bar whose played part is a gently moving wave. Tap or drag to seek. */
function WavyProgress() {
  const time = usePlayer((s) => s.time)
  const duration = usePlayer((s) => s.duration)
  const playing = usePlayer((s) => s.playing)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  const [drag, setDrag] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const frac = drag ?? (duration > 0 ? Math.min(1, time / duration) : 0)
  const x = frac * width
  const mid = 14

  let d = `M0 ${mid}`
  for (let px = 0; px <= width + WAVE; px += 3) d += ` L${px} ${(mid + AMP * Math.sin((px / WAVE) * Math.PI * 2)).toFixed(2)}`

  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  return (
    <div
      ref={ref}
      className="wavy"
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(frac * duration)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(at(e))
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        const f = at(e)
        setDrag(null)
        if (duration > 0) usePlayer.getState().seek(f * duration)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <svg width={width} height="28" viewBox={`0 0 ${width} 28`} aria-hidden>
        <defs>
          <clipPath id="wavy-clip">
            <rect x="0" y="0" width={x} height="28" />
          </clipPath>
        </defs>
        <line x1={x} y1={mid} x2={width} y2={mid} className="wavy-rest" />
        <g clipPath="url(#wavy-clip)">
          <path d={d} className={`wavy-line ${playing ? 'run' : ''}`} />
        </g>
        <rect x={Math.max(0, x - 2)} y="3" width="4" height="22" rx="2" className="wavy-thumb" />
      </svg>
    </div>
  )
}

type View = 'art' | 'lyrics' | 'queue'

/** "Modern" player screen: big rounded art, a wide play pill, wavy progress and a floating action bar. */
export function ModernPlayer({ song, h1, h2, grab }: { song: Song; h1: number; h2: number; grab: (e: ReactPointerEvent) => void }) {
  const playing = usePlayer((s) => s.playing)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const { toggle, next, prev, toggleShuffle, cycleRepeat } = usePlayer.getState()
  const liked = useLibrary((s) => s.liked.includes(song.id))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const close = useUi((s) => s.setNowPlaying)
  const openMenu = useUi((s) => s.openSongMenu)
  const [view, setView] = useState<View>('art')
  const toggleView = (v: View) => setView((cur) => (cur === v ? 'art' : v))

  return (
    <div className="np-inner ps-modern" style={{ '--h1': h1, '--h2': h2 } as CSSProperties}>
      <div className="md-head grab" onPointerDown={grab}>
        <button className="md-round" aria-label="Close now playing" onClick={() => close(false)}>
          <ChevronDown size={24} />
        </button>
        {view !== 'art' && (
          <div className="md-mini">
            <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} size={44} className="r8" />
            <div className="min0">
              <div className="truncate t">{song.title}</div>
              <div className="truncate a">{song.artist}</div>
            </div>
          </div>
        )}
        <button
          className="md-round"
          aria-label="More options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openMenu({ song, x: r.right - 240, y: r.bottom + 6 })
          }}
        >
          <MoreVertical size={22} />
        </button>
      </div>

      {view === 'art' ? (
        <div className="md-stage grab" onPointerDown={grab}>
          <div className={`md-art ${playing ? 'on' : ''}`}>
            <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} />
          </div>
          <h1 className="md-title">{song.title}</h1>
          <p className="md-artist">{song.artist}</p>
        </div>
      ) : (
        <div className="md-panel">{view === 'lyrics' ? <Lyrics /> : <Queue />}</div>
      )}

      <div className="md-controls">
        <div className="md-row">
          <button className="md-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>
          <button className="md-round big" aria-label="Next" onClick={() => next()}>
            <SkipForward size={24} fill="currentColor" />
          </button>
        </div>
        <div className="md-row seek">
          <button className="md-round big" aria-label="Previous" onClick={prev}>
            <SkipBack size={24} fill="currentColor" />
          </button>
          <div className="md-seek">
            <WavyProgress />
            <div className="md-times">
              <CurrentTime />
              <TotalTime />
            </div>
          </div>
        </div>
        <div className="md-bar">
          <button className={repeat !== 'off' ? 'on' : ''} aria-label={`Repeat ${repeat}`} onClick={cycleRepeat}>
            {repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
          </button>
          <button className={shuffle ? 'on' : ''} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
            <Shuffle size={22} />
          </button>
          <button className={liked ? 'on' : ''} aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'} aria-pressed={liked} onClick={() => toggleLike(song.id)}>
            <Heart size={22} fill={liked ? 'currentColor' : 'none'} />
          </button>
          <button className={view === 'lyrics' ? 'on' : ''} aria-label="Lyrics" aria-pressed={view === 'lyrics'} onClick={() => toggleView('lyrics')}>
            <Mic2 size={22} />
          </button>
          <button className={view === 'queue' ? 'on' : ''} aria-label="Queue" aria-pressed={view === 'queue'} onClick={() => toggleView('queue')}>
            <ListMusic size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}
