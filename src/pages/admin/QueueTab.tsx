import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import { Cover } from '../../components/Cover'
import { hueFromId } from '../../store/library'
import { useUi } from '../../store/ui'
import { timeAgo, useAdminData } from './ui'

interface Job {
  id: string
  userName?: string
  youtubeId: string
  title: string
  channel: string | null
  durationSec: number | null
  flags: string[]
  status: string
  error: string | null
  rejectReason: string | null
  createdAt: string
}

const FILTERS = [
  { id: 'pending_approval', label: 'Pending' },
  { id: 'queued', label: 'Queued' },
  { id: 'downloading', label: 'Working' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
  { id: 'rejected', label: 'Rejected' },
  { id: '', label: 'All' },
]

const LABEL: Record<string, string> = {
  pending_approval: 'Pending approval',
  queued: 'Queued',
  downloading: 'Downloading',
  uploading: 'Uploading',
  done: 'Ready',
  failed: 'Failed',
  rejected: 'Rejected',
}
const FLAG: Record<string, string> = { not_music: 'Not music?', too_long: 'Very long' }

export function QueueTab() {
  const showToast = useUi((s) => s.showToast)
  const [filter, setFilter] = useState('pending_approval')
  // "Working" covers both downloading and uploading, so fetch everything and filter here.
  const { data, reload } = useAdminData<{ requests: Job[] }>('/admin/requests', 5000)
  const all = data?.requests ?? []
  const rows = all.filter((j) => (filter === '' ? true : filter === 'downloading' ? ['downloading', 'uploading'].includes(j.status) : j.status === filter))
  const count = (id: string) => all.filter((j) => (id === '' ? true : id === 'downloading' ? ['downloading', 'uploading'].includes(j.status) : j.status === id)).length
  const cleanPending = all.filter((j) => j.status === 'pending_approval' && !j.flags.length)

  const act = async (id: string, action: 'approve' | 'reject' | 'retry') => {
    try {
      await api(`/admin/requests/${id}/${action}`, { method: 'POST', body: {} })
    } catch {
      showToast('That request changed, refreshing')
    }
    void reload()
  }

  const approveAll = async () => {
    await Promise.all(cleanPending.map((j) => api(`/admin/requests/${j.id}/approve`, { method: 'POST', body: {} }).catch(() => {})))
    showToast(`Approved ${cleanPending.length}`)
    void reload()
  }

  return (
    <>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label} <span className="count">{count(f.id)}</span>
          </button>
        ))}
        {filter === 'pending_approval' && cleanPending.length > 1 && (
          <button className="btn-pill ghost-right" onClick={() => void approveAll()}>
            <Check size={16} /> Approve {cleanPending.length} music requests
          </button>
        )}
      </div>

      {!rows.length && <p className="muted empty">Nothing in “{FILTERS.find((f) => f.id === filter)?.label}”.</p>}

      <div className="rows">
        {rows.map((j) => (
          <div key={j.id} className="row">
            <Cover hue={hueFromId(j.youtubeId)} size={48} className="r8" />
            <div className="min0 grow">
              <div className="truncate strong">{j.title}</div>
              <div className="truncate muted">
                {[j.userName, j.channel, timeAgo(j.createdAt)].filter(Boolean).join(' · ')}
                {j.flags.map((f) => (
                  <span key={f} className="flag">
                    {FLAG[f] ?? f}
                  </span>
                ))}
              </div>
              {j.status === 'failed' && j.error && <div className="row-error truncate">{j.error}</div>}
              {j.status === 'rejected' && j.rejectReason && <div className="muted truncate">{j.rejectReason}</div>}
            </div>
            <span className={`status ${j.status}`}>{LABEL[j.status] ?? j.status}</span>
            <div className="row-actions">
              {j.status === 'pending_approval' && (
                <button className="icon-btn ok" aria-label="Approve" onClick={() => void act(j.id, 'approve')}>
                  <Check size={18} />
                </button>
              )}
              {(j.status === 'pending_approval' || j.status === 'queued') && (
                <button className="icon-btn bad" aria-label="Reject" onClick={() => void act(j.id, 'reject')}>
                  <X size={18} />
                </button>
              )}
              {j.status === 'failed' && (
                <button className="icon-btn" aria-label="Retry" onClick={() => void act(j.id, 'retry')}>
                  <RotateCcw size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
