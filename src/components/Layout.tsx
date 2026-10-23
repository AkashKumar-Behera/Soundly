import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useCurrent, usePlayer } from '../store/player'
import { useShortcuts } from '../lib/useShortcuts'
import { Banners } from './Banners'
import { ListenTogether, RoomPill } from './ListenTogether'
import { MobileNav } from './MobileNav'
import { NowPlaying } from './NowPlaying'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import { Toast } from './Toast'
import { TopBar } from './TopBar'

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const song = useCurrent()
  const playing = usePlayer((s) => s.playing)
  useShortcuts()

  // The browser tab (and the taskbar) show what is playing.
  useEffect(() => {
    document.title = song && playing ? `${song.title} · ${song.artist} - Soundly` : 'Soundly'
  }, [song, playing])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="app">
      <Banners />
      <RoomPill />
      <ListenTogether />
      <Sidebar />
      <main className="main" ref={mainRef}>
        <TopBar />
        <motion.div
          key={pathname}
          className="page"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
      <PlayerBar />
      <MobileNav />
      <NowPlaying />
      <Toast />
    </div>
  )
}
