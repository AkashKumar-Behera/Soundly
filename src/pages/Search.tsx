import { CirclePlay } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ImportPanel } from '../components/ImportPanel'
import { YoutubeRow } from '../components/YoutubeRow'
import { SongRow } from '../components/SongRow'
import { categories } from '../data/mock'
import type { Song } from '../data/mock'
import { parseYoutubeLink } from '../lib/youtubeUrl'
import { useCanRequestDirect, useLibrary, useRole } from '../store/library'
import type { YoutubeResult } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

const messages: Record<string, string> = {
  already_available: 'That song is already in the library',
  already_requested: 'Someone already requested this song',
  daily_limit_reached: 'You have used all of today’s requests',
  forbidden: 'Your account cannot request songs',
  invalid_request: 'Could not send that request',
  network: 'Could not reach the server',
  youtube_not_configured: 'YouTube search is not set up on this server yet',
  search_limit: 'You have used today’s YouTube searches',
  search_quota: 'YouTube search is busy today, try again tomorrow',
  youtube_error: 'YouTube search failed, try again',
  query_too_short: 'Type a little more to search YouTube',
  not_found: 'YouTube could not find that video',
}

type YtState = { q: string; phase: 'loading' | 'done' | 'error'; results: YoutubeResult[]; error?: string }

export function Search() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const playQueue = usePlayer((s) => s.playQueue)
  const role = useRole()
  const direct = useCanRequestDirect()
  const searchSongs = useLibrary((s) => s.searchSongs)
  const searchYoutube = useLibrary((s) => s.searchYoutube)
  const lookupVideo = useLibrary((s) => s.lookupVideo)
  const createRequest = useLibrary((s) => s.createRequest)
  const showToast = useUi((s) => s.showToast)
  const [results, setResults] = useState<Song[] | null>(null)
  const [yt, setYt] = useState<YtState | null>(null)

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

  // YouTube results belong to one query; typing something else clears them.
  const ytForQuery = yt && yt.q === q ? yt : null

  const runYoutube = async () => {
    setYt({ q, phase: 'loading', results: [] })
    const r = await searchYoutube(q)
    setYt(r.ok ? { q, phase: 'done', results: r.results } : { q, phase: 'error', results: [], error: r.error })
  }

  const link = parseYoutubeLink(q)

  // A pasted video link skips the search and shows that exact video.
  useEffect(() => {
    if (link?.kind !== 'video') return
    let live = true
    setYt({ q, phase: 'loading', results: [] })
    void lookupVideo(link.id).then((r) => live && setYt(r.ok ? { q, phase: 'done', results: r.results } : { q, phase: 'error', results: [], error: r.error }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const request = async (v: YoutubeResult) => {
    const r = await createRequest({ youtubeId: v.youtubeId, title: v.title, channel: v.channel, durationSec: v.durationSec, category: v.category })
    if (r.ok) {
      showToast(r.status === 'queued' ? 'Added to the download queue' : 'Request sent for admin approval')
      setYt((cur) => (cur ? { ...cur, results: cur.results.map((x) => (x.youtubeId === v.youtubeId ? { ...x, requestStatus: r.status } : x)) } : cur))
    } else {
      showToast(messages[r.error] ?? 'Request failed')
    }
  }

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

  if (link?.kind === 'playlist') return <ImportPanel listId={link.listId} />

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

      {!ytForQuery && link?.kind !== 'video' && (
        <button className="btn-pill yt-go" disabled={role === 'listener'} onClick={() => void runYoutube()}>
          Search YouTube for “{q}”
        </button>
      )}
      {role === 'listener' && <p className="muted empty">Listeners can’t request songs.</p>}
      {ytForQuery?.phase === 'loading' && <p className="muted empty">Searching YouTube…</p>}
      {ytForQuery?.phase === 'error' && (
        <p className="muted empty">
          {messages[ytForQuery.error ?? ''] ?? 'YouTube search failed.'}{' '}
          <button className="link-btn" onClick={() => void runYoutube()}>
            Try again
          </button>
        </p>
      )}
      {ytForQuery?.phase === 'done' && !ytForQuery.results.length && <p className="muted empty">YouTube found nothing for “{q}”.</p>}

      <div className="yt-list">
        {ytForQuery?.results.map((v) => (
          <YoutubeRow key={v.youtubeId} video={v} direct={direct} onRequest={(x) => void request(x)} />
        ))}
      </div>
    </>
  )
}
