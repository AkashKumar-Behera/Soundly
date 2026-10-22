import { Pause, Play } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Cover } from './Cover'

interface Props {
  hue: number
  hue2?: number
  title: string
  subtitle: string
  onOpen: () => void
  onPlay: () => void
  playing?: boolean
  round?: boolean
}

export function Card({ hue, hue2, title, subtitle, onOpen, onPlay, playing, round }: Props) {
  const play = (e: MouseEvent) => {
    e.stopPropagation()
    onPlay()
  }
  return (
    <div
      className="card"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="card-art">
        <Cover hue={hue} hue2={hue2} round={round} />
        <button className="fab" aria-label={`${playing ? 'Pause' : 'Play'} ${title}`} onClick={play}>
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
      </div>
      <div className="card-title truncate">{title}</div>
      <div className="card-sub">{subtitle}</div>
    </div>
  )
}

export function Shelf({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="shelf-row">{children}</div>
    </section>
  )
}
