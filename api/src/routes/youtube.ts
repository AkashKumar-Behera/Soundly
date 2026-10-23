import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'

export const youtube = new Hono<AppEnv>()
youtube.use('*', requireUser)

// YouTube Data API v3: search.list costs 100 quota units and videos.list 1, against 10,000 free units a day.
// Cached for a day, capped per user, and capped overall so one busy evening cannot burn the whole quota.
const PER_USER_DAILY = 20
const GLOBAL_DAILY = 90

const CATEGORIES: Record<string, string> = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals', '17': 'Sports', '19': 'Travel & Events',
  '20': 'Gaming', '22': 'People & Blogs', '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style',
  '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism',
}

interface Result {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  category: string
  thumbnail: string
}

export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

class QuotaError extends Error {}

async function fetchResults(key: string, q: string): Promise<Result[]> {
  const search = new URL('https://www.googleapis.com/youtube/v3/search')
  search.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', safeSearch: 'none', q, key }).toString()
  const sres = await fetch(search)
  if (!sres.ok) {
    const body = (await sres.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } }
    if (body.error?.errors?.some((e) => e.reason === 'quotaExceeded' || e.reason === 'rateLimitExceeded')) throw new QuotaError()
    throw new Error(`youtube search ${sres.status}`)
  }
  const sdata = (await sres.json()) as { items?: { id?: { videoId?: string } }[] }
  const ids = (sdata.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x)
  if (!ids.length) return []

  const videos = new URL('https://www.googleapis.com/youtube/v3/videos')
  videos.search = new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), key }).toString()
  const vres = await fetch(videos)
  if (!vres.ok) throw new Error(`youtube videos ${vres.status}`)
  const vdata = (await vres.json()) as {
    items?: {
      id: string
      snippet: { title: string; channelTitle: string; categoryId?: string; liveBroadcastContent?: string; thumbnails?: Record<string, { url: string }> }
      contentDetails: { duration: string }
    }[]
  }

  const byId = new Map((vdata.items ?? []).map((v) => [v.id, v]))
  const out: Result[] = []
  for (const id of ids) {
    const v = byId.get(id)
    if (!v || (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none')) continue
    const t = v.snippet.thumbnails ?? {}
    out.push({
      youtubeId: id,
      title: decode(v.snippet.title),
      channel: decode(v.snippet.channelTitle),
      durationSec: parseIsoDuration(v.contentDetails.duration),
      category: CATEGORIES[v.snippet.categoryId ?? ''] ?? 'Other',
      thumbnail: (t.medium ?? t.high ?? t.default)?.url ?? '',
    })
  }
  return out
}

youtube.get('/search', async (c) => {
  const user = c.get('user')
  if (user.role === 'listener') return c.json({ error: 'forbidden' }, 403)
  if (!c.env.YOUTUBE_API_KEY) return c.json({ error: 'youtube_not_configured' }, 503)

  const q = (c.req.query('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return c.json({ error: 'query_too_short' }, 400)
  const cacheKey = q.toLowerCase()
  const db = c.env.DB

  let results: Result[] | null = null
  const cached = await db
    .prepare("SELECT results FROM yt_cache WHERE q = ? AND created_at > datetime('now', '-1 day')")
    .bind(cacheKey)
    .first<{ results: string }>()
  if (cached) results = JSON.parse(cached.results) as Result[]

  if (!results) {
    const [mine, all] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE user_id = ? AND created_at >= date('now')").bind(user.id).first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE created_at >= date('now')").first<{ n: number }>(),
    ])
    if ((mine?.n ?? 0) >= PER_USER_DAILY) return c.json({ error: 'search_limit', limit: PER_USER_DAILY }, 429)
    if ((all?.n ?? 0) >= GLOBAL_DAILY) return c.json({ error: 'search_quota' }, 429)

    try {
      results = await fetchResults(c.env.YOUTUBE_API_KEY, q)
    } catch (e) {
      if (e instanceof QuotaError) return c.json({ error: 'search_quota' }, 429)
      console.error(e)
      return c.json({ error: 'youtube_error' }, 502)
    }
    await db.batch([
      db.prepare('INSERT INTO yt_searches (user_id, q) VALUES (?, ?)').bind(user.id, cacheKey),
      db.prepare("INSERT INTO yt_cache (q, results, created_at) VALUES (?, ?, datetime('now')) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = datetime('now')").bind(
        cacheKey,
        JSON.stringify(results),
      ),
    ])
  }

  // Mark what is already in the library or already requested, so the UI never offers a pointless download.
  const ids = results.map((r) => r.youtubeId)
  const marks = ids.map(() => '?').join(',')
  const [have, active] = ids.length
    ? await Promise.all([
        db.prepare(`SELECT youtube_id AS yid, id FROM songs WHERE youtube_id IN (${marks})`).bind(...ids).all<{ yid: string; id: string }>(),
        db
          .prepare(`SELECT youtube_id AS yid, status FROM download_jobs WHERE youtube_id IN (${marks}) AND status IN ('pending_approval','queued','downloading','uploading')`)
          .bind(...ids)
          .all<{ yid: string; status: string }>(),
      ])
    : [{ results: [] }, { results: [] }]
  const haveMap = new Map(have.results.map((r) => [r.yid, r.id]))
  const activeMap = new Map(active.results.map((r) => [r.yid, r.status]))

  return c.json({
    query: q,
    results: results.map((r) => ({ ...r, songId: haveMap.get(r.youtubeId) ?? null, requestStatus: activeMap.get(r.youtubeId) ?? null })),
  })
})
