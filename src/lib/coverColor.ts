const cache = new Map<string, [number, number]>()

/** Two hues taken from the middle of the cover image, so the Now Playing glow follows the artwork. */
export async function coverHues(url: string): Promise<[number, number] | null> {
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const n = 24
    const c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, n, n)
    const px = g.getImageData(0, 0, n, n).data
    // Bucket saturated, mid-brightness pixels by hue; grey and near-black pixels carry no colour.
    const buckets = new Array<number>(12).fill(0)
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255
      const max = Math.max(r, gr, b), min = Math.min(r, gr, b), d = max - min
      if (d < 0.15 || max < 0.2) continue
      const h = max === r ? ((gr - b) / d + 6) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4
      buckets[Math.floor(h * 2) % 12] += d * max
    }
    const order = buckets.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0])
    if (!order[0][0]) return null
    const hue = (i: number) => i * 30 + 15
    const first = hue(order[0][1])
    const second = order[1][0] > order[0][0] * 0.35 ? hue(order[1][1]) : (first + 40) % 360
    const out: [number, number] = [first, second]
    cache.set(url, out)
    return out
  } catch {
    return null
  }
}
