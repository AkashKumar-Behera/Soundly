import { AnimatePresence, motion, useDragControls } from 'motion/react'
import type { DragControls } from 'motion/react'
import { ChevronDown, Heart, MoreHorizontal, Users, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useApp } from '../store/app'
import { useLibrary } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'
import { useRoom } from '../store/room'
import { useUi } from '../store/ui'
import { Cover } from './Cover'
import { CurrentTime, ProgressBar, TotalTime } from './ProgressBar'
import { coverHues } from '../lib/coverColor'
import { Lyrics, Queue } from './NpPanels'
import { ModernPlayer } from './ModernPlayer'

type Tab = 'lyrics' | 'queue'

function Content({ controls }: { controls: DragControls }) {
  const song = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const { toggle, next, prev, toggleShuffle, cycleRepeat } = usePlayer.getState()
  const playerStyle = useApp((s) => s.playerStyle)
  const liked = useLibrary((s) => (song ? s.liked.includes(song.id) : false))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const close = useUi((s) => s.setNowPlaying)
  const setRoomModal = useUi((s) => s.setRoomModal)
  const openMenu = useUi((s) => s.openSongMenu)
  const inRoom = useRoom((s) => !!s.code)
  const [tab, setTab] = useState<Tab>('lyrics')
  const [hues, setHues] = useState<{ url: string; h: [number, number] } | null>(null)
  const thumb = song?.thumbUrl

  useEffect(() => {
    if (!thumb) return
    let live = true
    coverHues(thumb).then((h) => live && h && setHues({ url: thumb, h }))
    return () => {
      live = false
    }
  }, [thumb])

  if (!song) return null
  const [h1, h2] = hues && hues.url === thumb ? hues.h : [song.hue, song.hue2]
  const grab = (e: React.PointerEvent) => controls.start(e)

  if (playerStyle === 'modern') return <ModernPlayer song={song} h1={h1} h2={h2} grab={grab} />

  const art =
    playerStyle === 'vinyl' ? (
      <div className={`vinyl ${playing ? 'spin' : ''}`}>
        <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} round className="vinyl-label" />
      </div>
    ) : (
      <div className={`np-art ${playerStyle} ${playing ? 'on' : ''}`}>
        <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} />
      </div>
    )

  return (
    <div
      className={`np-inner ps-${playerStyle}`}
      style={{ '--h1': h1, '--h2': h2 } as CSSProperties}
    >
      <div className="np-head grab" onPointerDown={grab}>
        <button className="icon-btn" aria-label="Close now playing" onClick={() => close(false)}>
          <ChevronDown size={28} />
        </button>
        <span>Playing from your library</span>
        <div className="np-head-right">
          <button className={`icon-btn ${inRoom ? 'on' : ''}`} aria-label="Listen together" onClick={() => setRoomModal(true)}>
            <Users size={22} />
          </button>
          <button
            className="icon-btn"
            aria-label="More options"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              openMenu({ song, x: r.right - 240, y: r.bottom + 6 })
            }}
          >
            <MoreHorizontal size={22} />
          </button>
        </div>
      </div>

      <div className="np-body">
        <div className="np-main">
          <div className="grab" onPointerDown={grab}>
            {art}
          </div>
          <div className="np-meta">
            <div className="min0">
              <h1 className="truncate">{song.title}</h1>
              <p className="truncate">{song.artist}</p>
            </div>
            <button
              className={`like ${liked ? 'on' : ''}`}
              aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
              aria-pressed={liked}
              onClick={() => toggleLike(song.id)}
            >
              <Heart size={26} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="np-seek">
            <ProgressBar />
            <div className="np-times">
              <CurrentTime />
              <TotalTime />
            </div>
          </div>
          <div className="np-controls">
            <button className={`icon-btn ${shuffle ? 'on' : ''}`} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
              <Shuffle size={22} />
            </button>
            <button className="icon-btn" aria-label="Previous" onClick={prev}>
              <SkipBack size={30} fill="currentColor" />
            </button>
            <motion.button className="play-btn big" aria-label={playing ? 'Pause' : 'Play'} whileTap={{ scale: 0.92 }} onClick={toggle}>
              {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
            </motion.button>
            <button className="icon-btn" aria-label="Next" onClick={() => next()}>
              <SkipForward size={30} fill="currentColor" />
            </button>
            <button className={`icon-btn ${repeat !== 'off' ? 'on' : ''}`} aria-label={`Repeat ${repeat}`} onClick={cycleRepeat}>
              {repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
            </button>
          </div>
        </div>

        <div className="np-side">
          <div className="np-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'lyrics'} className={tab === 'lyrics' ? 'on' : ''} onClick={() => setTab('lyrics')}>
              Lyrics
            </button>
            <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>
              Queue
            </button>
          </div>
          <div className="np-panel">{tab === 'lyrics' ? <Lyrics /> : <Queue />}</div>
        </div>
      </div>
    </div>
  )
}

export function NowPlaying() {
  const open = useUi((s) => s.nowPlaying)
  const close = useUi((s) => s.setNowPlaying)
  const controls = useDragControls()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="np"
          role="dialog"
          aria-label="Now playing"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          drag="y"
          dragControls={controls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 110 || info.velocity.y > 650) close(false)
          }}
        >
          <Content controls={controls} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
