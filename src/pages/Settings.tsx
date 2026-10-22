import { Segmented } from '../components/Segmented'
import { useApp } from '../store/app'

export function Settings() {
  const { theme, ui, playerStyle, role, setTheme, setUi, setPlayerStyle, setRole } = useApp()

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

      <section className="setting">
        <div>
          <h3>Demo role</h3>
          <p className="muted">Preview what each role sees. Real roles come from the backend.</p>
        </div>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'listener', label: 'Listener' },
            { value: 'member', label: 'Member' },
            { value: 'trusted', label: 'Trusted' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
      </section>
    </>
  )
}
