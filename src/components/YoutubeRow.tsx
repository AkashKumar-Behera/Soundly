import { Download, Play } from 'lucide-react'
import { api } from '../api/client'
import { toSong, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { formatTime } from '../lib/format'
import { hueFromId } from '../store/library'
import type { YoutubeResult } from '../store/library'
import { Cover } from './Cover'

// Matches the server default for max_duration_sec; longer videos always need an admin.
export const LONG_SECONDS = 1200

const statusLabel: Record<string, string> = {
  pending_approval: 'Pending approval',
  queued: 'Queued',
  downloading: 'Downloading',
  uploading: 'Uploading',
}

/** One YouTube result with its action: request, already requested, or already in the library. */
export function YoutubeRow({ video, direct, onRequest }: { video: YoutubeResult; direct: boolean; onRequest: (v: YoutubeResult) => void }) {
  const v = video

  // A song that is already in the library plays right from the search results.
  const play = async () => {
    if (!v.songId) return
    let song = useLibrary.getState().songs.find((x) => x.id === v.songId)
    if (!song) {
      try {
        song = toSong(await api<Parameters<typeof toSong>[0]>(`/songs/${v.songId}`))
      } catch {
        return useUi.getState().showToast('Could not play that song')
      }
    }
    usePlayer.getState().playQueue([song], 0)
  }

  return (
    <div className={`yt-item ${v.songId ? 'playable' : ''}`} onClick={v.songId ? () => void play() : undefined}>
      {v.thumbnail ? (
        <div className="yt-thumb">
          <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      ) : (
        <Cover hue={hueFromId(v.youtubeId)} size={56} className="r8" />
      )}
      <div className="min0">
        <div className="truncate yt-t">{v.title}</div>
        <div className="truncate muted">
          {v.channel} · {formatTime(v.durationSec)}
          {v.category !== 'Music' && <span className="flag">{v.category}</span>}
          {v.durationSec > LONG_SECONDS && <span className="flag">Very long</span>}
        </div>
      </div>
      {v.songId ? (
        <button className="btn-pill" onClick={(e) => { e.stopPropagation(); void play() }}>
          <Play size={16} fill="currentColor" /> Play
        </button>
      ) : v.requestStatus ? (
        <span className={`status ${v.requestStatus}`}>{statusLabel[v.requestStatus] ?? v.requestStatus}</span>
      ) : (
        <button className="btn-pill" onClick={() => onRequest(v)}>
          <Download size={16} />
          {direct && v.category === 'Music' && v.durationSec <= LONG_SECONDS ? 'Add to queue' : 'Request song'}
        </button>
      )}
    </div>
  )
}
