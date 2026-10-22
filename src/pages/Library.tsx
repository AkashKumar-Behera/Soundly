import { Heart } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import { SongRow } from '../components/SongRow'
import { playlists, songById, songs } from '../data/mock'
import type { Song } from '../data/mock'
import { useApp } from '../store/app'
import { useCurrent, usePlayer } from '../store/player'

type Filter = 'playlists' | 'songs' | 'liked'

export function Library() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('playlists')
  const playQueue = usePlayer((s) => s.playQueue)
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const likedIds = useApp((s) => s.liked)
  const liked = likedIds.map(songById).filter((s): s is Song => !!s)

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
            <div className="card-sub">{liked.length} songs</div>
          </div>
          {playlists.map((p) => (
            <Card
              key={p.id}
              hue={p.hue}
              title={p.title}
              subtitle={`${p.songIds.length} songs`}
              playing={!!current && playing && p.songIds.includes(current.id)}
              onOpen={() => navigate(`/playlist/${p.id}`)}
              onPlay={() => playQueue(p.songIds.map(songById).filter((s): s is Song => !!s), 0)}
            />
          ))}
        </div>
      )}

      {filter !== 'playlists' && (
        <div className="song-table">
          {(filter === 'songs' ? songs : liked).map((s, i, arr) => (
            <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(arr, i)} />
          ))}
          {filter === 'liked' && !liked.length && <p className="muted empty">Tap the heart on a song to save it here.</p>}
        </div>
      )}
    </>
  )
}
