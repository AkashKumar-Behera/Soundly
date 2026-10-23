import { useEffect, useRef, useState } from 'react'
import { Mic2 } from 'lucide-react'
import { api, isDemo } from '../api/client'
import { lyricsCache } from '../lib/lyricsCache'
import type { LyricsData } from '../lib/lyricsCache'
import { useLibrary, useRole } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Cover } from './Cover'

const offsetKey = (id: string) => `soundly.lyrics-offset.${id}`
const loadOffset = (id: string) => {
  try {
    return Number(localStorage.getItem(offsetKey(id))) || 0
  } catch {
    return 0
  }
}

export function Lyrics() {
  const song = useCurrent()
  const id = song?.id
  const [data, setData] = useState<LyricsData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [offset, setOffset] = useState(0)
  const refs = useRef<(HTMLParagraphElement | null)[]>([])
  const [tick, setTick] = useState(0)
  const role = useRole()
  const mode = useLibrary((s) => s.mode)
  const setEditor = useUi((s) => s.setLyricsEditor)
  const canEdit = mode === 'api' && (role === 'trusted' || role === 'admin')

  useEffect(() => {
    const again = (e: Event) => (e as CustomEvent<string>).detail === id && setTick((n) => n + 1)
    window.addEventListener('soundly:lyrics-changed', again)
    return () => window.removeEventListener('soundly:lyrics-changed', again)
  }, [id])

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
  }, [id, tick])

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

  const edit = canEdit && song ? (
    <button className="lyrics-add" onClick={() => setEditor(song)}>
      <Mic2 size={15} /> {data?.found ? 'Fix lyrics' : 'Add lyrics'}
    </button>
  ) : null
  const note = data?.mine ? <small>{data.pending ? 'Your version. Only you see it until an admin approves.' : 'Your version.'}</small> : null

  if (isDemo()) return <div className="lyrics"><small>Lyrics need the live server.</small></div>
  if (state === 'loading') return <div className="lyrics"><small>Finding lyrics…</small></div>
  if (state === 'error' || !data) return <div className="lyrics"><small>Could not load lyrics. Try again in a bit.</small></div>
  if (data.instrumental) return <div className="lyrics"><small>Instrumental. No lyrics here.</small>{edit}</div>
  if (!data.found) return <div className="lyrics"><small>No lyrics found for this song.</small>{edit}</div>

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
        {note}
        {edit}
      </div>
    )
  }

  return (
    <div className="lyrics plain">
      {data.plain?.split(String.fromCharCode(10)).map((l, i) => (
        <p key={i}>{l || ' '}</p>
      ))}
      <small>{data.approx ? 'Lyrics from another version of this song, so they may differ. Not synced.' : 'Not synced for this song.'}</small>
      {note}
      {edit}
    </div>
  )
}

export function Queue() {
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

