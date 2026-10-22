import { Check, X } from 'lucide-react'
import { Cover } from '../components/Cover'
import { useApp } from '../store/app'
import type { RequestStatus } from '../store/app'

const label: Record<RequestStatus, string> = {
  pending_approval: 'Pending approval',
  queued: 'Queued',
  downloading: 'Downloading',
  done: 'Ready',
  rejected: 'Rejected',
}

export function Requests() {
  const requests = useApp((s) => s.requests)
  const role = useApp((s) => s.role)
  const setStatus = useApp((s) => s.setRequestStatus)

  return (
    <>
      <h1 className="page-title">Requests</h1>
      <p className="muted lead">
        Songs you asked for from YouTube. {role === 'admin' ? 'As admin you can approve or reject them here.' : 'An admin approves them before the home server downloads them.'}
      </p>

      {!requests.length && <p className="muted empty">No requests yet. Search for a song that is not in your library and tap “Request song”.</p>}

      <div className="yt-list">
        {requests.map((r, i) => (
          <div key={r.id} className="yt-item">
            <Cover hue={(i * 70 + 20) % 360} size={56} className="r8" />
            <div className="min0">
              <div className="truncate yt-t">{r.title}</div>
              <div className="truncate muted">{r.channel}</div>
            </div>
            <span className={`status ${r.status}`}>{label[r.status]}</span>
            {role === 'admin' && r.status === 'pending_approval' && (
              <div className="admin-actions">
                <button className="icon-btn ok" aria-label="Approve" onClick={() => setStatus(r.id, 'queued')}>
                  <Check size={18} />
                </button>
                <button className="icon-btn bad" aria-label="Reject" onClick={() => setStatus(r.id, 'rejected')}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
