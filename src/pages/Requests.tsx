import { Check, X } from 'lucide-react'
import { useEffect } from 'react'
import { RequestProgress, YtThumb } from '../components/RequestProgress'
import { useLiveReload } from '../lib/live'
import { useLibrary, useRole } from '../store/library'
import type { RequestStatus } from '../store/library'

const label: Record<RequestStatus, string> = {
  pending_approval: 'Pending approval',
  queued: 'Queued',
  downloading: 'Downloading',
  uploading: 'Uploading',
  done: 'Ready',
  failed: 'Failed',
  rejected: 'Rejected',
}

const flagText: Record<string, string> = { not_music: 'Not music?', too_long: 'Very long' }

export function Requests() {
  const requests = useLibrary((s) => s.requests)
  const mode = useLibrary((s) => s.mode)
  const loadRequests = useLibrary((s) => s.loadRequests)
  const decide = useLibrary((s) => s.decideRequest)
  const role = useRole()

  // Loaded once; after that the server pushes every change and download progress (no polling).
  useEffect(() => {
    void loadRequests()
  }, [loadRequests])
  useLiveReload(['requests'], () => mode === 'api' && void loadRequests())

  return (
    <>
      <h1 className="page-title">Requests</h1>
      <p className="muted lead">
        {role === 'admin'
          ? 'Everyone’s requests. Approve or reject the ones waiting for you.'
          : 'Songs you asked for from YouTube. An admin approves them before the home server downloads them.'}
      </p>

      {!requests.length && <p className="muted empty">No requests yet. Search for a song that is not in your library and tap “Request song”.</p>}

      <div className="yt-list">
        {requests.map((r) => (
          <div key={r.id} className="yt-item">
            <YtThumb youtubeId={r.youtubeId} />
            <div className="min0">
              <div className="truncate yt-t">{r.title}</div>
              <div className="truncate muted">
                {[r.userName, r.channel, r.rejectReason].filter(Boolean).join(' · ')}
                {r.flags.map((f) => (
                  <span key={f} className="flag">
                    {flagText[f] ?? f}
                  </span>
                ))}
              </div>
              <RequestProgress job={r} />
            </div>
            <span className={`status ${r.status}`}>{label[r.status]}</span>
            {role === 'admin' && r.status === 'pending_approval' && (
              <div className="admin-actions">
                <button className="icon-btn ok" aria-label="Approve" onClick={() => void decide(r.id, 'approve')}>
                  <Check size={18} />
                </button>
                <button className="icon-btn bad" aria-label="Reject" onClick={() => void decide(r.id, 'reject')}>
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
