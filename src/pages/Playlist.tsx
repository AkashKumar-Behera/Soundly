import { Heart, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { useLibrary } from '../store/library'
import type { Playlist as PlaylistInfo } from '../store/library'
import { usePlayer } from '../store/player'

export function Playlist() {
  const { id = '' } = useParams()
  const getPlaylist = useLibrary((s) => s.getPlaylist)
  const likedIds = useLibrary((s) => s.liked)
  const playing = usePlayer((s) => s.playing)
  const sourceId = usePlayer((s) => s.sourceId)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const [data, setData] = useState<{ playlist: PlaylistInfo; songs: Song[] } | null | undefined>(undefined)
  const isLiked = id === 'liked'

  // Reload when the id changes, and for "liked" whenever a heart is toggled.
  useEffect(() => {
    let live = true
    void getPlaylist(id).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [id, getPlaylist, isLiked ? likedIds : null])

  if (data === undefined) return <p className="muted empty">Loading…</p>
  if (data === null) return <p className="muted empty">Playlist not found.</p>

  const { playlist: pl, songs: list } = data
  const total = list.reduce((n, s) => n + s.duration, 0)
  const here = sourceId === id
  const play = () => (here ? toggle() : playQueue(list, 0, id))

  return (
    <>
      <div className="pl-head">
        {isLiked ? (
          <div className="liked-art pl-art">
            <Heart size={84} fill="currentColor" />
          </div>
        ) : (
          <Cover hue={pl.hue} className="pl-art" />
        )}
        <div className="pl-info">
          <span className="eyebrow">Playlist</span>
          <h1>{pl.title}</h1>
          <p className="muted">{pl.description}</p>
          <p className="pl-stats">
            <b>Soundly</b> · {list.length} songs{total ? `, ${Math.round(total / 60)} min` : ''}
          </p>
        </div>
      </div>

      <div className="pl-actions">
        <button className="play-btn xl" aria-label={here && playing ? 'Pause' : 'Play'} onClick={play} disabled={!list.length}>
          {here && playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button
          className="icon-btn"
          aria-label="Shuffle play"
          disabled={!list.length}
          onClick={() => {
            toggleShuffle()
            playQueue(list, Math.floor(Math.random() * list.length), id)
          }}
        >
          <Shuffle size={28} />
        </button>
      </div>

      <div className="song-table">
        <div className="song-head">
          <span>#</span>
          <span>Title</span>
          <span className="song-album">Album</span>
          <span />
          <span>Time</span>
        </div>
        {list.map((s, i) => (
          <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i, id)} />
        ))}
        {!list.length && <p className="muted empty">Nothing here yet.</p>}
      </div>
    </>
  )
}
