import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileNav } from './MobileNav'
import { NowPlaying } from './NowPlaying'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import { Toast } from './Toast'
import { TopBar } from './TopBar'

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="app">
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
