import { Download, LogOut, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEV_ADMIN, getDevUser, setDevUser } from '../api/client'
import { Segmented } from '../components/Segmented'
import { useApp } from '../store/app'
import { usePwa } from '../pwa'
import { useLibrary } from '../store/library'
import { useOffline } from '../store/offline'
import { formatBytes } from './admin/ui'
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
  const { theme, ui, playerStyle, autoplay, setTheme, setUi, setPlayerStyle, setAutoplay } = useApp()
  const mode = useLibrary((s) => s.mode)
  const me = useLibrary((s) => s.me)
  const demoRole = useLibrary((s) => s.demoRole)
  const setDemoRole = useLibrary((s) => s.setDemoRole)
  const load = useLibrary((s) => s.load)
  const logout = useLibrary((s) => s.logout)
  const { canInstall, installed, isIos, install } = usePwa()
  const saved = useOffline((s) => s.saved)
  const clearOffline = useOffline((s) => s.clear)
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null)
  const savedCount = Object.keys(saved).length
  const savedBytes = Object.values(saved).reduce((a, b) => a + b, 0)

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
  }, [saved])

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
          <h3>Install Soundly</h3>
          <p className="muted">
            {installed
              ? 'Installed. Soundly opens like an app and keeps your saved songs.'
              : canInstall
                ? 'Add Soundly to your home screen or desktop. It opens in its own window and works offline.'
                : isIos
                  ? 'On iPhone: tap the Share button, then “Add to Home Screen”.'
                  : 'Use your browser’s menu and choose “Install Soundly” (or “Add to Home screen”).'}
          </p>
        </div>
        {!installed && canInstall && (
          <button className="btn-pill primary" onClick={() => void install()}>
            <Download size={16} /> Install app
          </button>
        )}
      </section>

      <section className="setting">
        <div>
          <h3>Saved for offline</h3>
          <p className="muted">
            {savedCount ? `${savedCount} song${savedCount === 1 ? '' : 's'} on this device, ${formatBytes(savedBytes)}` : 'No songs saved yet. Tap the arrow on a song or use “Save for offline” on a playlist.'}
            {quota?.quota ? ` · device storage used by Soundly: ${formatBytes(quota.usage)} of ${formatBytes(quota.quota)} available` : ''}
          </p>
        </div>
        {savedCount > 0 && (
          <button className="btn-pill" onClick={() => void clearOffline()}>
            Remove all
          </button>
        )}
      </section>

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
            { value: 'modern', label: 'Modern' },
          ]}
        />
      </section>

      <section className="setting">
        <div>
          <h3>Autoplay similar songs</h3>
          <p className="muted">When the queue runs low, keep playing songs like the current one. Trusted listeners also get a few new songs downloaded.</p>
        </div>
        <Segmented
          value={autoplay ? 'on' : 'off'}
          onChange={(v) => setAutoplay(v === 'on')}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </section>

      <ScreenInfo />

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

function ScreenInfo() {
  const [info, setInfo] = useState('')
  useEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-bottom);visibility:hidden'
    document.body.appendChild(probe)
    const read = () =>
      setInfo(`${window.innerWidth}×${window.innerHeight} in a ${screen.width}×${screen.height} screen · bottom inset ${probe.offsetHeight}px · ${window.matchMedia('(display-mode: standalone)').matches ? 'installed app' : 'browser'}`)
    read()
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      probe.remove()
    }
  }, [])
  return <p className="muted screen-info">{info}</p>
}

