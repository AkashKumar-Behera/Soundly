import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Login } from './pages/Login'
import { Playlist } from './pages/Playlist'
import { Requests } from './pages/Requests'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { useApp } from './store/app'
import { useLibrary } from './store/library'

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
  useEffect(() => {
    void load()
  }, [load])
  if (status === 'loading') return <div className="boot" aria-busy="true" />
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
          <Route path="playlist/:id" element={<Playlist />} />
          <Route path="requests" element={<Requests />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
