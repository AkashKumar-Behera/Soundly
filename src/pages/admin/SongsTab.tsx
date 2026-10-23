import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, thumbUrl } from '../../api/client'
import { Cover } from '../../components/Cover'
import { hueFromId } from '../../store/library'
import { useUi } from '../../store/ui'
import { ConfirmDialog, formatBytes, timeAgo } from './ui'

interface AdminSong {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  sizeBytes: number | null
  youtubeId: string | null
  createdAt: string
  hasThumb: number
  addedBy: string | null
  plays: number
  likes: number
}

export function SongsTab() {
  const showToast = useUi((s) => s.showToast)
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ songs: AdminSong[]; total: number } | null>(null)
  const [limit, setLimit] = useState(50)
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState<AdminSong | null>(null)
  const [editing, setEditing] = useState<AdminSong | null>(null)
  const [draft, setDraft] = useState({ title: '', artist: '', album: '' })

  // Debounced search; stale responses are ignored.
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      api<{ songs: AdminSong[]; total: number }>(`/admin/songs?q=${encodeURIComponent(q)}&limit=${limit}`)
        .then((d) => live && setData(d))
        .catch(() => {})
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, limit, version])

  const reload = () => setVersion((v) => v + 1)

  const remove = async () => {
    if (!deleting) return
    try {
      const r = await api<{ freedBytes: number }>(`/admin/songs/${deleting.id}`, { method: 'DELETE' })
      showToast(`Deleted “${deleting.title}”${r.freedBytes ? `, freed ${formatBytes(r.freedBytes)}` : ''}`)
    } catch {
      showToast('Could not delete that song')
    }
    setDeleting(null)
    reload()
  }

  const startEdit = (s: AdminSong) => {
    setEditing(s)
    setDraft({ title: s.title, artist: s.artist ?? '', album: s.album ?? '' })
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      await api(`/admin/songs/${editing.id}`, { method: 'PATCH', body: draft })
      showToast('Saved')
      setEditing(null)
      reload()
    } catch {
      showToast('Title and artist cannot be empty')
    }
  }

  return (
    <>
      <div className="toolbar">
        <input className="input" placeholder="Search title, artist or album" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted">{data ? `${data.songs.length} of ${data.total} songs` : ''}</span>
      </div>

      {data && !data.songs.length && <p className="muted empty">No songs found.</p>}

      <div className="rows">
        {data?.songs.map((s) => (
          <div key={s.id} className="row">
            <Cover hue={hueFromId(s.id)} size={48} className="r8" thumbUrl={s.hasThumb ? thumbUrl(s.id) : undefined} />
            <div className="min0 grow">
              <div className="truncate strong">{s.title}</div>
              <div className="truncate muted">
                {s.artist ?? 'Unknown'} · {s.album ?? 'Single'} · added {timeAgo(s.createdAt)}
                {s.addedBy ? ` by ${s.addedBy}` : ''}
              </div>
            </div>
            <div className="cols muted">
              <span title="File size">{s.sizeBytes ? formatBytes(s.sizeBytes) : '–'}</span>
              <span title="Plays">{s.plays} plays</span>
              <span title="Likes">{s.likes} ♥</span>
            </div>
            <div className="row-actions">
              <button className="icon-btn" aria-label={`Edit ${s.title}`} onClick={() => startEdit(s)}>
                <Pencil size={17} />
              </button>
              <button className="icon-btn bad" aria-label={`Delete ${s.title}`} onClick={() => setDeleting(s)}>
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {data && data.songs.length < data.total && (
        <button className="btn-pill load-more" onClick={() => setLimit((l) => l + 50)}>
          Show more
        </button>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this song?"
          danger
          confirmLabel="Delete forever"
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
          body={
            <>
              <b>{deleting.title}</b> by {deleting.artist ?? 'Unknown'} will be removed from the library and from Cloudflare R2. It also disappears from everyone’s
              playlists and likes ({deleting.likes} liked it, {deleting.plays} plays). This cannot be undone, but the song can be requested again later.
            </>
          }
        />
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void saveEdit()
            }}
          >
            <h3>Edit song</h3>
            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Artist</span>
              <input value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} />
            </label>
            <label className="field">
              <span>Album</span>
              <input value={draft.album} onChange={(e) => setDraft({ ...draft, album: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-pill" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-pill primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
