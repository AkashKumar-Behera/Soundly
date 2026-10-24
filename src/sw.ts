/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { createPartialResponse } from 'workbox-range-requests'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// Cache names are shared with src/lib/deviceCache.ts (logout clears them).
const AUDIO_CACHE = 'soundly-audio'
const API_CACHE = 'soundly-api'
const THUMB_CACHE = 'soundly-thumbs'

/**
 * Cache migration. A new app version replaces the app shell, but what the user saved on this device (songs, covers)
 * is carried over untouched. Only the API snapshot is rebuilt when its shape changed. Bump CACHE_SCHEMA and add a step.
 */
const CACHE_SCHEMA = 2
async function migrateCaches() {
  try {
    const meta = await caches.open('soundly-meta')
    const stored = Number((await (await meta.match('/schema'))?.text()) ?? 0)
    if (stored >= CACHE_SCHEMA) return
    if (stored < 2) await caches.delete(API_CACHE) // v2: songs gained the "aac" flag, so old library snapshots are stale
    await meta.put('/schema', new Response(String(CACHE_SCHEMA)))
  } catch {
    // never block an update on housekeeping
  }
}
self.addEventListener('activate', (event) => event.waitUntil(migrateCaches()))

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

// A new version waits until the user taps "Reload", so an update never interrupts the music.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// Single-page app: any page URL opens the cached shell, even offline. APIs and the static privacy page are excluded.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/privacy/] }))

// Songs saved for offline listening are served from the audio cache, including Range requests (seeking).
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/stream/'),
  async ({ request }) => {
    const cache = await caches.open(AUDIO_CACHE)
    const cached = await cache.match(request.url, { ignoreSearch: true })
    if (cached) return request.headers.has('range') ? createPartialResponse(request, cached) : cached
    return fetch(request)
  },
)

// Covers: show instantly, refresh in the background.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/thumb/'),
  new StaleWhileRevalidate({ cacheName: THUMB_CACHE, plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 86400 })] }),
)

// The library (songs, playlists, likes, your profile) so the app opens offline with what you saw last.
// Admin, auth, YouTube search and the agent are never cached. Only successful responses are kept.
const SKIP_API = /^\/api\/(admin|auth|agent|youtube|stream|thumb|health|live)(\/|$)/
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/') && !SKIP_API.test(url.pathname),
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * 86400 })],
  }),
)
