import { Hono } from 'hono'
import { requireUser } from '../auth'
import type { AppEnv } from '../types'

export const wrapped = new Hono<AppEnv>()
wrapped.use('*', requireUser)

const RANGES = {
  year: "date(p.played_at) >= date('now', 'start of year')",
  '30d': "date(p.played_at) >= date('now', '-29 days')",
  all: '1 = 1',
} as const

type Range = keyof typeof RANGES

interface Persona {
  id: string
  title: string
  blurb: string
}

function longestStreak(days: string[]): { longest: number; current: number } {
  const sorted = [...new Set(days)].sort()
  let longest = 0
  let run = 0
  let prev = 0
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`)
    run = prev && t - prev === 86400000 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }
  // "Current" counts back from today (or yesterday, so a streak is not lost before the first play of the day).
  const set = new Set(sorted)
  let current = 0
  const cursor = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (!set.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  while (set.has(iso(cursor))) {
    current++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return { longest, current }
}

function persona(stats: { plays: number; uniqueSongs: number; byHour: number[]; topShare: number; bestDayMinutes: number }): Persona {
  const total = stats.byHour.reduce((a, b) => a + b, 0) || 1
  const share = (hours: number[]) => hours.reduce((n, h) => n + stats.byHour[h], 0) / total
  if (share([22, 23, 0, 1, 2, 3, 4]) > 0.35) return { id: 'night-owl', title: 'The Night Owl', blurb: 'Your best listening happens after dark.' }
  if (share([5, 6, 7, 8, 9]) > 0.3) return { id: 'early-bird', title: 'The Early Bird', blurb: 'You start the day with music.' }
  if (stats.bestDayMinutes >= 120) return { id: 'marathoner', title: 'The Marathoner', blurb: 'When you press play, you stay a while.' }
  if (stats.plays >= 10 && stats.topShare > 0.15) return { id: 'loyalist', title: 'The Loyalist', blurb: 'You know what you love and you play it again.' }
  if (stats.plays >= 10 && stats.uniqueSongs / stats.plays > 0.7) return { id: 'explorer', title: 'The Explorer', blurb: 'Always something new on your queue.' }
  return { id: 'steady', title: 'The Steady Listener', blurb: 'Music is part of your every day.' }
}

wrapped.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const range = (c.req.query('range') ?? 'year') as Range
  if (!(range in RANGES)) return c.json({ error: 'invalid_range' }, 400)
  const tz = Math.max(-840, Math.min(840, Math.round(Number(c.req.query('tz')) || 0)))
  const shift = `${tz >= 0 ? '+' : ''}${tz} minutes`
  const where = `p.user_id = ?1 AND ${RANGES[range]}`

  const [totals, topSongs, topArtists, hours, weekdays, days, since] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds, COUNT(DISTINCT p.song_id) AS songs FROM plays p WHERE ${where}`)
      .bind(user.id)
      .first<{ plays: number; seconds: number; songs: number }>(),
    db
      .prepare(
        `SELECT s.id, s.title, a.name AS artist, s.thumb_key IS NOT NULL AS hasThumb, COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds
         FROM plays p JOIN songs s ON s.id = p.song_id LEFT JOIN artists a ON a.id = s.artist_id
         WHERE ${where} GROUP BY s.id ORDER BY plays DESC, seconds DESC LIMIT 5`,
      )
      .bind(user.id)
      .all<{ id: string; title: string; artist: string | null; hasThumb: number; plays: number; seconds: number }>(),
    db
      .prepare(
        `SELECT a.name, COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds
         FROM plays p JOIN songs s ON s.id = p.song_id JOIN artists a ON a.id = s.artist_id
         WHERE ${where} GROUP BY a.id ORDER BY seconds DESC, plays DESC LIMIT 5`,
      )
      .bind(user.id)
      .all<{ name: string; plays: number; seconds: number }>(),
    db
      .prepare(`SELECT CAST(strftime('%H', datetime(p.played_at, ?2)) AS INTEGER) AS h, COUNT(*) AS n FROM plays p WHERE ${where} GROUP BY h`)
      .bind(user.id, shift)
      .all<{ h: number; n: number }>(),
    db
      .prepare(`SELECT CAST(strftime('%w', datetime(p.played_at, ?2)) AS INTEGER) AS d, COUNT(*) AS n FROM plays p WHERE ${where} GROUP BY d`)
      .bind(user.id, shift)
      .all<{ d: number; n: number }>(),
    db
      .prepare(`SELECT date(datetime(p.played_at, ?2)) AS day, COUNT(*) AS plays, COALESCE(SUM(p.seconds_listened), 0) AS seconds FROM plays p WHERE ${where} GROUP BY day`)
      .bind(user.id, shift)
      .all<{ day: string; plays: number; seconds: number }>(),
    db.prepare('SELECT MIN(played_at) AS first FROM plays WHERE user_id = ?').bind(user.id).first<{ first: string | null }>(),
  ])

  const plays = totals?.plays ?? 0
  if (!plays) return c.json({ empty: true, range })

  const byHour = Array.from({ length: 24 }, (_, h) => hours.results.find((r) => r.h === h)?.n ?? 0)
  const byWeekday = Array.from({ length: 7 }, (_, d) => weekdays.results.find((r) => r.d === d)?.n ?? 0)
  const bestDay = [...days.results].sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)[0]
  const streak = longestStreak(days.results.map((d) => d.day))
  const peakHour = byHour.indexOf(Math.max(...byHour))
  const topShare = (topSongs.results[0]?.plays ?? 0) / plays

  return c.json({
    empty: false,
    range,
    since: since?.first ?? null,
    totals: { plays, minutes: Math.round((totals?.seconds ?? 0) / 60), uniqueSongs: totals?.songs ?? 0, activeDays: days.results.length },
    topSongs: topSongs.results.map((s) => ({ ...s, hasThumb: !!s.hasThumb, minutes: Math.round(s.seconds / 60) })),
    topArtists: topArtists.results.map((a) => ({ ...a, minutes: Math.round(a.seconds / 60) })),
    byHour,
    byWeekday,
    peakHour,
    bestDay: bestDay ? { day: bestDay.day, plays: bestDay.plays, minutes: Math.round(bestDay.seconds / 60) } : null,
    streak,
    persona: persona({ plays, uniqueSongs: totals?.songs ?? 0, byHour, topShare, bestDayMinutes: bestDay ? Math.round(bestDay.seconds / 60) : 0 }),
  })
})
