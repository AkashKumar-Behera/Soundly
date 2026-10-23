import { ChevronLeft, ChevronRight, Clock, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { addHistory, removeHistory } from '../lib/searchHistory'
import { useHistory } from '../lib/useHistory'
import { useLibrary } from '../store/library'

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onSearch = location.pathname === '/search'
  const urlQuery = onSearch ? (params.get('q') ?? '') : ''
  const [value, setValue] = useState(urlQuery)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const history = useHistory()
  const mode = useLibrary((s) => s.mode)

  // Follow the URL (e.g. a category tile was clicked) unless the user is typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(urlQuery)
  }, [urlQuery])

  // Type-ahead: YouTube Music finishes half-typed names, so the full title is not needed.
  useEffect(() => {
    const q = value.trim()
    if (!focused || q.length < 2 || mode !== 'api') return setSuggestions([])
    let live = true
    const t = setTimeout(() => {
      api<{ suggestions: string[] }>(`/youtube/suggest?q=${encodeURIComponent(q)}`)
        .then((d) => live && setSuggestions(d.suggestions))
        .catch(() => live && setSuggestions([]))
    }, 140)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [value, focused, mode])

  const setQuery = (next: string) => {
    setValue(next)
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : '/search', { replace: onSearch })
  }

  const pick = (q: string) => {
    addHistory(q)
    setQuery(q)
    setFocused(false)
    inputRef.current?.blur()
  }

  const typed = value.trim().length >= 2
  const rows = typed
    ? suggestions.filter((s) => s.toLowerCase() !== value.trim().toLowerCase()).map((q) => ({ q, past: false }))
    : history.slice(0, 6).map((q) => ({ q, past: true }))

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
      <div className="search-wrap">
        <label className="search">
          <Search size={20} />
          <input
            ref={inputRef}
            value={value}
            placeholder="What do you want to play?"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setFocused(true)
              if (!onSearch) navigate('/search')
            }}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) pick(value.trim())
              if (e.key === 'Escape') inputRef.current?.blur()
            }}
          />
          {value && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={18} />
            </button>
          )}
        </label>
        {focused && rows.length > 0 && (
          <div className="suggest" role="listbox">
            {rows.map((r) => (
              <div key={`${r.past}-${r.q}`} className="suggest-row">
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.q)}>
                  {r.past ? <Clock size={16} /> : <Search size={16} />}
                  <span className="truncate">{r.q}</span>
                </button>
                {r.past && (
                  <button className="x" aria-label={`Remove ${r.q}`} onMouseDown={(e) => e.preventDefault()} onClick={() => removeHistory(r.q)}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
