import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { formatTime } from '../../lib/format'
import { useUi } from '../../store/ui'
import { timeAgo, useAdminData } from './ui'

interface Artist {
  browseId: string
  name: string
  subtitle: string
  thumbnail: string
}
interface Track {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  thumbnail: string
  songId: string | null
  requestStatus: string | null
}

interface ArtistRequest {
  id: string
  name: string
  imageUrl: string | null
  userName: string
  createdAt: string
}

/** Artists that members asked for; approving queues the whole catalogue. */
function ArtistRequests() {
  const showToast = useUi((s) => s.showToast)
  const { data, reload } = useAdminData<{ requests: ArtistRequest[] }>('/admin/artists/requests', ['artists'])
  const rows = data?.requests ?? []
  if (!rows.length) return null

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      const r = await api<{ queued: number }>(`/admin/artists/requests/${id}/${decision}`, { method: 'POST', body: {} })
      showToast(decision === 'approve' ? `${r.queued} songs queued` : 'Rejected')
    } catch {
      showToast('Could not do that, refreshing')
    }
    void reload()
  }

  return (
    <>
      <h3>Requested by members</h3>
      <div className="rows">
        {rows.map((r) => (
          <div key={r.id} className="row">
            {r.imageUrl && <img className="artist-pic" src={r.imageUrl} alt="" width={48} height={48} referrerPolicy="no-referrer" />}
            <div className="min0 grow">
              <div className="truncate strong">{r.name}</div>
              <div className="truncate muted">
                {r.userName} · {timeAgo(r.createdAt)}
              </div>
            </div>
            <button className="btn-pill" onClick={() => void decide(r.id, 'approve')}>
              Approve all songs
            </button>
            <button className="btn-pill ghost" onClick={() => void decide(r.id, 'reject')}>
              Reject
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

/** Find an artist and queue their whole catalogue for download in one go. */
export function ArtistsTab() {
  const showToast = useUi((s) => s.showToast)
  const [q, setQ] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [artist, setArtist] = useState<Artist | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return setArtists([])
    let live = true
    const t = setTimeout(() => {
      api<{ artists: Artist[] }>(`/admin/artists?q=${encodeURIComponent(q.trim())}`)
        .then((d) => live && setArtists(d.artists))
        .catch(() => live && setArtists([]))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const open = async (a: Artist) => {
    setArtist(a)
    setTracks(null)
    setSkip(new Set())
    try {
      const d = await api<{ songs: Track[] }>(`/admin/artists/${a.browseId}/songs`)
      setTracks(d.songs)
    } catch {
      showToast('Could not load that artist')
      setArtist(null)
    }
  }

  const fresh = (tracks ?? []).filter((t) => !t.songId && !t.requestStatus)
  const chosen = fresh.filter((t) => !skip.has(t.youtubeId))

  const download = async () => {
    if (!artist || !chosen.length) return
    setBusy(true)
    try {
      const r = await api<{ queued: number; skipped: number }>(`/admin/artists/${artist.browseId}/download`, { method: 'POST', body: { ids: chosen.map((t) => t.youtubeId) } })
      showToast(`${r.queued} songs queued for download`)
      await open(artist)
    } catch {
      showToast('Could not queue the songs')
    }
    setBusy(false)
  }

  return (
    <>
      <ArtistRequests />
      <p className="muted">Search an artist, then download their whole catalogue. The laptop agent works through the queue when it is on home Wi-Fi.</p>
      <label className="search artist-search">
        <input value={q} placeholder="Artist name" onChange={(e) => setQ(e.target.value)} />
      </label>

      {!artist && (
        <div className="rows">
          {artists.map((a) => (
            <button key={a.browseId} className="row artist-row" onClick={() => void open(a)}>
              <img src={a.thumbnail} alt="" width={48} height={48} />
              <div className="min0 grow">
                <div className="truncate strong">{a.name}</div>
                <div className="truncate muted">{a.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {artist && (
        <>
          <div className="artist-head">
            <button className="link-btn" onClick={() => setArtist(null)}>
              ← All artists
            </button>
            <h3>{artist.name}</h3>
          </div>
          {tracks === null && <p className="muted empty">Loading songs…</p>}
          {tracks && (
            <>
              <div className="artist-actions">
                <span className="muted">
                  {tracks.length} songs · {tracks.length - fresh.length} already here or queued
                </span>
                <button className="btn-pill" disabled={busy || !chosen.length} onClick={() => void download()}>
                  <Download size={16} /> Download {chosen.length} songs
                </button>
              </div>
              <div className="rows">
                {tracks.map((t) => {
                  const have = !!t.songId || !!t.requestStatus
                  return (
                    <label key={t.youtubeId} className={`row artist-track ${have ? 'have' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={have}
                        checked={!have && !skip.has(t.youtubeId)}
                        onChange={(e) => setSkip((cur) => {
                          const next = new Set(cur)
                          if (e.target.checked) next.delete(t.youtubeId)
                          else next.add(t.youtubeId)
                          return next
                        })}
                      />
                      <div className="min0 grow">
                        <div className="truncate strong">{t.title}</div>
                        <div className="truncate muted">{t.channel}</div>
                      </div>
                      <span className="muted">{have ? (t.songId ? 'In library' : 'Queued') : formatTime(t.durationSec)}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
