import { timeAgo, useAdminData } from './ui'

interface Entry {
  id: number
  action: string
  target: string | null
  detail: string | null
  createdAt: string
  actor: string | null
}

const LABEL: Record<string, string> = {
  'request.approve': 'approved a request',
  'request.reject': 'rejected a request',
  'request.retry': 'retried a failed request',
  'song.delete': 'deleted a song',
  'song.edit': 'edited a song',
  'user.update': 'changed a user',
  'user.signup': 'joined with an invite',
  'invite.create': 'created an invite',
  'invite.revoke': 'revoked an invite',
  'settings.update': 'changed settings',
}

function summary(e: Entry): string {
  let d: Record<string, unknown> = {}
  try {
    d = e.detail ? (JSON.parse(e.detail) as Record<string, unknown>) : {}
  } catch {
    // keep empty
  }
  if (e.action === 'song.delete') return `${d.title ?? ''}${d.artist ? ' by ' + d.artist : ''}`
  if (e.action === 'song.edit') return String(d.title ?? e.target ?? '')
  if (e.action === 'invite.create' || e.action === 'invite.revoke') return String(e.target ?? '')
  if (e.action === 'user.signup') return `role ${d.role ?? ''}`
  if (e.action === 'request.reject') return String(d.reason ?? '')
  const keys = Object.keys(d)
  return keys.length ? keys.map((k) => `${k}: ${JSON.stringify(d[k])}`).join(', ').slice(0, 120) : ''
}

export function ActivityTab() {
  const { data } = useAdminData<{ entries: Entry[] }>('/admin/audit?limit=100', 15000)
  return (
    <div className="rows">
      {data?.entries.map((e) => (
        <div key={e.id} className="row">
          <div className="min0 grow">
            <div className="truncate">
              <b>{e.actor ?? 'System'}</b> {LABEL[e.action] ?? e.action}
            </div>
            <div className="truncate muted">{summary(e)}</div>
          </div>
          <span className="muted">{timeAgo(e.createdAt)}</span>
        </div>
      ))}
      {data && !data.entries.length && <p className="muted empty">No activity yet.</p>}
    </div>
  )
}
