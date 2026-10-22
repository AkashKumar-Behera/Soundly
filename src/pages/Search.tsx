import { CirclePlay, Download } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { SongRow } from '../components/SongRow'
import { categories, songs } from '../data/mock'
import { canRequestDirect, useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

export function Search() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const playQueue = usePlayer((s) => s.playQueue)
  const role = useApp((s) => s.role)
  const addRequest = useApp((s) => s.addRequest)
  const showToast = useUi((s) => s.showToast)
  const direct = canRequestDirect(role)

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

  const needle = q.toLowerCase()
  const results = songs.filter((s) => [s.title, s.artist, s.album].some((f) => f.toLowerCase().includes(needle)))

  // Mock YouTube results; the real ones will come from yt-dlp metadata via the laptop agent.
  const yt = [
    { id: 'y1', title: `${q} (Official Audio)`, channel: `${q} - Topic`, dur: '3:42', hue: 12 },
    { id: 'y2', title: `${q} | Lyrics`, channel: 'Lyrics Hub', dur: '3:40', hue: 200 },
    { id: 'y3', title: `${q} (Live Session)`, channel: 'Live Sessions', dur: '4:10', hue: 285 },
  ]

  const request = (title: string, channel: string) => {
    const status = addRequest(title, channel)
    showToast(status === 'queued' ? 'Added to the download queue' : 'Request sent for admin approval')
  }

  return (
    <>
      <h2 className="section-title">In your library</h2>
      {results.length ? (
        <div className="song-table">
          {results.map((s, i) => (
            <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(results, i)} />
          ))}
        </div>
      ) : (
        <p className="muted empty">No songs matching “{q}” in your library yet.</p>
      )}

      <h2 className="section-title yt-title">
        <CirclePlay size={22} /> Not here? Search on YouTube
      </h2>
      <div className="yt-list">
        {yt.map((v) => (
          <div key={v.id} className="yt-item">
            <Cover hue={v.hue} size={56} className="r8" />
            <div className="min0">
              <div className="truncate yt-t">{v.title}</div>
              <div className="truncate muted">
                {v.channel} · {v.dur}
              </div>
            </div>
            <button className="btn-pill" onClick={() => request(v.title, v.channel)}>
              <Download size={16} />
              {direct ? 'Add to queue' : 'Request song'}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
