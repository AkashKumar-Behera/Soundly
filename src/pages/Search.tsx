import { CirclePlay, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { SongRow } from '../components/SongRow'
import { categories } from '../data/mock'
import type { Song } from '../data/mock'
import { hueFromId, useCanRequestDirect, useLibrary, useRole } from '../store/library'
import type { RequestResult } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

/** Deterministic 11-character id so the same mock result always maps to the same request. */
function fakeVideoId(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  return (h.toString(36) + (h ^ 0x9e3779b9).toString(36) + 'abcdefghijk').slice(0, 11)
}

const messages: Record<string, string> = {
  already_available: 'That song is already in the library',
  already_requested: 'Someone already requested this song',
  daily_limit_reached: 'You have used all of today’s requests',
  forbidden: 'Your account cannot request songs',
  invalid_request: 'Could not send that request',
  network: 'Could not reach the server',
}

export function Search() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const playQueue = usePlayer((s) => s.playQueue)
  const role = useRole()
  const direct = useCanRequestDirect()
  const searchSongs = useLibrary((s) => s.searchSongs)
  const createRequest = useLibrary((s) => s.createRequest)
  const showToast = useUi((s) => s.showToast)
  const [results, setResults] = useState<Song[] | null>(null)

  // Debounced library search; a stale response never overwrites a newer one.
  useEffect(() => {
    if (!q) return
    let live = true
    const t = setTimeout(() => {
      searchSongs(q)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
    }, 200)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, searchSongs])

  if (!q) {
    return (
      <>
        <h2 className="section-title">Browse all</h2>
        <div className="cats">
          {categories.map((c) => (
            <button key={c.id} className="cat" style={{ background: `linear-gradient(135deg, hsl(${c.hue} 70% 42%), hsl(${c.hue + 40} 70% 28%))` }} onClick={() => setParams({ q: c.title })}>
              {c.title}
            </button>
          ))}
        </div>
      </>
    )
  }

  // Placeholder YouTube results. Real ones arrive with the laptop agent (yt-dlp metadata search).
  const yt = [
    { suffix: '(Official Audio)', channel: `${q} - Topic`, dur: 222, label: '3:42' },
    { suffix: '| Lyrics', channel: 'Lyrics Hub', dur: 220, label: '3:40' },
    { suffix: '(Live Session)', channel: 'Live Sessions', dur: 250, label: '4:10' },
  ].map((v) => ({ ...v, title: `${q} ${v.suffix}`, id: fakeVideoId(`${q} ${v.suffix}`) }))

  const request = async (v: (typeof yt)[number]) => {
    const r: RequestResult = await createRequest({ youtubeId: v.id, title: v.title, channel: v.channel, durationSec: v.dur, category: 'Music' })
    if (r.ok) showToast(r.status === 'queued' ? 'Added to the download queue' : 'Request sent for admin approval')
    else showToast(messages[r.error] ?? 'Request failed')
  }

  const list = results ?? []

  return (
    <>
      <h2 className="section-title">In your library</h2>
      {list.length ? (
        <div className="song-table">
          {list.map((s, i) => (
            <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i)} />
          ))}
        </div>
      ) : (
        <p className="muted empty">{results === null ? 'Searching…' : `No songs matching “${q}” in your library yet.`}</p>
      )}

      <h2 className="section-title yt-title">
        <CirclePlay size={22} /> Not here? Search on YouTube
      </h2>
      <div className="yt-list">
        {yt.map((v) => (
          <div key={v.id} className="yt-item">
            <Cover hue={hueFromId(v.id)} size={56} className="r8" />
            <div className="min0">
              <div className="truncate yt-t">{v.title}</div>
              <div className="truncate muted">
                {v.channel} · {v.label}
              </div>
            </div>
            <button className="btn-pill" disabled={role === 'listener'} onClick={() => void request(v)}>
              <Download size={16} />
              {direct ? 'Add to queue' : 'Request song'}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
