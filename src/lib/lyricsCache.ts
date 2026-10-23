export interface LyricsData {
  found: boolean
  instrumental: boolean
  approx: boolean
  synced: { t: number; text: string }[] | null
  plain: string | null
  /** The signed-in user's own pasted version, visible only to them until an admin approves it. */
  mine?: boolean
  pending?: boolean
}

export const lyricsCache = new Map<string, LyricsData>()
