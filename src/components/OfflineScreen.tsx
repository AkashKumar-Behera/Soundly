import { AnimatePresence, motion } from 'motion/react'
import { CloudOff, Pause, Play, RefreshCw, Shuffle, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Song } from '../data/mock'
import { THUMB_CACHE, cachesSupported } from '../lib/deviceCache'
import { formatTime } from '../lib/format'
import { useConnection } from '../store/connection'
import { useLibrary } from '../store/library'
import { rememberedSongs, useOffline } from '../store/offline'
import { useCurrent, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { AacBadge } from './AacBadge'
import { Cover } from './Cover'
import { NowPlaying } from './NowPlaying'
import { Toast } from './Toast'

/** Which of these songs have their cover saved on the device. The others show the plain gradient, never a broken picture. */
function useCachedCovers(songs: Song[]): Set<string> {
  const [have, setHave] = useState<Set<string>>(new Set())
  const key = songs.map((s) => s.id).join(',')
  useEffect(() => {
    if (!cachesSupported()) return
    let live = true
    void (async () => {
      const cache = await caches.open(THUMB_CACHE)
      const ok = new Set<string>()
      for (const s of songs) {
        if (s.thumbUrl && (await cache.match(s.thumbUrl, { ignoreSearch: true }))) ok.add(s.id)
      }
      if (live) setHave(ok)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return have
}

/**
 * What the app shows with no connection: only songs that are on this device (saved ones and ones kept after you
 * listened), with their covers when those are saved too. Refresh checks the connection; when it is back the full app returns.
 */
export function OfflineScreen() {
  const saved = useOffline((s) => s.saved)
  const ready = useOffline((s) => s.ready)
  const library = useLibrary((s) => s.songs)
  const checking = useConnection((s) => s.checking)
  const refresh = useConnection((s) => s.refresh)
  const showToast = useUi((s) => s.showToast)
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const setNowPlaying = useUi((s) => s.setNowPlaying)

  const songs = useMemo(() => {
    const remembered = rememberedSongs()
    return Object.keys(saved)
      .map((id) => library.find((s) => s.id === id) ?? remembered[id])
      .filter((s): s is Song => !!s)
  }, [saved, library])
  const covers = useCachedCovers(songs)

  const tryAgain = async () => {
    if (!(await refresh())) showToast('Still offline')
  }

  return (
    <div className="offline-screen">
      <header className="off-head">
        <div className="off-badge">
          <CloudOff size={20} />
        </div>
        <div className="min0 grow">
          <h1>You’re offline</h1>
          <p className="muted">{ready ? `${songs.length} song${songs.length === 1 ? '' : 's'} on this device` : 'Looking for your saved songs…'}</p>
        </div>
        <button className="btn-pill" onClick={() => void tryAgain()} disabled={checking}>
          <RefreshCw size={16} className={checking ? 'spin' : ''} /> {checking ? 'Checking' : 'Refresh'}
        </button>
      </header>

      {songs.length > 0 && (
        <div className="off-actions">
          <button className="play-btn xl" aria-label="Play all" onClick={() => playQueue(songs, 0, 'offline')}>
            <Play size={26} fill="currentColor" />
          </button>
          <button className="icon-btn" aria-label="Shuffle" onClick={() => playQueue([...songs].sort(() => Math.random() - 0.5), 0, 'offline')}>
            <Shuffle size={26} />
          </button>
        </div>
      )}

      <div className="off-list">
        {songs.map((s, i) => {
          const active = current?.id === s.id
          return (
            <button key={s.id} className={`off-row ${active ? 'active' : ''}`} onClick={() => (active ? toggle() : playQueue(songs, i, 'offline'))}>
              <Cover hue={s.hue} hue2={s.hue2} thumbUrl={covers.has(s.id) ? s.thumbUrl : undefined} size={52} className="r8" />
              <div className="min0 grow">
                <div className="truncate off-title">{s.title}</div>
                <div className="truncate muted">
                  <AacBadge song={s} />
                  {s.artist}
                </div>
              </div>
              <span className="muted">{active && playing ? <Pause size={18} fill="currentColor" /> : formatTime(s.duration)}</span>
            </button>
          )
        })}
        {ready && !songs.length && (
          <div className="off-empty">
            <CloudOff size={40} />
            <h2>Nothing saved on this device</h2>
            <p className="muted">Songs you listen to are kept here automatically, and you can save any song from its ⋯ menu. Connect to the internet to listen.</p>
          </div>
        )}
      </div>

      {current && (
        <div className="off-mini" onClick={() => setNowPlaying(true)}>
          <Cover hue={current.hue} hue2={current.hue2} thumbUrl={covers.has(current.id) ? current.thumbUrl : undefined} size={44} className="r8" />
          <div className="min0 grow">
            <div className="truncate off-title">{current.title}</div>
            <div className="truncate muted">{current.artist}</div>
          </div>
          <button
            className="mini-play"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
          >
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
        </div>
      )}
      <NowPlaying />
      <Toast />
    </div>
  )
}

/** A short "back online" moment that plays over the app when the connection returns. */
export function BackOnline() {
  const justBack = useConnection((s) => s.justBack)
  return (
    <AnimatePresence>
      {justBack && (
        <motion.div className="back-online" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <motion.div className="back-ring" initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
          <motion.div className="back-chip" initial={{ scale: 0.7, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
            <Wifi size={20} /> Back online
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
