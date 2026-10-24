import type { Song } from '../data/mock'

/** Marks songs stored as AAC (the better-quality version). */
export function AacBadge({ song }: { song: Pick<Song, 'aac'> }) {
  if (!song.aac) return null
  return (
    <span className="aac-badge" title="AAC audio, higher quality">
      AAC
    </span>
  )
}
