import { ArrowDownToLine, Check, Heart, ListEnd, ListPlus, ListStart, Mic2, Radio, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import { extendQueue } from '../lib/radio'
import { lyricsCache } from '../lib/lyricsCache'
import { useOfflineSave } from '../lib/useOfflineSave'
import { useLibrary, useRole } from '../store/library'
import { useOffline } from '../store/offline'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

function Item({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

/** The "more" menu for a song: queue, like, playlists, similar songs, offline, lyrics. */
function SongMenu() {
  const menu = useUi((s) => s.songMenu)
  const close = useUi((s) => s.openSongMenu)
  const setPicker = useUi((s) => s.setPlaylistPicker)
  const setLyrics = useUi((s) => s.setLyricsEditor)
  const showToast = useUi((s) => s.showToast)
  const role = useRole()
  const navigate = useNavigate()
  const mode = useLibrary((s) => s.mode)
  const liked = useLibrary((s) => (menu ? s.liked.includes(menu.song.id) : false))
  const toggleLike = useLibrary((s) => s.toggleLike)
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist)
  const ownsPlaylist = useLibrary((s) => !!menu?.playlistId && s.playlists.find((p) => p.id === menu.playlistId)?.isOwner !== false)
  const saved = useOffline((s) => (menu ? s.saved[menu.song.id] !== undefined : false))
  const toggleOffline = useOfflineSave()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, close])

  if (!menu) return null
  const song = menu.song
  const done = (fn: () => void) => () => {
    close(null)
    fn()
  }
  const canLyrics = mode === 'api' && (role === 'trusted' || role === 'admin')

  return (
    <div className="menu-back" onClick={() => close(null)} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        className="menu"
        style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: 'hidden' }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-title truncate">{song.title}</div>
        <Item icon={<ListStart size={18} />} onClick={done(() => { usePlayer.getState().playNext(song); showToast('Playing next') })}>
          Play next
        </Item>
        <Item icon={<ListEnd size={18} />} onClick={done(() => { usePlayer.getState().enqueue(song); showToast('Added to queue') })}>
          Add to queue
        </Item>
        <Item icon={<Heart size={18} fill={liked ? 'currentColor' : 'none'} />} onClick={done(() => void toggleLike(song.id))}>
          {liked ? 'Remove from liked songs' : 'Add to liked songs'}
        </Item>
        {mode === 'api' && (
          <Item icon={<ListPlus size={18} />} onClick={() => setPicker(song)}>
            Add to playlist
          </Item>
        )}
        {menu.playlistId && ownsPlaylist && menu.playlistId !== 'liked' && (
          <Item
            icon={<Trash2 size={18} />}
            danger
            onClick={done(() => void removeFromPlaylist(menu.playlistId!, song.id).then((ok) => showToast(ok ? 'Removed from playlist' : 'Could not remove')))}
          >
            Remove from this playlist
          </Item>
        )}
        {mode === 'api' && song.artist && song.artist !== 'Unknown Artist' && (
          <Item icon={<UserRound size={18} />} onClick={done(() => navigate(`/artist/${encodeURIComponent(song.artist)}`))}>
            View artist
          </Item>
        )}
        {mode === 'api' && (
          <Item icon={<Radio size={18} />} onClick={done(() => void extendQueue(song, { force: true }))}>
            Similar songs
          </Item>
        )}
        <Item icon={saved ? <Check size={18} /> : <ArrowDownToLine size={18} />} onClick={done(() => void toggleOffline(song))}>
          {saved ? 'Remove from this device' : 'Save for offline'}
        </Item>
        {canLyrics && (
          <Item icon={<Mic2 size={18} />} onClick={() => setLyrics(song)}>
            Add or fix lyrics
          </Item>
        )}
      </div>
    </div>
  )
}

/** Pick a playlist to add a song to, or make a new one on the spot. */
function PlaylistPicker() {
  const song = useUi((s) => s.playlistPicker)
  const close = useUi((s) => s.setPlaylistPicker)
  const showToast = useUi((s) => s.showToast)
  const playlists = useLibrary((s) => s.playlists)
  const add = useLibrary((s) => s.addToPlaylist)
  const create = useLibrary((s) => s.createPlaylist)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setName(''), [song])
  if (!song) return null

  const mine = playlists.filter((p) => p.isOwner !== false)
  const addTo = async (id: string, title: string) => {
    setBusy(true)
    const ok = await add(id, song.id)
    setBusy(false)
    showToast(ok ? `Added to ${title}` : 'Could not add that song')
    if (ok) close(null)
  }
  const makeNew = async () => {
    const title = name.trim()
    if (!title) return
    setBusy(true)
    const id = await create(title)
    if (!id) {
      setBusy(false)
      return showToast('Could not create the playlist')
    }
    await addTo(id, title)
  }

  return (
    <div className="modal-back" onClick={() => close(null)}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="room-head">
          <h3>Add to playlist</h3>
          <button className="icon-btn dark" aria-label="Close" onClick={() => close(null)}>
            <X size={20} />
          </button>
        </div>
        <form
          className="room-join"
          onSubmit={(e) => {
            e.preventDefault()
            void makeNew()
          }}
        >
          <input value={name} maxLength={80} placeholder="New playlist name" onChange={(e) => setName(e.target.value)} />
          <button className="btn-pill" type="submit" disabled={busy || !name.trim()}>
            Create
          </button>
        </form>
        <div className="picker-list">
          {mine.map((p) => (
            <button key={p.id} disabled={busy} onClick={() => void addTo(p.id, p.title)}>
              <span className="picker-art" style={{ background: `linear-gradient(135deg, hsl(${p.hue} 70% 45%), hsl(${(p.hue + 50) % 360} 70% 28%))` }} />
              <span className="min0">
                <span className="truncate t">{p.title}</span>
                <span className="muted">{p.songCount} songs</span>
              </span>
            </button>
          ))}
          {!mine.length && <p className="muted empty">No playlists yet. Name one above.</p>}
        </div>
      </div>
    </div>
  )
}

/** Trusted users paste lyrics for a song; only they see them until an admin approves. Admins publish directly. */
function LyricsEditor() {
  const song = useUi((s) => s.lyricsEditor)
  const close = useUi((s) => s.setLyricsEditor)
  const showToast = useUi((s) => s.showToast)
  const role = useRole()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setText(''), [song])
  if (!song) return null

  const save = async () => {
    setBusy(true)
    try {
      await api(`/lyrics/${song.id}/mine`, { method: 'PUT', body: { text } })
      lyricsCache.delete(song.id)
      window.dispatchEvent(new CustomEvent('soundly:lyrics-changed', { detail: song.id }))
      showToast(role === 'admin' ? 'Lyrics published' : 'Saved. Only you see it until an admin approves')
      close(null)
    } catch (e) {
      showToast(e instanceof ApiError && e.code === 'invalid_request' ? 'Paste a bit more text first' : 'Could not save the lyrics')
    }
    setBusy(false)
  }

  return (
    <div className="modal-back" onClick={() => close(null)}>
      <div className="modal lyrics-edit" onClick={(e) => e.stopPropagation()}>
        <div className="room-head">
          <h3>Lyrics for {song.title}</h3>
          <button className="icon-btn dark" aria-label="Close" onClick={() => close(null)}>
            <X size={20} />
          </button>
        </div>
        <p className="muted">
          Paste plain lyrics, or synced ones with timestamps like <code>[01:23.45] line</code>.{' '}
          {role === 'admin' ? 'Admin edits go live for everyone.' : 'Only you see your version until an admin approves it.'}
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lyrics here" spellCheck={false} />
        <div className="modal-actions">
          <button className="btn-pill ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn-pill" disabled={busy || text.trim().length < 10} onClick={() => void save()}>
            {role === 'admin' ? 'Publish' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Name and create an empty playlist, then open it. */
function CreatePlaylist() {
  const open = useUi((s) => s.createPlaylistOpen)
  const setOpen = useUi((s) => s.setCreatePlaylist)
  const showToast = useUi((s) => s.showToast)
  const create = useLibrary((s) => s.createPlaylist)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setName(''), [open])
  if (!open) return null

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          const title = name.trim()
          if (!title) return
          setBusy(true)
          void create(title).then((id) => {
            setBusy(false)
            if (!id) return showToast('Could not create the playlist')
            setOpen(false)
            navigate(`/playlist/${id}`)
          })
        }}
      >
        <h3>New playlist</h3>
        <input autoFocus className="modal-input" value={name} maxLength={80} placeholder="Playlist name" onChange={(e) => setName(e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn-pill ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="btn-pill" disabled={busy || !name.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  )
}

export function SongMenuHost() {
  return (
    <>
      <CreatePlaylist />
      <SongMenu />
      <PlaylistPicker />
      <LyricsEditor />
    </>
  )
}
