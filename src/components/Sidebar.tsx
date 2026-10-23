import { Crown, Heart, House, Inbox, Library, Plus, Search, Settings, ShieldCheck } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useLibrary, useRole } from '../store/library'
import { Cover } from './Cover'
import { Logo } from './Logo'

const nav = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const navigate = useNavigate()
  const likedCount = useLibrary((s) => s.liked.length)
  const playlists = useLibrary((s) => s.playlists)
  const isPro = useLibrary((s) => !!s.me?.isPro)
  const role = useRole()
  const name = useLibrary((s) => s.me?.name ?? 'Akash')

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={34} />
        <span>Soundly</span>
      </div>

      <nav className="nav">
        {(role === 'admin' ? [...nav, { to: '/admin', label: 'Admin', icon: ShieldCheck, end: false }] : nav).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="lib-head">
        <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Library size={22} />
          Your Library
        </NavLink>
        <button className="icon-btn" aria-label="Create playlist" onClick={() => navigate('/library')}>
          <Plus size={20} />
        </button>
      </div>

      <div className="lib-list">
        <NavLink to="/playlist/liked" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
          <div className="liked-art">
            <Heart size={20} fill="currentColor" />
          </div>
          <div className="min0">
            <div className="truncate">Liked Songs</div>
            <div className="sub truncate">Playlist · {likedCount} songs</div>
          </div>
        </NavLink>
        {playlists.map((p) => (
          <NavLink key={p.id} to={`/playlist/${p.id}`} className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
            <Cover hue={p.hue} size={48} className="r8" />
            <div className="min0">
              <div className="truncate">{p.title}</div>
              <div className="sub truncate">Playlist · {p.songCount} songs</div>
            </div>
          </NavLink>
        ))}
      </div>

      <div className="sb-foot">
        <div className="avatar">A</div>
        <div className="min0">
          <div className="truncate">{name}</div>
          <div className="sub truncate">{role}</div>
        </div>
        {(isPro || role === 'trusted' || role === 'admin') && (
          <span className="pro">
            <Crown size={12} /> PRO
          </span>
        )}
      </div>
    </aside>
  )
}
