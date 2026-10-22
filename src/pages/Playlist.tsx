import { Heart, Pause, Play, Shuffle } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { SongRow } from '../components/SongRow'
import { playlists, songById } from '../data/mock'
import type { Song } from '../data/mock'
import { useApp } from '../store/app'
import { useCurrent, usePlayer } from '../store/player'

export function Playlist() {
  const { id } = useParams()
  const likedIds = useApp((s) => s.liked)
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const isLiked = id === 'liked'
  const pl = playlists.find((p) => p.id === id)
  if (!isLiked && !pl) return <p className="muted empty">Playlist not found.</p>

  const ids = isLiked ? likedIds : (pl?.songIds ?? [])
  const list = ids.map(songById).filter((s): s is Song => !!s)
  const total = list.reduce((n, s) => n + s.duration, 0)
  const hue = pl?.hue ?? 150
  const here = !!current && list.some((s) => s.id === current.id)

  return (
    <>
      <div className="pl-head" style={{ '--hue': hue } as React.CSSProperties}>
        {isLiked ? (
          <div className="liked-art pl-art">
            <Heart size={84} fill="currentColor" />
          </div>
        ) : (
          <Cover hue={hue} className="pl-art" />
        )}
        <div className="pl-info">
          <span className="eyebrow">Playlist</span>
          <h1>{isLiked ? 'Liked Songs' : pl?.title}</h1>
          <p className="muted">{isLiked ? 'Songs you hearted.' : pl?.description}</p>
          <p className="pl-stats">
            <b>Soundly</b> · {list.length} songs, {Math.round(total / 60)} min
          </p>
        </div>
      </div>

      <div className="pl-actions">
        <button
          className="play-btn xl"
          aria-label={here && playing ? 'Pause' : 'Play'}
          onClick={() => (here ? toggle() : playQueue(list, 0))}
          disabled={!list.length}
        >
          {here && playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button
          className="icon-btn"
          aria-label="Shuffle play"
          disabled={!list.length}
          onClick={() => {
            toggleShuffle()
            playQueue(list, Math.floor(Math.random() * list.length))
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
          <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i)} />
        ))}
        {!list.length && <p className="muted empty">Nothing here yet.</p>}
      </div>
    </>
  )
}
