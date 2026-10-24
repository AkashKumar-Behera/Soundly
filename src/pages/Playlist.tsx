import { ArrowDownToLine, Check, Heart, Pause, Play, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cover } from '../components/Cover'
import { SongRow } from '../components/SongRow'
import type { Song } from '../data/mock'
import { useLibrary, useRole } from '../store/library'
import type { Playlist as PlaylistInfo } from '../store/library'
import { useCanSaveOffline } from '../lib/useOfflineSave'
import { useOffline } from '../store/offline'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { ConfirmDialog } from './admin/ui'

export function Playlist() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const deletePlaylist = useLibrary((s) => s.deletePlaylist)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const getPlaylist = useLibrary((s) => s.getPlaylist)
  const likedIds = useLibrary((s) => s.liked)
  const playlistsState = useLibrary((s) => s.playlists)
  const renamePlaylist = useLibrary((s) => s.renamePlaylist)
  const setPublic = useLibrary((s) => s.setPlaylistPublic)
  const role = useRole()
  const [renaming, setRenaming] = useState<string | null>(null)
  const playing = usePlayer((s) => s.playing)
  const sourceId = usePlayer((s) => s.sourceId)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)

  const [data, setData] = useState<{ playlist: PlaylistInfo; songs: Song[] } | null | undefined>(undefined)
  const [progress, setProgress] = useState<string | null>(null)
  const saved = useOffline((s) => s.saved)
  const canSave = useCanSaveOffline()
  const showToast = useUi((s) => s.showToast)
  const isLiked = id === 'liked'

  // Reload when the id changes, and for "liked" whenever a heart is toggled.
  useEffect(() => {
    let live = true
    void getPlaylist(id).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [id, getPlaylist, isLiked ? likedIds : playlistsState])

  if (data === undefined) return <p className="muted empty">Loading…</p>
  if (data === null) return <p className="muted empty">Playlist not found.</p>

  const { playlist: pl, songs: list } = data
  const total = list.reduce((n, s) => n + s.duration, 0)
  const here = sourceId === id
  const canEdit = (pl.isOwner || role === 'admin') && !isLiked
  const play = () => (here ? toggle() : playQueue(list, 0, id))
  const allSaved = list.length > 0 && list.every((s) => saved[s.id] !== undefined)

  const saveAll = async () => {
    const { remove, saveMany } = useOffline.getState()
    if (allSaved) {
      await Promise.all(list.map((s) => remove(s.id)))
      return showToast('Removed from this device')
    }
    if (!canSave) return showToast('Saving songs for offline is a Pro perk')
    if (!navigator.onLine) return showToast('Connect to the internet to save songs')
    const todo = list.filter((s) => saved[s.id] === undefined)
    const ok = await saveMany(todo, (done, total) => setProgress(`${done}/${total}`))
    setProgress(null)
    showToast(ok === todo.length ? `Saved ${ok} song${ok === 1 ? '' : 's'} for offline` : `Saved ${ok} of ${todo.length}, some failed`)
  }

  return (
    <>
      <div className="pl-head">
        {isLiked ? (
          <div className="liked-art pl-art">
            <Heart size={84} fill="currentColor" />
          </div>
        ) : (
          <Cover hue={pl.hue} className="pl-art" />
        )}
        <div className="pl-info">
          <span className="eyebrow">Playlist</span>
          {renaming !== null ? (
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault()
                const title = renaming.trim()
                if (!title) return setRenaming(null)
                void renamePlaylist(id, title).then((ok) => {
                  showToast(ok ? 'Renamed' : 'Could not rename')
                  setRenaming(null)
                })
              }}
            >
              <input autoFocus value={renaming} maxLength={80} onChange={(e) => setRenaming(e.target.value)} onBlur={() => setRenaming(null)} />
            </form>
          ) : (
            <h1>{pl.title}</h1>
          )}
          <p className="muted">{pl.description}</p>
          {!!pl.pendingCount && (
            <p className="muted">
              {pl.pendingCount} song{pl.pendingCount === 1 ? ' is' : 's are'} still being added (downloading or waiting for approval).
            </p>
          )}
          <p className="pl-stats">
            <b>Soundly</b>{pl.ownerName ? ` · by ${pl.ownerName}` : ''} · {list.length} songs{total ? `, ${Math.round(total / 60)} min` : ''}
          </p>
        </div>
      </div>

      <div className="pl-actions">
        <button className="play-btn xl" aria-label={here && playing ? 'Pause' : 'Play'} onClick={play} disabled={!list.length}>
          {here && playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button
          className="icon-btn"
          aria-label="Shuffle play"
          disabled={!list.length}
          onClick={() => {
            toggleShuffle()
            playQueue(list, Math.floor(Math.random() * list.length), id)
          }}
        >
          <Shuffle size={28} />
        </button>
        <button className="btn-pill" disabled={!list.length || progress !== null} onClick={() => void saveAll()}>
          {allSaved ? <Check size={16} /> : <ArrowDownToLine size={16} />}
          {progress ? `Saving ${progress}` : allSaved ? 'Saved on this device' : 'Save for offline'}
        </button>
        {canEdit && (
          <button className="icon-btn" aria-label={pl.isPublic ? 'Make private' : 'Share with everyone'} title={pl.isPublic ? 'Shared with everyone. Tap to make private' : 'Private. Tap to share with everyone'} onClick={() => void setPublic(id, !pl.isPublic).then((ok) => showToast(ok ? (pl.isPublic ? 'Now private' : 'Shared with everyone') : 'Could not change that'))}>
            {pl.isPublic ? <Globe size={20} /> : <Lock size={20} />}
          </button>
        )}
        {canEdit && (
          <button className="icon-btn" aria-label="Rename playlist" onClick={() => setRenaming(pl.title)}>
            <Pencil size={20} />
          </button>
        )}
        {canEdit && (
          <button className="icon-btn bad" aria-label="Delete playlist" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={20} />
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this playlist?"
          danger
          confirmLabel="Delete"
          body={<><b>{pl.title}</b> will be removed. The songs stay in the library.</>}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            if (await deletePlaylist(id)) navigate('/library')
            else setConfirmDelete(false)
          }}
        />
      )}

      <div className="song-table">
        <div className="song-head">
          <span>#</span>
          <span>Title</span>
          <span className="song-album">Album</span>
          <span />
          <span>Time</span>
        </div>
        {list.map((s, i) => (
          <SongRow key={s.id} song={s} index={i} onPlay={() => playQueue(list, i, id)} playlistId={id} />
        ))}
        {!list.length && <p className="muted empty">Nothing here yet.</p>}
      </div>
    </>
  )
}
