import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useUi } from '../../store/ui'
import { useAdminData } from './ui'

interface SettingsData {
  settings: Record<string, number>
  rules: Record<string, { min: number; max: number }>
}

const FIELDS: { key: string; label: string; help: string; unit: string }[] = [
  { key: 'max_users', label: 'Maximum users', help: 'Signup stops when this many accounts exist. Keep it small, the free tiers are shared.', unit: 'users' },
  { key: 'max_duration_sec', label: 'Longest song', help: 'Requests longer than this always need your approval and the agent skips them.', unit: 'seconds' },
  { key: 'max_playlist_import', label: 'Playlist import size', help: 'Most songs one YouTube playlist import may add (import arrives later).', unit: 'songs' },
  { key: 'agent_online_window_sec', label: 'Agent “online” window', help: 'How long after its last heartbeat the laptop agent still counts as online.', unit: 'seconds' },
]

export function SettingsTab() {
  const showToast = useUi((s) => s.showToast)
  const { data, reload } = useAdminData<SettingsData>('/admin/settings')
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, String(v)])))
  }, [data])

  const dirty = data ? FIELDS.some((f) => Number(draft[f.key]) !== data.settings[f.key]) : false

  const save = async () => {
    try {
      await api('/admin/settings', { method: 'PATCH', body: Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key])])) })
      showToast('Settings saved')
      void reload()
    } catch (e) {
      const key = (e as { data?: { key?: string } }).data?.key
      const rule = key && data?.rules[key]
      showToast(rule ? `${key.replace(/_/g, ' ')} must be between ${rule.min} and ${rule.max}` : 'Could not save')
    }
  }

  return (
    <div className="panel">
      {FIELDS.map((f) => (
        <div key={f.key} className="setting">
          <div>
            <h3>{f.label}</h3>
            <p className="muted">{f.help}</p>
          </div>
          <label className="num-field">
            <input type="number" value={draft[f.key] ?? ''} min={data?.rules[f.key]?.min} max={data?.rules[f.key]?.max} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            <span className="muted">{f.unit}</span>
          </label>
        </div>
      ))}
      <div className="modal-actions left">
        <button className="btn-pill primary" disabled={!dirty} onClick={() => void save()}>
          Save changes
        </button>
      </div>
    </div>
  )
}
