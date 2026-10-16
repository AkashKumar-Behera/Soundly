import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onSearch = location.pathname === '/search'
  const urlQuery = onSearch ? (params.get('q') ?? '') : ''
  const [value, setValue] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the URL (e.g. a category tile was clicked) unless the user is typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(urlQuery)
  }, [urlQuery])

  const setQuery = (next: string) => {
    setValue(next)
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : '/search', { replace: onSearch })
  }

  return (
    <header className="topbar">
      <div className="nav-arrows">
        <button className="icon-btn dark" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
        <button className="icon-btn dark" aria-label="Forward" onClick={() => navigate(1)}>
          <ChevronRight size={22} />
        </button>
      </div>
      <label className="search">
        <Search size={20} />
        <input
          ref={inputRef}
          value={value}
          placeholder="What do you want to play?"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => !onSearch && navigate('/search')}
        />
        {value && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
            <X size={18} />
          </button>
        )}
      </label>
    </header>
  )
}
