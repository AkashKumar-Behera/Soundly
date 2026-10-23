import { Pause, Play, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, Shelf } from '../components/Card'
import { Cover } from '../components/Cover'
import { greeting } from '../lib/format'
import { playPlaylist } from '../lib/playlist'
import { useLibrary } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'

export function Home() {
  const navigate = useNavigate()
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const sourceId = usePlayer((s) => s.sourceId)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const songs = useLibrary((s) => s.songs)
  const playlists = useLibrary((s) => s.playlists)
  const recent = useLibrary((s) => s.recent)
  const likedCount = useLibrary((s) => s.liked.length)
  const mode = useLibrary((s) => s.mode)

  const playlistPlaying = (id: string) => playing && sourceId === id

  return (
    <>
      <h1 className="greet">{greeting()}</h1>

      {mode === 'api' && (
        <button className="wrapped-cta" onClick={() => navigate('/wrapped')}>
          <Sparkles size={26} />
          <div>
            <strong>Your Soundly Wrapped</strong>
            <span>See what you listened to most, as a story.</span>
          </div>
        </button>
      )}

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
              void playPlaylist('liked')
            }}
          >
            {playlistPlaying('liked') ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
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
                void playPlaylist(p.id)
              }}
            >
              {playlistPlaying(p.id) ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </span>
          </button>
        ))}
      </div>

      {likedCount === 0 && !songs.length && <p className="muted empty">Your library is empty. Search for a song and request it from YouTube.</p>}

      {recent.length > 0 && (
        <Shelf title="Recently played">
          {recent.map((s, i) => (
            <Card
              key={s.id}
              hue={s.hue}
              hue2={s.hue2}
              thumbUrl={s.thumbUrl}
              title={s.title}
              subtitle={s.artist}
              playing={current?.id === s.id && playing}
              onOpen={() => playQueue(recent, i)}
              onPlay={() => (current?.id === s.id ? toggle() : playQueue(recent, i))}
            />
          ))}
        </Shelf>
      )}

      {playlists.length > 0 && (
        <Shelf title="Made for you">
          {playlists.map((p) => (
            <Card
              key={p.id}
              hue={p.hue}
              title={p.title}
              subtitle={p.description}
              playing={playlistPlaying(p.id)}
              onOpen={() => navigate(`/playlist/${p.id}`)}
              onPlay={() => (playlistPlaying(p.id) ? toggle() : void playPlaylist(p.id))}
            />
          ))}
        </Shelf>
      )}

      {songs.length > 0 && (
        <Shelf title="Recently added">
          {songs.slice(0, 12).map((s, i) => (
            <Card
              key={s.id}
              hue={s.hue}
              hue2={s.hue2}
              thumbUrl={s.thumbUrl}
              title={s.title}
              subtitle={s.artist}
              playing={current?.id === s.id && playing}
              onOpen={() => playQueue(songs, i)}
              onPlay={() => (current?.id === s.id ? toggle() : playQueue(songs, i))}
            />
          ))}
        </Shelf>
      )}
    </>
  )
}
