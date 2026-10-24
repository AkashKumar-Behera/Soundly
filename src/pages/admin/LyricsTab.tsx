import { Check, X } from 'lucide-react'
import { api } from '../../api/client'
import { useUi } from '../../store/ui'
import { timeAgo, useAdminData } from './ui'

interface Submission {
  id: string
  songId: string
  title: string
  userName: string
  text: string
  createdAt: string
}

/** Lyrics that trusted users pasted. Approving makes them the lyrics everyone sees. */
export function LyricsTab() {
  const showToast = useUi((s) => s.showToast)
  const { data, reload } = useAdminData<{ submissions: Submission[] }>('/lyrics/submissions/pending', ['lyrics'])
  const rows = data?.submissions ?? []

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await api(`/lyrics/submissions/${id}/${decision}`, { method: 'POST', body: {} })
      showToast(decision === 'approve' ? 'Lyrics are live for everyone' : 'Rejected')
    } catch {
      showToast('That one changed, refreshing')
    }
    void reload()
  }

  return (
    <>
      {!rows.length && <p className="muted empty">No lyrics waiting for review.</p>}
      <div className="rows">
        {rows.map((r) => (
          <div key={r.id} className="row lyric-row">
            <div className="min0 grow">
              <div className="truncate strong">{r.title}</div>
              <div className="truncate muted">
                {r.userName} · {timeAgo(r.createdAt)}
              </div>
              <pre className="lyric-preview">{r.text.slice(0, 600)}</pre>
            </div>
            <div className="row-actions">
              <button className="icon-btn ok" aria-label="Approve" onClick={() => void decide(r.id, 'approve')}>
                <Check size={18} />
              </button>
              <button className="icon-btn bad" aria-label="Reject" onClick={() => void decide(r.id, 'reject')}>
                <X size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
