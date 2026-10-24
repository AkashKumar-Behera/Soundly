import { Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { formatBytes } from '../pages/admin/ui'
import { useUi } from '../store/ui'

interface Genre {
  genre: string | null
  count: number
  label: string
  hue: number | null
  hidden: boolean
}

/** Admin controls for one category on the Browse page: hide it, rename it, or delete it with all of its songs. */
export function CategoryManager({ label, onClose, onChanged }: { label: string; onClose: () => void; onChanged: () => void }) {
  const showToast = useUi((s) => s.showToast)
  const [genres, setGenres] = useState<Genre[] | null>(null)
  const [name, setName] = useState(label)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ genres: Genre[] }>('/admin/categories')
      .then((d) => setGenres(d.genres.filter((g) => g.label === label)))
      .catch(() => setGenres([]))
  }, [label])

  const songs = (genres ?? []).reduce((n, g) => n + g.count, 0)
  const hidden = (genres ?? []).length > 0 && (genres ?? []).every((g) => g.hidden)

  const save = async (patch: { label?: string; hidden?: boolean }) => {
    setBusy(true)
    try {
      for (const g of genres ?? []) {
        await api('/admin/categories', { method: 'PUT', body: { genre: g.genre, label: patch.label ?? g.label, hue: g.hue, hidden: patch.hidden ?? g.hidden } })
      }
      showToast('Saved')
      onChanged()
      onClose()
    } catch {
      showToast('Could not save that')
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    try {
      const r = await api<{ deleted: number; freedBytes: number }>(`/admin/categories/by-label?label=${encodeURIComponent(label)}`, { method: 'DELETE' })
      showToast(`Deleted ${r.deleted} songs, freed ${formatBytes(r.freedBytes)}`)
      onChanged()
      onClose()
    } catch {
      showToast('Could not delete that')
    }
    setBusy(false)
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="room-head">
          <h3>{label}</h3>
          <button className="icon-btn dark" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="muted">{genres === null ? 'Loading…' : `${songs} songs`}</p>

        {!confirming ? (
          <>
            <label className="cat-field">
              Name
              <input className="modal-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="modal-actions left">
              <button className="btn-pill" disabled={busy || !name.trim() || name.trim() === label} onClick={() => void save({ label: name.trim() })}>
                Rename
              </button>
              <button className="btn-pill ghost" disabled={busy} onClick={() => void save({ hidden: !hidden })}>
                {hidden ? 'Show to everyone' : 'Hide from everyone'}
              </button>
            </div>
            <button className="btn-pill danger" disabled={busy || genres === null} onClick={() => setConfirming(true)}>
              <Trash2 size={16} /> Delete category and its songs
            </button>
          </>
        ) : (
          <>
            <p className="modal-body">
              This removes <b>{songs} songs</b> from the library for good, with their audio and covers. They disappear from every playlist and like list. Anyone can request a song again later.
            </p>
            <div className="modal-actions">
              <button className="btn-pill ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="btn-pill danger" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Deleting…' : `Delete ${songs} songs`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
