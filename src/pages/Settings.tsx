import { LogOut, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEV_ADMIN, getDevUser, setDevUser } from '../api/client'
import { Segmented } from '../components/Segmented'
import { useApp } from '../store/app'
import { useLibrary } from '../store/library'
import type { Role } from '../store/library'

// Seeded users in the local API (see api/seed.sql). Only shown by the dev server.
const DEV_USERS = [
  { value: DEV_ADMIN, label: 'Admin' },
  { value: 'trusted@example.com', label: 'Trusted' },
  { value: 'member@example.com', label: 'Member' },
  { value: 'listener@example.com', label: 'Listener' },
  { value: '', label: 'My session' },
]

export function Settings() {
  const { theme, ui, playerStyle, setTheme, setUi, setPlayerStyle } = useApp()
  const mode = useLibrary((s) => s.mode)
  const me = useLibrary((s) => s.me)
  const demoRole = useLibrary((s) => s.demoRole)
  const setDemoRole = useLibrary((s) => s.setDemoRole)
  const load = useLibrary((s) => s.load)
  const logout = useLibrary((s) => s.logout)

  return (
    <>
      <h1 className="page-title">Settings</h1>

      {mode === 'api' && me && (
        <section className="setting">
          <div>
            <h3>Account</h3>
            <p className="muted">
              {me.name} · {me.email} · {me.role}
              {me.isPro ? ' · Pro' : ''}
            </p>
          </div>
          <button className="btn-pill" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </section>
      )}

      <section className="setting">
        <div>
          <h3>App theme</h3>
          <p className="muted">Dark, light, or follow your device.</p>
        </div>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </section>

      <section className="setting">
        <div>
          <h3>Interface style</h3>
          <p className="muted">Classic is familiar and compact. Blend is softer and rounder.</p>
        </div>
        <Segmented
          value={ui}
          onChange={setUi}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'blend', label: 'Blend' },
          ]}
        />
      </section>

      <section className="setting">
        <div>
          <h3>Player screen</h3>
          <p className="muted">How the full-screen Now Playing looks.</p>
        </div>
        <Segmented
          value={playerStyle}
          onChange={setPlayerStyle}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'immersive', label: 'Immersive' },
            { value: 'vinyl', label: 'Vinyl' },
          ]}
        />
      </section>

      {mode === 'api' && me?.role === 'admin' && (
        <section className="setting">
          <div>
            <h3>Admin panel</h3>
            <p className="muted">Users, request queue, songs, invites, analytics and limits.</p>
          </div>
          <Link to="/admin" className="btn-pill">
            <ShieldCheck size={16} /> Open admin panel
          </Link>
        </section>
      )}

      {mode === 'api' && import.meta.env.DEV && (
        <section className="setting">
          <div>
            <h3>Dev user</h3>
            <p className="muted">Local development only: act as a seeded user to see what each role gets, or use your real session.</p>
          </div>
          <Segmented
            value={getDevUser() ?? ''}
            onChange={(email) => {
              setDevUser(email)
              void load()
            }}
            options={DEV_USERS}
          />
        </section>
      )}

      {mode === 'demo' && (
        <section className="setting">
          <div>
            <h3>Demo role</h3>
            <p className="muted">The API is not reachable, so this runs on demo data. Preview what each role sees.</p>
          </div>
          <Segmented<Role>
            value={demoRole}
            onChange={setDemoRole}
            options={[
              { value: 'listener', label: 'Listener' },
              { value: 'member', label: 'Member' },
              { value: 'trusted', label: 'Trusted' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        </section>
      )}
    </>
  )
}
