const KEY = 'soundly.search-history'
const MAX = 12

export function getHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* private mode: history just is not kept */
  }
  window.dispatchEvent(new Event('soundly:history'))
}

export function addHistory(q: string) {
  const term = q.trim()
  if (term.length < 2) return
  write([term, ...getHistory().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX))
}

export function removeHistory(q: string) {
  write(getHistory().filter((x) => x !== q))
}

export function clearHistory() {
  write([])
}
