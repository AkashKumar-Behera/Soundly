import { Heart, ListMusic, Maximize2, MonitorSpeaker, Users, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useLibrary } from '../store/library'
import { useCurrent, usePlayer } from '../store/player'
import { useRoom } from '../store/room'
import { useUi } from '../store/ui'
import { Cover } from './Cover'
import { CurrentTime, ProgressBar, TotalTime } from './ProgressBar'

export function PlayerBar() {
  const song = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const volume = usePlayer((s) => s.volume)
  const { toggle, next, prev, toggleShuffle, cycleRepeat, setVolume } = usePlayer.getState()
  const liked = useLibrary((s) => (song ? s.liked.includes(song.id) : false))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const setNowPlaying = useUi((s) => s.setNowPlaying)
  const setRoomModal = useUi((s) => s.setRoomModal)
  const inRoom = useRoom((s) => !!s.code)
  const disabled = !song

  return (
    <footer className="playerbar">
      <div className="pb-left">
        {song ? (
          <>
            <button className="pb-art" aria-label="Open now playing" onClick={() => setNowPlaying(true)}>
              <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} className="r8" />
            </button>
            <div className="min0">
              <div className="pb-title truncate">{song.title}</div>
              <div className="pb-artist truncate">{song.artist}</div>
            </div>
            <button
              className={`like ${liked ? 'on' : ''}`}
              aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
              aria-pressed={liked}
              onClick={() => toggleLike(song.id)}
            >
              <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </>
        ) : (
          <div className="pb-empty">Pick a song to start listening</div>
        )}
      </div>

      <div className="pb-center">
        <div className="controls">
          <button className={`icon-btn ${shuffle ? 'on' : ''}`} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
            <Shuffle size={18} />
          </button>
          <button className="icon-btn" aria-label="Previous" disabled={disabled} onClick={prev}>
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button className="play-btn" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled} onClick={toggle}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="icon-btn" aria-label="Next" disabled={disabled} onClick={() => next()}>
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button className={`icon-btn ${repeat !== 'off' ? 'on' : ''}`} aria-label={`Repeat ${repeat}`} onClick={cycleRepeat}>
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <div className="seek-row">
          <span className="time">
            <CurrentTime />
          </span>
          <ProgressBar />
          <span className="time">
            <TotalTime />
          </span>
        </div>
      </div>

      <div className="pb-right">
        <button className="icon-btn" aria-label="Connect to a device" onClick={() => useUi.getState().setDevicesOpen(true)}>
          <MonitorSpeaker size={18} />
        </button>
        <button className={`icon-btn ${inRoom ? 'on' : ''}`} aria-label="Listen together" onClick={() => setRoomModal(true)}>
          <Users size={18} />
        </button>
        <button className="icon-btn" aria-label="Queue" onClick={() => setNowPlaying(true)} disabled={disabled}>
          <ListMusic size={18} />
        </button>
        <button className="icon-btn" aria-label={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => setVolume(volume === 0 ? 0.8 : 0)}>
          {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Volume"
          className="range vol"
          style={{ '--p': `${volume * 100}%` } as React.CSSProperties}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
        <button className="icon-btn" aria-label="Full screen player" onClick={() => setNowPlaying(true)} disabled={disabled}>
          <Maximize2 size={18} />
        </button>
      </div>
    </footer>
  )
}
