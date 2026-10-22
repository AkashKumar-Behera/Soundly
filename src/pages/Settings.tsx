import { getDevUser, setDevUser } from '../api/client'
import { Segmented } from '../components/Segmented'
import { useApp } from '../store/app'
import { useLibrary } from '../store/library'
import type { Role } from '../store/library'

// Seeded users in the local API (see api/seed.sql). Phase 3 removes this switcher.
const DEV_USERS = [
  { value: 'akashkumar48874@gmail.com', label: 'Admin' },
  { value: 'trusted@example.com', label: 'Trusted' },
  { value: 'member@example.com', label: 'Member' },
  { value: 'listener@example.com', label: 'Listener' },
]

export function Settings() {
  const { theme, ui, playerStyle, setTheme, setUi, setPlayerStyle } = useApp()
  const mode = useLibrary((s) => s.mode)
  const me = useLibrary((s) => s.me)
  const demoRole = useLibrary((s) => s.demoRole)
  const setDemoRole = useLibrary((s) => s.setDemoRole)
  const load = useLibrary((s) => s.load)

  return (
    <>
      <h1 className="page-title">Settings</h1>

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

      {mode === 'api' ? (
        <section className="setting">
          <div>
            <h3>Dev user</h3>
            <p className="muted">
              Signed in as {me?.name} ({me?.role}). Local development only: pick a seeded user to see what each role gets. Real sign-in arrives later.
            </p>
          </div>
          <Segmented
            value={getDevUser() ?? DEV_USERS[0].value}
            onChange={(email) => {
              setDevUser(email)
              void load()
            }}
            options={DEV_USERS}
          />
        </section>
      ) : (
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
