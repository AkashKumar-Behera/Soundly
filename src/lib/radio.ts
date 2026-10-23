import { api, isDemo } from '../api/client'
import type { Song } from '../data/mock'
import { toSong, useLibrary } from '../store/library'
import { useApp } from '../store/app'
import { setQueueLowHook, usePlayer } from '../store/player'
import { useUi } from '../store/ui'

type ApiSong = Parameters<typeof toSong>[0]
interface RadioResponse {
  songs: ApiSong[]
  requested: number
}

const expanded = new Set<string>()

/**
 * Fills the queue with songs similar to `seed` (YouTube Music's radio). Songs already in the library are queued
 * straight away. Trusted users and admins also get up to 5 new ones queued for download, so the library grows
 * with what they listen to.
 */
export async function extendQueue(seed: Song, opts: { force?: boolean; quiet?: boolean } = {}): Promise<number> {
  if (isDemo() || useLibrary.getState().mode !== 'api') return 0
  if (!opts.force && expanded.has(seed.id)) return 0
  expanded.add(seed.id)
  try {
    const d = await api<RadioResponse>(`/radio/${seed.id}?download=1`)
    const player = usePlayer.getState()
    const have = new Set(player.queue.map((s) => s.id))
    const fresh = d.songs.map(toSong).filter((s) => !have.has(s.id)).slice(0, 12)
    if (fresh.length) usePlayer.setState({ queue: [...player.queue, ...fresh] })
    if (!opts.quiet || d.requested) {
      const bits: string[] = []
      if (fresh.length) bits.push(`${fresh.length} similar songs queued`)
      if (d.requested) bits.push(`${d.requested} new ones downloading`)
      if (bits.length) useUi.getState().showToast(bits.join(', '))
      else if (!opts.quiet) useUi.getState().showToast('No similar songs found yet')
    }
    return fresh.length
  } catch {
    expanded.delete(seed.id)
    return 0
  }
}

// When the queue is nearly empty, keep the music going with similar songs (Settings can turn this off).
setQueueLowHook((song) => {
  if (useApp.getState().autoplay) void extendQueue(song, { quiet: true })
})
