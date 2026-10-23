// Names match src/sw.ts.
export const AUDIO_CACHE = 'soundly-audio'
export const API_CACHE = 'soundly-api'
export const THUMB_CACHE = 'soundly-thumbs'

export const cachesSupported = () => typeof caches !== 'undefined'

/** Removes everything personal stored on this device (library snapshot, covers, saved songs). Used on sign out. */
export async function clearDeviceData(): Promise<void> {
  if (!cachesSupported()) return
  await Promise.all([API_CACHE, THUMB_CACHE, AUDIO_CACHE].map((name) => caches.delete(name).catch(() => false)))
}
