import { Check, Clock, DownloadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { hueFromId, useLibrary, useRole } from '../store/library'
import { useUi } from '../store/ui'

interface LibArtist {
  id: string
  name: string
  browseId: string | null
  imageUrl: string | null
  songCount: number
}
interface FoundArtist {
  browseId: string
  name: string
  subtitle: string
  thumbnail: string
}

function Avatar({ name, url, id, size }: { name: string; url: string | null; id: string; size: number }) {
  const hue = hueFromId(id)
  return url ? (
    <img className="artist-pic" src={url} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <div className="artist-pic fallback" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 50) % 360} 65% 28%))` }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

/** Artists in the library, plus a way to ask for any artist's whole catalogue. */
export function Artists() {
  const navigate = useNavigate()
  const role = useRole()
  const mode = useLibrary((s) => s.mode)
  const showToast = useUi((s) => s.showToast)
  const [artists, setArtists] = useState<LibArtist[] | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<FoundArtist[]>([])
  const [done, setDone] = useState<Record<string, 'queued' | 'pending'>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const direct = role === 'trusted' || role === 'admin'

  useEffect(() => {
    if (mode !== 'api') return setArtists([])
    let live = true
    api<{ artists: LibArtist[] }>('/artists')
      .then((d) => live && setArtists(d.artists))
      .catch(() => live && setArtists([]))
    return () => {
      live = false
    }
  }, [mode])

  useEffect(() => {
    if (q.trim().length < 2 || mode !== 'api') return setFound([])
    let live = true
    const t = setTimeout(() => {
      api<{ artists: FoundArtist[] }>(`/artists/search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => live && setFound(d.artists))
        .catch(() => live && setFound([]))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, mode])

  const request = async (browseId: string, name: string, imageUrl: string | null) => {
    setBusy(browseId)
    try {
      const r = await api<{ status: 'queued' | 'pending'; queued?: number }>('/artists/request', { method: 'POST', body: { browseId, name, imageUrl } })
      setDone((d) => ({ ...d, [browseId]: r.status }))
      showToast(r.status === 'queued' ? `${r.queued ?? 0} songs by ${name} added to the download queue` : `Request for ${name} sent to the admin`)
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      showToast(
        code === 'daily_limit_reached' ? 'You have used today’s artist requests' : code === 'already_requested' ? 'You already asked for this artist' : code === 'forbidden' ? 'Listeners can’t request songs' : 'Could not send that request',
      )
    }
    setBusy(null)
  }

  const button = (browseId: string | null, name: string, imageUrl: string | null) => {
    if (!browseId || role === 'listener') return null
    const state = done[browseId]
    return state ? (
      <span className="status done">
        {state === 'queued' ? <Check size={14} /> : <Clock size={14} />} {state === 'queued' ? 'Queued' : 'Requested'}
      </span>
    ) : (
      <button className="btn-pill" disabled={busy === browseId} onClick={(e) => { e.stopPropagation(); void request(browseId, name, imageUrl) }}>
        <DownloadCloud size={16} /> {direct ? 'Add all songs' : 'Request all songs'}
      </button>
    )
  }

  if (mode !== 'api') return <p className="muted empty">Artists need the live server.</p>

  return (
    <>
      <h1 className="page-title">Artists</h1>
      <p className="muted">{direct ? 'Ask for an artist and every song of theirs joins the download queue.' : 'Ask for an artist and an admin approves adding their songs.'}</p>
      <label className="search artist-search">
        <input value={q} placeholder="Find an artist to request" onChange={(e) => setQ(e.target.value)} />
      </label>

      {found.length > 0 && (
        <div className="rows artist-found">
          {found.map((a) => (
            <div key={a.browseId} className="row">
              <img className="artist-pic" src={a.thumbnail} alt="" width={48} height={48} referrerPolicy="no-referrer" />
              <div className="min0 grow">
                <div className="truncate strong">{a.name}</div>
                <div className="truncate muted">{a.subtitle}</div>
              </div>
              {button(a.browseId, a.name, a.thumbnail)}
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">In Soundly</h2>
      {artists === null && <p className="muted empty">Loading…</p>}
      {artists && !artists.length && <p className="muted empty">No artists yet.</p>}
      <div className="artist-grid">
        {artists?.map((a) => (
          <div key={a.id} className="artist-card" role="link" tabIndex={0} onClick={() => navigate(`/artist/${encodeURIComponent(a.name)}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/artist/${encodeURIComponent(a.name)}`)}>
            <Avatar name={a.name} url={a.imageUrl} id={a.id} size={150} />
            <div className="truncate strong">{a.name}</div>
            <div className="muted">{a.songCount} song{a.songCount === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>
    </>
  )
}
