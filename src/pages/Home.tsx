import { Pause, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, Shelf } from '../components/Card'
import { Cover } from '../components/Cover'
import { playlists, songById, songs } from '../data/mock'
import type { Playlist, Song } from '../data/mock'
import { greeting } from '../lib/format'
import { useApp } from '../store/app'
import { useCurrent, usePlayer } from '../store/player'

function listFor(p: Playlist): Song[] {
  return p.songIds.map(songById).filter((s): s is Song => !!s)
}

export function Home() {
  const navigate = useNavigate()
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const likedIds = useApp((s) => s.liked)

  const likedSongs = likedIds.map(songById).filter((s): s is Song => !!s)
  const playPlaylist = (p: Playlist) => playQueue(listFor(p), 0)
  const isPlaylistPlaying = (p: Playlist) => !!current && playing && p.songIds.includes(current.id)

  return (
    <>
      <h1 className="greet">{greeting()}</h1>

      <div className="quick">
        <button className="quick-item" onClick={() => navigate('/playlist/liked')}>
          <div className="liked-art sq">♥</div>
          <span className="truncate">Liked Songs</span>
          <span
            className="fab"
            role="button"
            aria-label="Play liked songs"
            onClick={(e) => {
              e.stopPropagation()
              playQueue(likedSongs, 0)
            }}
          >
            <Play size={20} fill="currentColor" />
          </span>
        </button>
        {playlists.slice(0, 5).map((p) => (
          <button key={p.id} className="quick-item" onClick={() => navigate(`/playlist/${p.id}`)}>
            <Cover hue={p.hue} size={64} />
            <span className="truncate">{p.title}</span>
            <span
              className="fab"
              role="button"
              aria-label={`Play ${p.title}`}
              onClick={(e) => {
                e.stopPropagation()
                playPlaylist(p)
              }}
            >
              {isPlaylistPlaying(p) ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </span>
          </button>
        ))}
      </div>

      <Shelf title="Made for you">
        {playlists.map((p) => (
          <Card
            key={p.id}
            hue={p.hue}
            title={p.title}
            subtitle={p.description}
            playing={isPlaylistPlaying(p)}
            onOpen={() => navigate(`/playlist/${p.id}`)}
            onPlay={() => (isPlaylistPlaying(p) ? toggle() : playPlaylist(p))}
          />
        ))}
      </Shelf>

      <Shelf title="Top songs this month">
        {songs.slice(0, 8).map((s, i) => (
          <Card
            key={s.id}
            hue={s.hue}
            hue2={s.hue2}
            title={s.title}
            subtitle={s.artist}
            playing={current?.id === s.id && playing}
            onOpen={() => playQueue(songs, i)}
            onPlay={() => (current?.id === s.id ? toggle() : playQueue(songs, i))}
          />
        ))}
      </Shelf>

      <Shelf title="New in your library">
        {songs
          .slice(8)
          .concat(songs.slice(0, 2))
          .map((s) => (
            <Card
              key={s.id}
              hue={s.hue}
              hue2={s.hue2}
              title={s.title}
              subtitle={`${s.artist} · ${s.album}`}
              playing={current?.id === s.id && playing}
              onOpen={() => playQueue([s], 0)}
              onPlay={() => (current?.id === s.id ? toggle() : playQueue([s], 0))}
            />
          ))}
      </Shelf>
    </>
  )
}
