import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { playPlaylist } from '../lib/playlist'
import { useLibrary } from '../store/library'
import { usePlayer } from '../store/player'

type Filter = 'playlists' | 'songs' | 'liked'

export function Library() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('playlists')
  const [likedSongs, setLikedSongs] = useState<Song[]>([])
  const playQueue = usePlayer((s) => s.playQueue)
  const playing = usePlayer((s) => s.playing)
  const sourceId = usePlayer((s) => s.sourceId)
  const songs = useLibrary((s) => s.songs)
  const playlists = useLibrary((s) => s.playlists)
  const likedIds = useLibrary((s) => s.liked)
  const getPlaylist = useLibrary((s) => s.getPlaylist)

  useEffect(() => {
    if (filter !== 'liked') return
    let live = true
    void getPlaylist('liked').then((d) => live && setLikedSongs(d?.songs ?? []))
    return () => {
      live = false
    }
  }, [filter, getPlaylist, likedIds])

  return (
    <>
      <h1 className="page-title">Your Library</h1>
      <div className="chips">
        {(['playlists', 'songs', 'liked'] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'liked' ? 'Liked songs' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filter === 'playlists' && (
        <div className="grid">
          <div className="card" role="link" tabIndex={0} onClick={() => navigate('/playlist/liked')} onKeyDown={(e) => e.key === 'Enter' && navigate('/playlist/liked')}>
            <div className="card-art">
              <div className="liked-art big">
                <Heart size={56} fill="currentColor" />
              </div>
            </div>
            <div className="card-title">Liked Songs</div>
            <div className="card-sub">{likedIds.length} songs</div>
          </div>
          {playlists.map((p) => (
            <Card
              key={p.id}
              hue={p.hue}
              title={p.title}
              subtitle={`${p.songCount} songs`}
              playing={playing && sourceId === p.id}
              onOpen={() => navigate(`/playlist/${p.id}`)}
              onPlay={() => void playPlaylist(p.id)}
            />
          ))}
        </div>
      )}

      {filter !== 'playlists' && (
        <div className="song-table">
          {(filter === 'songs' ? songs : likedSongs).map((s, i, arr) => (
            <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(arr, i, filter === 'liked' ? 'liked' : null)} />
          ))}
          {filter === 'liked' && !likedSongs.length && <p className="muted empty">Tap the heart on a song to save it here.</p>}
          {filter === 'songs' && !songs.length && <p className="muted empty">No songs yet.</p>}
        </div>
      )}
    </>
  )
}
