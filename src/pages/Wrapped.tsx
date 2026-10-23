import { AnimatePresence, animate, motion } from 'motion/react'
import { Share2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, thumbUrl } from '../api/client'
import { Cover } from '../components/Cover'
import { hueFromId, useLibrary } from '../store/library'
import { useUi } from '../store/ui'

type Range = 'year' | '30d' | 'all'

interface WrappedData {
  empty: boolean
  range: Range
  since: string | null
  totals: { plays: number; minutes: number; uniqueSongs: number; activeDays: number }
  topSongs: { id: string; title: string; artist: string | null; hasThumb: boolean; plays: number; minutes: number }[]
  topArtists: { name: string; plays: number; minutes: number }[]
  byHour: number[]
  byWeekday: number[]
  peakHour: number
  bestDay: { day: string; plays: number; minutes: number } | null
  streak: { longest: number; current: number }
  persona: { id: string; title: string; blurb: string }
}

const RANGE_LABEL: Record<Range, string> = { year: 'this year', '30d': 'the last 30 days', all: 'all time' }
const SLIDE_MS = 7000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const controls = animate(0, to, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setV(Math.round(x)) })
    return () => controls.stop()
  }, [to])
  return <>{v.toLocaleString()}</>
}

function Rise({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}

function buildSlides(d: WrappedData, name: string): { hue: number; node: ReactNode }[] {
  const top = d.topSongs[0]
  const movies = d.totals.minutes / 110
  const slides: { hue: number; node: ReactNode }[] = []

  slides.push({
    hue: 150,
    node: (
      <>
        <Rise>
          <p className="w-kicker">{name}, here is</p>
        </Rise>
        <Rise delay={0.15}>
          <h1 className="w-huge">Your Soundly</h1>
        </Rise>
        <Rise delay={0.3}>
          <p className="w-sub">Your listening, {RANGE_LABEL[d.range]}.</p>
        </Rise>
      </>
    ),
  })

  slides.push({
    hue: 265,
    node: (
      <>
        <Rise>
          <p className="w-kicker">You listened for</p>
        </Rise>
        <h1 className="w-huge">
          <CountUp to={d.totals.minutes} />
        </h1>
        <Rise delay={0.4}>
          <p className="w-sub">minutes across {d.totals.plays.toLocaleString()} plays and {d.totals.uniqueSongs} different songs.</p>
        </Rise>
        {movies >= 1 && (
          <Rise delay={0.7}>
            <p className="w-note">That is about {movies.toFixed(movies >= 10 ? 0 : 1)} full movies.</p>
          </Rise>
        )}
      </>
    ),
  })

  if (top) {
    slides.push({
      hue: hueFromId(top.id),
      node: (
        <>
          <Rise>
            <p className="w-kicker">Your number one song</p>
          </Rise>
          <Rise delay={0.2}>
            <div className="w-cover">
              <Cover hue={hueFromId(top.id)} thumbUrl={top.hasThumb ? thumbUrl(top.id) : undefined} />
            </div>
          </Rise>
          <Rise delay={0.4}>
            <h2 className="w-title">{top.title}</h2>
            <p className="w-sub">
              {top.artist ?? 'Unknown'} · played {top.plays} time{top.plays === 1 ? '' : 's'}
            </p>
          </Rise>
        </>
      ),
    })
  }

  if (d.topArtists.length) {
    const max = d.topArtists[0].minutes || 1
    slides.push({
      hue: 20,
      node: (
        <>
          <Rise>
            <p className="w-kicker">Your top artists</p>
          </Rise>
          <ol className="w-list">
            {d.topArtists.map((a, i) => (
              <Rise key={a.name} delay={0.15 + i * 0.12}>
                <li>
                  <span className="w-rank">{i + 1}</span>
                  <span className="w-name">{a.name}</span>
                  <span className="w-bar" style={{ '--w': `${Math.max(8, (a.minutes / max) * 100)}%` } as CSSProperties} />
                  <span className="w-val">{a.minutes} min</span>
                </li>
              </Rise>
            ))}
          </ol>
        </>
      ),
    })
  }

  const peak = Math.max(...d.byHour, 1)
  slides.push({
    hue: 215,
    node: (
      <>
        <Rise>
          <p className="w-kicker">Your listening clock</p>
        </Rise>
        <Rise delay={0.15}>
          <h2 className="w-title">You play the most around {hourLabel(d.peakHour)}.</h2>
        </Rise>
        <div className="w-clock" aria-hidden="true">
          {d.byHour.map((n, h) => (
            <i key={h} className={h === d.peakHour ? 'peak' : ''} style={{ '--h': `${Math.max(4, (n / peak) * 100)}%`, animationDelay: `${0.3 + h * 0.03}s` } as CSSProperties} />
          ))}
        </div>
        <div className="w-clock-axis">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
        </div>
      </>
    ),
  })

  if (d.bestDay) {
    const wk = d.byWeekday.indexOf(Math.max(...d.byWeekday))
    slides.push({
      hue: 330,
      node: (
        <>
          <Rise>
            <p className="w-kicker">Your biggest day</p>
          </Rise>
          <Rise delay={0.15}>
            <h2 className="w-title">{longDate(d.bestDay.day)}</h2>
          </Rise>
          <Rise delay={0.3}>
            <p className="w-sub">
              {d.bestDay.minutes} minutes and {d.bestDay.plays} plays in one day.
            </p>
          </Rise>
          <Rise delay={0.5}>
            <p className="w-note">
              {DAYS[wk]} is your day · longest streak {d.streak.longest} day{d.streak.longest === 1 ? '' : 's'}
              {d.streak.current > 1 ? ` · ${d.streak.current} days going now` : ''}
            </p>
          </Rise>
        </>
      ),
    })
  }

  slides.push({
    hue: 150,
    node: (
      <>
        <Rise>
          <p className="w-kicker">You are</p>
        </Rise>
        <Rise delay={0.2}>
          <h1 className="w-persona">{d.persona.title}</h1>
        </Rise>
        <Rise delay={0.4}>
          <p className="w-sub">{d.persona.blurb}</p>
        </Rise>
        <Rise delay={0.6}>
          <div className="w-summary">
            <span>
              <b>{d.totals.minutes.toLocaleString()}</b> min
            </span>
            <span>
              <b>{d.totals.uniqueSongs}</b> songs
            </span>
            <span>
              <b>{d.totals.activeDays}</b> days
            </span>
          </div>
        </Rise>
      </>
    ),
  })
  return slides
}

function Story({ data, name, onClose }: { data: WrappedData; name: string; onClose: () => void }) {
  const showToast = useUi((s) => s.showToast)
  const slides = useMemo(() => buildSlides(data, name), [data, name])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const next = useCallback(() => setI((v) => (v < slides.length - 1 ? v + 1 : v)), [slides.length])
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), [])

  // Auto-advance, except on the last slide or while the finger/mouse is held down.
  useEffect(() => {
    clearTimeout(timer.current)
    if (paused || i >= slides.length - 1) return
    timer.current = setTimeout(next, SLIDE_MS)
    return () => clearTimeout(timer.current)
  }, [i, paused, next, slides.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  const share = async () => {
    const text = `My Soundly ${RANGE_LABEL[data.range]}: ${data.totals.minutes.toLocaleString()} minutes, ${data.totals.uniqueSongs} songs. Top song: ${data.topSongs[0]?.title ?? ''}. I'm ${data.persona.title}.`
    try {
      if (navigator.share) await navigator.share({ title: 'My Soundly Wrapped', text })
      else {
        await navigator.clipboard.writeText(text)
        showToast('Summary copied')
      }
    } catch {
      // share sheet dismissed
    }
  }

  const slide = slides[i]
  return (
    <div className="story" style={{ '--hue': slide.hue } as CSSProperties}>
      <div className="story-bars" aria-hidden="true">
        {slides.map((_, k) => (
          <span key={k}>
            <i className={k < i ? 'done' : k === i ? 'run' : ''} style={k === i ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused || i >= slides.length - 1 ? 'paused' : 'running' } : undefined} />
          </span>
        ))}
      </div>
      <button className="story-close icon-btn" aria-label="Close" onClick={onClose}>
        <X size={26} />
      </button>

      <div
        className="story-stage"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientX - r.left < r.width * 0.3) prev()
          else next()
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div key={i} className="story-slide" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }}>
            {slide.node}
          </motion.div>
        </AnimatePresence>
      </div>

      {i === slides.length - 1 && (
        <button className="btn-pill primary story-share" onClick={() => void share()}>
          <Share2 size={16} /> Share
        </button>
      )}
    </div>
  )
}

export function Wrapped() {
  const navigate = useNavigate()
  const mode = useLibrary((s) => s.mode)
  const name = useLibrary((s) => s.me?.name ?? 'You')
  const [range, setRange] = useState<Range>('year')
  const [data, setData] = useState<WrappedData | null | undefined>(undefined)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (mode !== 'api') return
    let live = true
    setData(undefined)
    // The server groups by local hour using this offset (minutes east of UTC).
    const tz = -new Date().getTimezoneOffset()
    void api<WrappedData>(`/wrapped?range=${range}&tz=${tz}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [range, mode])

  const close = useCallback(() => setPlaying(false), [])

  if (mode !== 'api') return <p className="muted empty">Wrapped needs the live server.</p>

  return (
    <>
      <h1 className="page-title">Wrapped</h1>
      <div className="wrapped-card">
        <div className="chips">
          {(['year', '30d', 'all'] as Range[]).map((r) => (
            <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>
              {r === 'year' ? 'This year' : r === '30d' ? 'Last 30 days' : 'All time'}
            </button>
          ))}
        </div>
        {data === undefined && <p className="muted">Counting your plays…</p>}
        {data === null && <p className="muted">Could not load your recap. Try again.</p>}
        {data?.empty && <p className="muted">No plays {RANGE_LABEL[range]} yet. Listen to a few songs (15 seconds or more counts) and come back.</p>}
        {data && !data.empty && (
          <>
            <p className="wrapped-teaser">
              <b>{data.totals.minutes.toLocaleString()}</b> minutes · <b>{data.totals.uniqueSongs}</b> songs · you are <b>{data.persona.title}</b>
            </p>
            <button className="btn-pill primary" onClick={() => setPlaying(true)}>
              Play my story
            </button>
          </>
        )}
      </div>
      {playing && data && !data.empty && <Story data={data} name={name} onClose={close} />}
      <button className="link-btn back" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  )
}
