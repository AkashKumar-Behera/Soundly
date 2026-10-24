import { DownloadCloud, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { hueFromId, toSong, useLibrary, useRole } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

interface LibArtist {
  id: string
  name: string
  browseId: string | null
  imageUrl: string | null
  songCount: number
}

/** One artist: their songs in the library, plus a way to ask for the rest of their catalogue. */
export function ArtistPage() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const mode = useLibrary((s) => s.mode)
  const role = useRole()
  const showToast = useUi((s) => s.showToast)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const playing = usePlayer((s) => s.playing)
  const sourceId = usePlayer((s) => s.sourceId)
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [artist, setArtist] = useState<LibArtist | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'queued' | 'pending'>('idle')
  const direct = role === 'trusted' || role === 'admin'
  const sid = `artist:${name}`

  useEffect(() => {
    if (mode !== 'api') return setSongs([])
    let live = true
    setSongs(null)
    api<{ songs: Parameters<typeof toSong>[0][] }>(`/songs?q=${encodeURIComponent(name)}&limit=100`)
      .then((d) => live && setSongs(d.songs.map(toSong).filter((s) => s.artist.toLowerCase() === name.toLowerCase())))
      .catch(() => live && setSongs([]))
    api<{ artists: LibArtist[] }>('/artists')
      .then((d) => live && setArtist(d.artists.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [name, mode])

  const request = async () => {
    if (!artist?.browseId) return
    setState('busy')
    try {
      const r = await api<{ status: 'queued' | 'pending'; queued?: number }>('/artists/request', { method: 'POST', body: { browseId: artist.browseId, name: artist.name, imageUrl: artist.imageUrl } })
      setState(r.status)
      showToast(r.status === 'queued' ? `${r.queued ?? 0} songs by ${artist.name} added to the download queue` : `Request for ${artist.name} sent to the admin`)
    } catch (e) {
      setState('idle')
      const code = e instanceof ApiError ? e.code : ''
      showToast(code === 'daily_limit_reached' ? 'You have used today’s artist requests' : code === 'already_requested' ? 'You already asked for this artist' : 'Could not send that request')
    }
  }

  if (mode !== 'api') return <p className="muted empty">Artists need the live server.</p>
  const list = songs ?? []
  const here = sourceId === sid
  const hue = hueFromId(artist?.id ?? name)

  return (
    <>
      <div className="pl-head">
        {artist?.imageUrl ? (
          <img className="artist-pic pl-art" src={artist.imageUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="artist-pic fallback pl-art" style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 50) % 360} 65% 28%))` }}>
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="pl-info">
          <span className="eyebrow">Artist</span>
          <h1>{name}</h1>
          <p className="pl-stats">{songs === null ? 'Loading…' : `${list.length} song${list.length === 1 ? '' : 's'} in Soundly`}</p>
        </div>
      </div>

      <div className="pl-actions">
        <button className="play-btn xl" aria-label={here && playing ? 'Pause' : 'Play'} disabled={!list.length} onClick={() => (here ? toggle() : playQueue(list, 0, sid))}>
          {here && playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button className="icon-btn" aria-label="Shuffle play" disabled={!list.length} onClick={() => playQueue([...list].sort(() => Math.random() - 0.5), 0, sid)}>
          <Shuffle size={28} />
        </button>
        {artist?.browseId && role !== 'listener' && (
          <button className="btn-pill" disabled={state !== 'idle'} onClick={() => void request()}>
            <DownloadCloud size={16} />
            {state === 'queued' ? 'Queued' : state === 'pending' ? 'Requested' : direct ? 'Add all songs' : 'Request all songs'}
          </button>
        )}
        <button className="btn-pill ghost" onClick={() => navigate('/artists')}>
          All artists
        </button>
      </div>

      <div className="song-table">
        {list.map((s, i) => (
          <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i, sid)} />
        ))}
        {songs && !list.length && <p className="muted empty">No songs by {name} yet.</p>}
      </div>
    </>
  )
}
