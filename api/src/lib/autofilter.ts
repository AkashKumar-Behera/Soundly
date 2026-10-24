import type { YtmTrack } from './ytm'

// Songs that were not released by the artist (fan edits, covers, remixes) or are not the normal studio version.
// They are never added automatically (radio, artist catalogues); a user can still request one by hand.
const UNOFFICIAL =
  /\b(lo-?fi|lofi|slowed|reverb|sped\s*up|speed\s*up|nightcore|8d|bass\s*boost(?:ed)?|remix|mashup|cover|karaoke|instrumental|acoustic\s*cover|unplugged\s*cover|jukebox|status|ringtone|reprise|flip|chillout|chill\s*mix|extended|live\s+(?:at|in|from|@)|whatsapp)\b/i

export const isOfficialLooking = (title: string): boolean => !UNOFFICIAL.test(title)

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** "Artist - Song (Official Audio)" and "Song" both reduce to "song". */
function titleKey(title: string, artist: string): string {
  const dash = title.split(/\s[-–—]\s/)
  const base = dash.length > 1 && norm(dash[0]) && (norm(artist).includes(norm(dash[0])) || norm(dash[0]).includes(norm(artist).slice(0, 5))) ? dash.slice(1).join(' ') : title
  return norm(base)
}

interface Known {
  key: string
  artist: string
}

async function libraryKeys(db: D1Database): Promise<Known[]> {
  const { results } = await db.prepare('SELECT s.title, COALESCE(a.name, \'\') AS artist FROM songs s LEFT JOIN artists a ON a.id = s.artist_id').all<{ title: string; artist: string }>()
  return results.map((r) => ({ key: titleKey(r.title, r.artist), artist: norm(r.artist) }))
}

/**
 * Keeps only tracks that are fine to add without anyone asking: no lofi/remix/cover style uploads, and nothing
 * whose title and artist are already in the library (or repeated in this batch), whatever the YouTube id.
 */
export async function autoAddable(db: D1Database, tracks: YtmTrack[]): Promise<YtmTrack[]> {
  const known = await libraryKeys(db)
  const out: YtmTrack[] = []
  for (const t of tracks) {
    if (!isOfficialLooking(t.title)) continue
    const key = titleKey(t.title, t.channel)
    const artist = norm(t.channel)
    const dup = known.some((k) => k.key === key && (!artist || !k.artist || k.artist.includes(artist.slice(0, 6)) || artist.includes(k.artist.slice(0, 6))))
    if (dup) continue
    known.push({ key, artist })
    out.push(t)
  }
  return out
}
