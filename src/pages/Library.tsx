import { Heart, Mic2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { playPlaylist } from '../lib/playlist'
import { useLibrary } from '../store/library'
import { rememberedSongs, useOffline } from '../store/offline'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

type Filter = 'playlists' | 'songs' | 'liked' | 'downloaded'

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
  const saved = useOffline((s) => s.saved)
  // Songs kept on this device: ones you saved and ones kept after you listened. Works offline too.
  const remembered = rememberedSongs()
  const downloaded: Song[] = Object.keys(saved).map((id) => songs.find((s) => s.id === id) ?? remembered[id]).filter((s): s is Song => !!s)
  const mode = useLibrary((s) => s.mode)
  const setCreatePlaylist = useUi((s) => s.setCreatePlaylist)

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
      <div className="page-title-row">
        <h1 className="page-title">Your Library</h1>
        {mode === 'api' && (
          <div className="title-actions">
            <button className="btn-pill" onClick={() => navigate('/artists')}>
              <Mic2 size={16} /> Artists
            </button>
            <button className="btn-pill" onClick={() => setCreatePlaylist(true)}>
              <Plus size={16} /> New playlist
            </button>
          </div>
        )}
      </div>
      <div className="chips">
        {(['playlists', 'songs', 'liked', 'downloaded'] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'liked' ? 'Liked songs' : f[0].toUpperCase() + f.slice(1)}{f === 'downloaded' && downloaded.length ? ` ${downloaded.length}` : ''}
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
          {(filter === 'songs' ? songs : filter === 'downloaded' ? downloaded : likedSongs).map((s, i, arr) => (
            <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(arr, i, filter === 'liked' ? 'liked' : null)} />
          ))}
          {filter === 'liked' && !likedSongs.length && <p className="muted empty">Tap the heart on a song to save it here.</p>}
          {filter === 'songs' && !songs.length && <p className="muted empty">No songs yet.</p>}
          {filter === 'downloaded' && !downloaded.length && <p className="muted empty">Nothing on this device yet. Songs you listen to are kept here automatically, and the ⋯ menu can save any song.</p>}
        </div>
      )}
    </>
  )
}
