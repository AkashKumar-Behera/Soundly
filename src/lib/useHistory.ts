import { useEffect, useState } from 'react'
import { getHistory } from './searchHistory'

export function useHistory(): string[] {
  const [list, setList] = useState(getHistory)
  useEffect(() => {
    const update = () => setList(getHistory())
    window.addEventListener('soundly:history', update)
    return () => window.removeEventListener('soundly:history', update)
  }, [])
  return list
}
