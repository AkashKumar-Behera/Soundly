import { useEffect, useRef } from 'react'
import { liveUrl } from '../api/client'

export type Topic = 'requests' | 'library' | 'agent' | 'lyrics' | 'artists' | 'users' | 'invites'
export type LiveEvent =
  | { type: 'progress'; jobId: string; stage: string; progress: number; etaSec: number | null; speedBps: number | null }
  | { type: 'job'; id: string; status: string; songId?: string | null; error?: string | null }
  | { type: 'hint'; topic: Topic }

const listeners = new Set<(e: LiveEvent) => void>()
let ws: WebSocket | null = null
let wanted = false
let delay = 2000
let retry: ReturnType<typeof setTimeout> | undefined
let everConnected = false

const dispatch = (e: LiveEvent) => listeners.forEach((l) => l(e))

function connect() {
  if (!wanted || (ws && ws.readyState <= WebSocket.OPEN)) return
  let socket: WebSocket
  try {
    socket = new WebSocket(liveUrl())
  } catch {
    return
  }
  ws = socket
  socket.onopen = () => {
    delay = 2000
    // Coming back after a gap: we may have missed changes, so every page refreshes once.
    if (everConnected) (['requests', 'library', 'agent', 'lyrics', 'artists', 'users'] as Topic[]).forEach((topic) => dispatch({ type: 'hint', topic }))
    everConnected = true
  }
  socket.onmessage = (m) => {
    try {
      dispatch(JSON.parse(String(m.data)) as LiveEvent)
    } catch {
      // ignore anything that is not ours
    }
  }
  socket.onclose = () => {
    if (ws === socket) ws = null
    if (!wanted) return
    clearTimeout(retry)
    retry = setTimeout(connect, delay)
    delay = Math.min(delay * 2, 60000)
  }
  socket.onerror = () => socket.close()
}

/** Opens the app's one live connection (changes and download progress are pushed over it; nothing polls). */
export function startLive() {
  if (wanted) return
  wanted = true
  connect()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && connect())
  window.addEventListener('online', connect)
}

export function stopLive() {
  wanted = false
  clearTimeout(retry)
  ws?.close()
  ws = null
}

export function useLive(handler: (e: LiveEvent) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const l = (e: LiveEvent) => ref.current(e)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
}

/** Runs `reload` once (after a short pause, so a burst of changes is one refresh) when something in `topics` changes. */
export function useLiveReload(topics: Topic[], reload: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const key = topics.join(',')
  useLive((e) => {
    if (e.type !== 'hint' || !key.split(',').includes(e.topic)) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!document.hidden) reload()
    }, 1500)
  })
  useEffect(() => () => clearTimeout(timer.current), [])
}

/** Subscribe outside React (the library store). */
export function onLive(l: (e: LiveEvent) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
