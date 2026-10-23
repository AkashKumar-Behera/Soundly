import { Hono } from 'hono'
import { canRequestDirect, requireUser } from '../auth'
import { autoAddable } from '../lib/autofilter'
import { createJob } from '../lib/jobs'
import { wakeAgent } from '../lib/wake'
import { ytmRadio } from '../lib/ytm'
import type { AppEnv } from '../types'
import { SONG_SELECT, shapeSong } from './songs'
import type { SongRow } from './songs'
import { annotate } from './youtube'

export const radio = new Hono<AppEnv>()
radio.use('*', requireUser)

const MAX_DOWNLOADS = 5
const SEEDS_PER_USER_DAILY = 12

/**
 * Songs similar to one in the library (YouTube Music's radio for it). Songs we already have come back playable.
 * With ?download=1, trusted users and admins also queue up to 5 of the missing ones, so the queue fills itself
 * with new music over time. Each seed song is only expanded once a day per user.
 */
radio.get('/:songId', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const song = await db.prepare('SELECT youtube_id AS yid FROM songs WHERE id = ?').bind(c.req.param('songId')).first<{ yid: string | null }>()
  if (!song?.yid) return c.json({ items: [], requested: 0 })

  let tracks
  try {
    const hit = await db.prepare("SELECT results FROM yt_cache WHERE q = ? AND created_at > datetime('now', '-6 hours')").bind(`radio:${song.yid}`).first<{ results: string }>()
    if (hit) tracks = JSON.parse(hit.results)
    else {
      tracks = await ytmRadio(song.yid, 30)
      await db
        .prepare("INSERT INTO yt_cache (q, results, created_at) VALUES (?, ?, datetime('now')) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = datetime('now')")
        .bind(`radio:${song.yid}`, JSON.stringify(tracks))
        .run()
    }
  } catch (e) {
    console.error('ytm radio failed', e)
    return c.json({ items: [], requested: 0 })
  }

  const items = await annotate(db, tracks)

  let requested = 0
  if (c.req.query('download') === '1' && canRequestDirect(user)) {
    const key = `rd:${song.yid}`
    const done = await db.prepare("SELECT 1 AS ok FROM yt_searches WHERE user_id = ? AND q = ? AND created_at >= date('now')").bind(user.id, key).first()
    const seeds = await db.prepare("SELECT COUNT(*) AS n FROM yt_searches WHERE user_id = ? AND q LIKE 'rd:%' AND created_at >= date('now')").bind(user.id).first<{ n: number }>()
    if (!done && (seeds?.n ?? 0) < SEEDS_PER_USER_DAILY) {
      await db.prepare('INSERT INTO yt_searches (user_id, q) VALUES (?, ?)').bind(user.id, key).run()
      const allowed = new Set((await autoAddable(db, items.filter((i) => !i.songId && !i.requestStatus))).map((t) => t.youtubeId))
      for (const it of items) {
        if (requested >= MAX_DOWNLOADS) break
        if (it.songId || it.requestStatus || !allowed.has(it.youtubeId)) continue
        const r = await createJob(db, user, { youtubeId: it.youtubeId, title: it.title, channel: it.channel, durationSec: it.durationSec, category: it.category }, { skipDailyLimit: true })
        if (r.ok) {
          requested += 1
          it.requestStatus = r.status
        }
      }
      if (requested) wakeAgent(c.env, c.executionCtx)
    }
  }

  // Full song records for the ones already in the library, so the client can queue them without another lookup.
  const ids = items.map((i) => i.songId).filter((x): x is string => !!x)
  let songs: ReturnType<typeof shapeSong>[] = []
  if (ids.length) {
    const marks = ids.map((_, i) => `?${i + 2}`).join(',')
    const { results } = await db.prepare(`${SONG_SELECT} WHERE s.id IN (${marks})`).bind(user.id, ...ids).all<SongRow>()
    songs = results.map(shapeSong)
  }

  return c.json({ items, songs, requested })
})
