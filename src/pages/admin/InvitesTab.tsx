import { Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import { Segmented } from '../../components/Segmented'
import { useUi } from '../../store/ui'
import { timeAgo, useAdminData } from './ui'

interface Invite {
  code: string
  role: string
  createdAt: string
  expiresAt: string | null
  usedBy: string | null
  usedAt: string | null
}

export function InvitesTab() {
  const showToast = useUi((s) => s.showToast)
  const { data, reload } = useAdminData<{ invites: Invite[] }>('/admin/invites')
  const [role, setRole] = useState<'member' | 'trusted' | 'listener'>('member')
  const [days, setDays] = useState<'1' | '7' | '30'>('7')

  const link = (code: string) => `${window.location.origin}/login?invite=${code}`

  const create = async () => {
    try {
      const r = await api<{ code: string; link: string }>('/admin/invites', { method: 'POST', body: { role, expiresInDays: Number(days) } })
      await navigator.clipboard?.writeText(link(r.code)).catch(() => {})
      showToast(`Invite ${r.code} created, link copied`)
      void reload()
    } catch (e) {
      showToast((e as { code?: string }).code === 'user_limit_reached' ? 'User limit reached. Raise it in Settings.' : 'Could not create invite')
    }
  }

  const revoke = async (code: string) => {
    await api(`/admin/invites/${code}`, { method: 'DELETE' }).catch(() => {})
    showToast('Invite revoked')
    void reload()
  }

  return (
    <>
      <div className="toolbar wrap">
        <Segmented value={role} onChange={setRole} options={[{ value: 'member', label: 'Member' }, { value: 'trusted', label: 'Trusted' }, { value: 'listener', label: 'Listener' }]} />
        <Segmented value={days} onChange={setDays} options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
        <button className="btn-pill primary" onClick={() => void create()}>
          New invite
        </button>
      </div>
      <p className="muted">One-time links. A friend signs in with Google using the link and joins with the role you picked.</p>

      <div className="rows">
        {data?.invites.map((i) => {
          const used = !!i.usedBy
          const expired = !!i.expiresAt && new Date(i.expiresAt.replace(' ', 'T') + 'Z').getTime() < Date.now()
          return (
            <div key={i.code} className="row">
              <code className="strong">{i.code}</code>
              <span className="muted">{i.role}</span>
              <span className="muted grow">
                {used ? `used ${timeAgo(i.usedAt)}` : expired ? 'expired' : `expires ${i.expiresAt ? new Date(i.expiresAt.replace(' ', 'T') + 'Z').toLocaleDateString() : 'never'}`}
              </span>
              <span className={`status ${used ? 'done' : expired ? 'rejected' : 'queued'}`}>{used ? 'Used' : expired ? 'Expired' : 'Open'}</span>
              {!used && (
                <div className="row-actions">
                  {!expired && (
                    <button
                      className="icon-btn"
                      aria-label={`Copy link for ${i.code}`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(link(i.code))
                        showToast('Invite link copied')
                      }}
                    >
                      <Copy size={16} />
                    </button>
                  )}
                  <button className="icon-btn bad" aria-label={`Revoke ${i.code}`} onClick={() => void revoke(i.code)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {data && !data.invites.length && <p className="muted empty">No invites yet.</p>}
      </div>
    </>
  )
}
