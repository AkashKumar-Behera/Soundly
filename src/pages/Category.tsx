import { Play, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { toSong } from '../store/library'
import { usePlayer } from '../store/player'

/** Every song in one category (a genre or language), newest first. */
export function Category() {
  const { label = '' } = useParams()
  const navigate = useNavigate()
  const playQueue = usePlayer((s) => s.playQueue)
  const [songs, setSongs] = useState<Song[] | null>(null)

  useEffect(() => {
    let live = true
    setSongs(null)
    api<{ songs: Parameters<typeof toSong>[0][] }>(`/categories/${encodeURIComponent(label)}/songs`)
      .then((d) => live && setSongs(d.songs.map(toSong)))
      .catch(() => live && setSongs([]))
    return () => {
      live = false
    }
  }, [label])

  const list = songs ?? []
  const sid = `category:${label}`

  return (
    <>
      <button className="link-btn" onClick={() => navigate('/search')}>
        ← Browse all
      </button>
      <h1 className="page-title">{label}</h1>
      <p className="muted">{songs === null ? 'Loading…' : `${list.length} song${list.length === 1 ? '' : 's'}`}</p>
      <div className="pl-actions">
        <button className="play-btn xl" aria-label="Play" disabled={!list.length} onClick={() => playQueue(list, 0, sid)}>
          <Play size={26} fill="currentColor" />
        </button>
        <button className="icon-btn" aria-label="Shuffle play" disabled={!list.length} onClick={() => playQueue([...list].sort(() => Math.random() - 0.5), 0, sid)}>
          <Shuffle size={28} />
        </button>
      </div>
      <div className="song-table">
        {list.map((s, i) => (
          <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i, sid)} />
        ))}
        {songs && !list.length && <p className="muted empty">No songs in this category yet.</p>}
      </div>
    </>
  )
}
