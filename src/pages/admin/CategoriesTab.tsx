import { useState } from 'react'
import { api } from '../../api/client'
import { useUi } from '../../store/ui'
import { useAdminData } from './ui'

interface Genre {
  genre: string | null
  count: number
  label: string
  hue: number | null
  hidden: boolean
}

/**
 * Categories come from each song's genre, looked up by the laptop agent. Rename a category to change what people see,
 * give two genres the same name to merge them, or hide one. Songs with no match are shown as "Other".
 */
export function CategoriesTab() {
  const showToast = useUi((s) => s.showToast)
  const { data, reload } = useAdminData<{ genres: Genre[]; unchecked: number }>('/admin/categories')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const key = (g: Genre) => g.genre ?? 'Other'

  const save = async (g: Genre, patch: { label?: string; hidden?: boolean }) => {
    try {
      await api('/admin/categories', { method: 'PUT', body: { genre: g.genre, label: patch.label ?? g.label, hue: g.hue, hidden: patch.hidden ?? g.hidden } })
      showToast('Saved')
    } catch {
      showToast('Could not save that')
    }
    void reload()
  }

  return (
    <>
      <p className="muted">
        Genres found for your songs {data?.unchecked ? `(${data.unchecked} songs still being checked by the laptop)` : ''}. Rename one to change what people see. Give two the same name to merge them.
      </p>
      <div className="toolbar">
        <button
          className="btn-pill"
          onClick={() =>
            void api<{ queued: number }>('/admin/categories/recheck', { method: 'POST', body: {} })
              .then((r) => showToast(r.queued ? `${r.queued} songs will be checked again` : 'Nothing to check again'))
              .then(reload)
              .catch(() => showToast('Could not do that'))
          }
        >
          Check uncategorised songs again
        </button>
      </div>
      <div className="rows">
        {data?.genres.map((g) => (
          <div key={key(g)} className={`row ${g.hidden ? 'dim' : ''}`}>
            <div className="min0 grow">
              <div className="truncate strong">{g.genre ?? 'No genre found'}</div>
              <div className="muted">{g.count} songs</div>
            </div>
            <input
              className="input cat-input"
              value={draft[key(g)] ?? g.label}
              maxLength={40}
              onChange={(e) => setDraft((d) => ({ ...d, [key(g)]: e.target.value }))}
              onBlur={() => {
                const v = (draft[key(g)] ?? g.label).trim()
                if (v && v !== g.label) void save(g, { label: v })
              }}
              aria-label={`Name for ${g.genre ?? 'songs with no genre'}`}
            />
            <label className="switch">
              <input type="checkbox" checked={!g.hidden} onChange={(e) => void save(g, { hidden: !e.target.checked })} />
              <i />
              Show
            </label>
          </div>
        ))}
      </div>
    </>
  )
}
