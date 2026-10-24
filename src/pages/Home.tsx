import { Pause, Play, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Card, Shelf } from '../components/Card'
import { Cover } from '../components/Cover'
import { greeting } from '../lib/format'
import { playPlaylist } from '../lib/playlist'
import type { Song } from '../data/mock'
import { toSong, useLibrary } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'

/** Songs in the library that sound like `seed` (YouTube Music's radio for it), kept for half an hour per song. */
function useSimilar(seed: Song | undefined): Song[] {
  const mode = useLibrary((s) => s.mode)
  const [songs, setSongs] = useState<Song[]>([])
  useEffect(() => {
    if (!seed || mode !== 'api') return setSongs([])
    const key = `soundly.similar.${seed.id}`
    try {
      const hit = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; songs: Song[] } | null
      if (hit && Date.now() - hit.at < 30 * 60000) return setSongs(hit.songs)
    } catch {
      /* ignore a bad cache entry */
    }
    let live = true
    api<{ songs: Parameters<typeof toSong>[0][] }>(`/radio/${seed.id}`)
      .then((d) => {
        const list = d.songs.filter((s) => s.id !== seed.id).map(toSong).slice(0, 14)
        if (!live) return
        setSongs(list)
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), songs: list }))
        } catch {
          /* full or private: fine */
        }
      })
      .catch(() => live && setSongs([]))
    return () => {
      live = false
    }
  }, [seed?.id, mode])
  return songs
}

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

  // "Because you played ...": what you are listening to now (or last), and a second shelf from a different artist.
  const seedA = current ?? recent[0]
  const seedB = recent.find((s) => s.artist !== seedA?.artist)
  const similarA = useSimilar(seedA)
  const similarB = useSimilar(seedB)
  const shelf = (seed: Song | undefined, list: Song[]) =>
    seed && list.length > 0 ? (
      <Shelf title={`Because you played ${seed.title}`}>
        {list.map((s, i) => (
          <Card
            key={s.id}
            hue={s.hue}
            hue2={s.hue2}
            thumbUrl={s.thumbUrl}
            title={s.title}
            subtitle={s.artist}
            playing={current?.id === s.id && playing}
            onOpen={() => playQueue(list, i)}
            onPlay={() => (current?.id === s.id ? toggle() : playQueue(list, i))}
          />
        ))}
      </Shelf>
    ) : null

  return (
    <>
      <button className="home-avatar" aria-label="Open settings" onClick={() => navigate('/settings')}>
        {(useLibrary.getState().me?.name ?? 'A').slice(0, 1).toUpperCase()}
      </button>
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

      {shelf(seedA, similarA)}

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

      {shelf(seedB, similarB)}

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
