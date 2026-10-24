import { House, Inbox, Library, Pause, Play, Search, Settings } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useCurrent, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { Cover } from './Cover'

const tabs = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const song = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const toggle = usePlayer((s) => s.toggle)
  const setNowPlaying = useUi((s) => s.setNowPlaying)
  const ref = useRef<HTMLDivElement>(null)

  // The page ends where the player and tab bar begin (like a native tab bar), so content never shows behind or under them.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="mobile-nav" ref={ref}>
      {song && (
        <div className="mini" onClick={() => setNowPlaying(true)}>
          <Cover hue={song.hue} hue2={song.hue2} thumbUrl={song.thumbUrl} size={40} className="r8" />
          <div className="min0">
            <div className="truncate mini-title">{song.title}</div>
            <div className="truncate mini-artist">{song.artist}</div>
          </div>
          <button
            className="mini-play"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
          >
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
        </div>
      )}
      <nav className="tabs">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
