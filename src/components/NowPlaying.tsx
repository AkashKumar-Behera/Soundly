import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Heart, Users, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, isDemo } from '../api/client'
import { useApp } from '../store/app'
import { useLibrary } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'
import { useRoom } from '../store/room'
import { useUi } from '../store/ui'
import { Cover } from './Cover'
import { CurrentTime, ProgressBar, TotalTime } from './ProgressBar'
import { Visualizer } from './Visualizer'

type Tab = 'lyrics' | 'queue'

interface LyricsData {
  found: boolean
  instrumental: boolean
  approx: boolean
  synced: { t: number; text: string }[] | null
  plain: string | null
}

const lyricsCache = new Map<string, LyricsData>()
const offsetKey = (id: string) => `soundly.lyrics-offset.${id}`
const loadOffset = (id: string) => {
  try {
    return Number(localStorage.getItem(offsetKey(id))) || 0
  } catch {
    return 0
  }
}

function Lyrics() {
  const song = useCurrent()
  const id = song?.id
  const [data, setData] = useState<LyricsData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [offset, setOffset] = useState(0)
  const refs = useRef<(HTMLParagraphElement | null)[]>([])

  useEffect(() => {
    if (!id) return
    setOffset(loadOffset(id))
    const hit = lyricsCache.get(id)
    if (hit) {
      setData(hit)
      setState('ready')
      return
    }
    setData(null)
    setState('loading')
    let live = true
    api<LyricsData>(`/lyrics/${id}`)
      .then((d) => {
        lyricsCache.set(id, d)
        if (live) {
          setData(d)
          setState('ready')
        }
      })
      .catch(() => live && setState('error'))
    return () => {
      live = false
    }
  }, [id])

  const lines = data?.synced
  // Subscribe to the line index only, so the panel re-renders on a line change and not on every time tick.
  const active = usePlayer((s) => {
    if (!lines?.length) return -1
    const t = s.time + 0.25 + offset
    let lo = 0
    let hi = lines.length - 1
    let at = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid].t <= t) {
        at = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return at
  })

  useEffect(() => {
    if (active >= 0) refs.current[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  const nudge = (d: number) => {
    if (!id) return
    const next = Math.round((offset + d) * 10) / 10
    setOffset(next)
    try {
      localStorage.setItem(offsetKey(id), String(next))
    } catch {
      /* private mode: the nudge just lasts for this session */
    }
  }

  if (isDemo()) return <div className="lyrics"><small>Lyrics need the live server.</small></div>
  if (state === 'loading') return <div className="lyrics"><small>Finding lyrics…</small></div>
  if (state === 'error' || !data) return <div className="lyrics"><small>Could not load lyrics. Try again in a bit.</small></div>
  if (data.instrumental) return <div className="lyrics"><small>Instrumental. No lyrics here.</small></div>
  if (!data.found) return <div className="lyrics"><small>No lyrics found for this song.</small></div>

  if (lines?.length) {
    return (
      <div className="lyrics">
        {lines.map((line, i) => (
          <p
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={i === active ? 'on' : i < active ? 'past' : ''}
            onClick={() => usePlayer.getState().seek(Math.max(0, line.t - offset))}
          >
            {line.text || '♪'}
          </p>
        ))}
        <div className="lyrics-sync">
          <button onClick={() => nudge(-0.5)} aria-label="Lyrics earlier">
            Earlier
          </button>
          <span>{offset === 0 ? 'In sync' : `${offset > 0 ? '+' : ''}${offset}s`}</span>
          <button onClick={() => nudge(0.5)} aria-label="Lyrics later">
            Later
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lyrics plain">
      {data.plain?.split(String.fromCharCode(10)).map((l, i) => (
        <p key={i}>{l || ' '}</p>
      ))}
      <small>{data.approx ? 'Lyrics from another version of this song, so they may differ. Not synced.' : 'Not synced for this song.'}</small>
    </div>
  )
}

function Queue() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playAt = usePlayer((s) => s.playAt)
  return (
    <div className="np-queue">
      {queue.map((s, i) => (
        <button key={`${s.id}-${i}`} className={i === index ? 'on' : ''} onClick={() => playAt(i)}>
          <Cover hue={s.hue} hue2={s.hue2} thumbUrl={s.thumbUrl} size={40} className="r8" />
          <div className="min0">
            <div className="truncate t">{s.title}</div>
            <div className="truncate a">{s.artist}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function Content() {
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
  const inRoom = useRoom((s) => !!s.code)
  const [tab, setTab] = useState<Tab>('lyrics')

  if (!song) return null

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
      style={{ '--h1': song.hue, '--h2': song.hue2 } as CSSProperties}
    >
      <div className="np-head">
        <button className="icon-btn" aria-label="Close now playing" onClick={() => close(false)}>
          <ChevronDown size={28} />
        </button>
        <span>Playing from your library</span>
        <button className={`icon-btn ${inRoom ? 'on' : ''}`} aria-label="Listen together" onClick={() => setRoomModal(true)}>
          <Users size={22} />
        </button>
      </div>

      <div className="np-body">
        <div className="np-main">
          {art}
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
          <Visualizer />
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
        >
          <Content />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
