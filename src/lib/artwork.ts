import type { Song } from '../data/mock'

const cache = new Map<string, string>()

/** Generated cover (same look as <Cover>) as a data URL, for songs without a real thumbnail. */
function generatedCover(hue: number, hue2: number): string {
  const key = `${hue}-${hue2}`
  const hit = cache.get(key)
  if (hit) return hit

  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return ''

  const base = g.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, `hsl(${hue} 70% 45%)`)
  base.addColorStop(1, `hsl(${hue2} 75% 26%)`)
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  const glow = g.createRadialGradient(size * 0.2, size * 0.1, 0, size * 0.2, size * 0.1, size * 0.8)
  glow.addColorStop(0, `hsl(${hue} 85% 62%)`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, size, size)

  g.strokeStyle = 'rgba(255,255,255,0.28)'
  g.lineWidth = size * 0.09
  g.lineCap = 'round'
  for (const [x, y1, y2] of [[26, 42, 58], [38, 32, 68], [50, 24, 76], [62, 34, 66], [74, 43, 57]]) {
    g.beginPath()
    g.moveTo((x / 100) * size, (y1 / 100) * size)
    g.lineTo((x / 100) * size, (y2 / 100) * size)
    g.stroke()
  }

  const url = canvas.toDataURL('image/png')
  cache.set(key, url)
  return url
}

/** Artwork for the lock screen, notification shade and media keys. */
const squareCache = new Map<string, string>()

/** YouTube thumbnails are 16:9 with the cover in the middle; the lock screen letterboxes them, so crop to a square. */
export async function squareArtwork(thumbUrl: string): Promise<MediaImage[] | null> {
  try {
    let src = squareCache.get(thumbUrl)
    if (!src) {
      const img = new Image()
      img.src = thumbUrl
      await img.decode()
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const out = Math.min(512, side)
      const c = document.createElement('canvas')
      c.width = c.height = out
      c.getContext('2d')?.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
      src = c.toDataURL('image/jpeg', 0.9)
      squareCache.set(thumbUrl, src)
    }
    return [{ src, sizes: '512x512', type: 'image/jpeg' }]
  } catch {
    return null
  }
}

export function mediaArtwork(song: Song): MediaImage[] {
  if (song.thumbUrl) {
    const cached = squareCache.get(song.thumbUrl)
    if (cached) return [{ src: cached, sizes: '512x512', type: 'image/jpeg' }]
    return [{ src: new URL(song.thumbUrl, window.location.origin).href, sizes: '480x360', type: 'image/webp' }]
  }
  const src = generatedCover(song.hue, song.hue2)
  return src ? [{ src, sizes: '512x512', type: 'image/png' }] : []
}
