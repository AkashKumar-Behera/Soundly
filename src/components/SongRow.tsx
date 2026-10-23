import { ArrowDownToLine, Check, Heart, Pause, Play } from 'lucide-react'
import type { Song } from '../data/mock'
import { formatTime } from '../lib/format'
import { useLibrary } from '../store/library'
import { useOffline } from '../store/offline'
import { useCurrent, usePlayer } from '../store/player'
import { useOfflineSave } from '../lib/useOfflineSave'
import { Cover } from './Cover'

interface Props {
  song: Song
  index: number
  onPlay: () => void
}

export function SongRow({ song, index, onPlay }: Props) {
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const liked = useLibrary((s) => s.liked.includes(song.id))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const toggle = usePlayer((s) => s.toggle)
  const active = current?.id === song.id
  const offline = useOffline((s) => s.saved[song.id] !== undefined)
  const busy = useOffline((s) => s.busy[song.id] !== undefined)
  const toggleOffline = useOfflineSave()

  return (
    <div className={`song-row ${active ? 'active' : ''}`} onDoubleClick={onPlay}>
      <button
        className="song-idx"
        aria-label={active && playing ? `Pause ${song.title}` : `Play ${song.title}`}
        onClick={active ? toggle : onPlay}
      >
        <span className="num">{active && playing ? <i className="eq-mini" /> : index + 1}</span>
        <span className="ico">{active && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</span>
      </button>
      <div className="song-main">
        <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} size={42} className="r8" />
        <div className="min0">
          <div className="song-title truncate">{song.title}</div>
          <div className="song-artist truncate">{song.artist}</div>
        </div>
      </div>
      <div className="song-album truncate">{song.album}</div>
      <div className="song-actions">
        <button
          className={`like dl ${offline ? 'on' : ''} ${busy ? 'busy' : ''}`}
          aria-label={offline ? `Remove ${song.title} from this device` : `Save ${song.title} for offline`}
          aria-pressed={offline}
          onClick={() => void toggleOffline(song)}
        >
          {offline ? <Check size={17} /> : <ArrowDownToLine size={17} />}
        </button>
        <button
          className={`like ${liked ? 'on' : ''}`}
          aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
          aria-pressed={liked}
          onClick={() => toggleLike(song.id)}
        >
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="song-dur">{formatTime(song.duration)}</div>
    </div>
  )
}
