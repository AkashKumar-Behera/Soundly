import { Navigate, useSearchParams } from 'react-router-dom'
import { useLibrary, useRole } from '../../store/library'
import { ActivityTab } from './ActivityTab'
import { ArtistsTab } from './ArtistsTab'
import { CategoriesTab } from './CategoriesTab'
import { InvitesTab } from './InvitesTab'
import { LyricsTab } from './LyricsTab'
import { Overview } from './Overview'
import { QueueTab } from './QueueTab'
import { SettingsTab } from './SettingsTab'
import { SongsTab } from './SongsTab'
import { UsersTab } from './UsersTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queue', label: 'Queue' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'categories', label: 'Categories' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'users', label: 'Users' },
  { id: 'invites', label: 'Invites' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
]

export function Admin() {
  const role = useRole()
  const mode = useLibrary((s) => s.mode)
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as string) : 'overview'
  const go = (id: string) => setParams({ tab: id })

  if (mode === 'demo') return <p className="muted empty">The admin panel needs the API, which is not reachable right now.</p>
  if (role !== 'admin') return <Navigate to="/" replace />

  return (
    <>
      <h1 className="page-title">Admin</h1>
      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview goTo={go} />}
      {tab === 'queue' && <QueueTab />}
      {tab === 'songs' && <SongsTab />}
      {tab === 'artists' && <ArtistsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'lyrics' && <LyricsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'invites' && <InvitesTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'activity' && <ActivityTab />}
    </>
  )
}
