import { Crown } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import { useLibrary } from '../../store/library'
import { useUi } from '../../store/ui'
import { formatBytes, timeAgo, useAdminData } from './ui'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  canRequestDirect: number
  dailyRequestLimit: number
  proUntil: string | null
  contributionNote: string | null
  disabled: number
  createdAt: string
  lastSeenAt: string | null
  requestCount: number
  playCount: number
  minutesListened: number
  songsAdded: number
  storageBytes: number
}

const ROLES = ['listener', 'member', 'trusted', 'admin']

const isPro = (u: AdminUser) => !!u.proUntil && new Date(u.proUntil.replace(' ', 'T') + 'Z').getTime() > Date.now()
const inOneYear = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 19).replace('T', ' ')

export function UsersTab() {
  const showToast = useUi((s) => s.showToast)
  const meId = useLibrary((s) => s.me?.id)
  const { data, reload } = useAdminData<{ users: AdminUser[] }>('/admin/users')
  const [busy, setBusy] = useState<string | null>(null)

  const patch = async (u: AdminUser, body: Record<string, unknown>) => {
    setBusy(u.id)
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body })
    } catch (e) {
      showToast((e as { code?: string }).code === 'cannot_disable_self' ? 'You cannot disable yourself' : 'Could not save')
    }
    setBusy(null)
    void reload()
  }

  return (
    <div className="rows">
      {data?.users.map((u) => {
        const me = u.id === meId
        return (
          <div key={u.id} className={`user-card ${u.disabled ? 'off' : ''}`}>
            <div className="user-head">
              <div className="avatar">{u.name.slice(0, 1).toUpperCase()}</div>
              <div className="min0 grow">
                <div className="truncate strong">
                  {u.name} {me && <span className="muted">(you)</span>} {isPro(u) && <span className="pro"><Crown size={11} /> PRO</span>}
                  {u.disabled ? <span className="flag">Disabled</span> : null}
                </div>
                <div className="truncate muted">
                  {u.email} · joined {timeAgo(u.createdAt)} · seen {timeAgo(u.lastSeenAt)}
                </div>
              </div>
            </div>

            <div className="user-stats muted">
              <span>{u.playCount} plays</span>
              <span>{u.minutesListened} min</span>
              <span>{u.requestCount} requests</span>
              <span>
                {u.songsAdded} songs · {formatBytes(u.storageBytes)}
              </span>
            </div>

            <div className="user-controls">
              <label>
                Role
                <select value={u.role} disabled={busy === u.id || me} onChange={(e) => void patch(u, { role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Daily requests
                <input
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={u.dailyRequestLimit}
                  key={`${u.id}-${u.dailyRequestLimit}`}
                  onBlur={(e) => Number(e.target.value) !== u.dailyRequestLimit && void patch(u, { dailyRequestLimit: Number(e.target.value) })}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={!!u.canRequestDirect} disabled={busy === u.id} onChange={(e) => void patch(u, { canRequestDirect: e.target.checked })} />
                Skip approval
              </label>
              <label className="check">
                <input type="checkbox" checked={!!u.disabled} disabled={busy === u.id || me} onChange={(e) => void patch(u, { disabled: e.target.checked })} />
                Disabled
              </label>
              {isPro(u) ? (
                <button className="btn-pill" onClick={() => void patch(u, { proUntil: null })}>
                  Remove Pro
                </button>
              ) : (
                <button className="btn-pill" onClick={() => void patch(u, { proUntil: inOneYear() })}>
                  Give Pro 1 year
                </button>
              )}
            </div>

            <label className="note">
              <span className="muted">
                Contribution note{u.proUntil ? ` · Pro until ${u.proUntil.slice(0, 10)}` : ''}
              </span>
              <input
                className="input"
                placeholder="e.g. paid ₹99 via UPI on 23 Oct"
                defaultValue={u.contributionNote ?? ''}
                key={`${u.id}-note-${u.contributionNote}`}
                onBlur={(e) => e.target.value !== (u.contributionNote ?? '') && void patch(u, { contributionNote: e.target.value })}
              />
            </label>
          </div>
        )
      })}
    </div>
  )
}
