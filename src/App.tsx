import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Maintenance, Splash } from './components/Splash'
import { startLive, stopLive } from './lib/live'
import { Admin } from './pages/admin/Admin'
import { Home } from './pages/Home'
import { ArtistPage } from './pages/ArtistPage'
import { Category } from './pages/Category'
import { Artists } from './pages/Artists'
import { Library } from './pages/Library'
import { Login } from './pages/Login'
import { Playlist } from './pages/Playlist'
import { Requests } from './pages/Requests'
import { RoomJoin } from './pages/RoomJoin'
import { Search } from './pages/Search'
import { Wrapped } from './pages/Wrapped'
import { Settings } from './pages/Settings'
import { useApp } from './store/app'
import { useLibrary } from './store/library'
import { useOffline } from './store/offline'

function useTheme() {
  const theme = useApp((s) => s.theme)
  const ui = useApp((s) => s.ui)

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
      root.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0A0A0B' : '#ECEEF0')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.ui = ui
  }, [ui])
}

export default function App() {
  useTheme()
  const load = useLibrary((s) => s.load)
  const status = useLibrary((s) => s.status)
  const resumeAt = useLibrary((s) => s.resumeAt)
  const mode = useLibrary((s) => s.mode)
  useEffect(() => {
    void load()
    void useOffline.getState().init()
  }, [load])
  useEffect(() => {
    if (status === 'ready' && mode === 'api') startLive()
    else if (status === 'unauth') stopLive()
  }, [status, mode])
  if (status === 'loading') return <Splash />
  if (status === 'maintenance') return <Maintenance resumeAt={resumeAt} onRetry={() => void load()} />
  if (status === 'offline') return <Splash offline onRetry={() => void load()} />
  if (status === 'unauth') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    )
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="search" element={<Search />} />
          <Route path="library" element={<Library />} />
          <Route path="artists" element={<Artists />} />
          <Route path="artist/:name" element={<ArtistPage />} />
          <Route path="category/:label" element={<Category />} />
          <Route path="playlist/:id" element={<Playlist />} />
          <Route path="requests" element={<Requests />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
          <Route path="wrapped" element={<Wrapped />} />
          <Route path="room/:code" element={<RoomJoin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
