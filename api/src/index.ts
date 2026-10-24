import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { admin } from './routes/admin'
import { adminManage } from './routes/admin-manage'
import { agent } from './routes/agent'
import { auth } from './routes/auth'
import { rooms } from './routes/rooms'
import { likes, me, plays } from './routes/library'
import { lyrics } from './routes/lyrics'
import { radio } from './routes/radio'
import { live } from './routes/live'
import { artists } from './routes/artists'
import { artistPages } from './routes/artist-pages'
import { playlists } from './routes/playlists'
import { requests } from './routes/requests'
import { songs, stream, thumbs } from './routes/songs'
import { wrapped } from './routes/wrapped'
import { youtube } from './routes/youtube'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowed = String(c.env.ALLOWED_ORIGIN).split(',').map((o: string) => o.trim())
      return allowed.includes(origin) ? origin : null
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-User', 'Range'],
    exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true, service: 'soundly-api' }))

// A runaway loop (a bug, a stuck tab) must never be able to burn the database's daily allowance: cap each caller.
const hits = new Map<string, { n: number; at: number }>()
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (/^\/api\/(stream|thumb|agent|live|auth)/.test(path)) return next()
  const key = `${c.req.header('CF-Connecting-IP') ?? 'local'}|${c.req.header('Cookie')?.slice(-40) ?? c.req.header('X-Dev-User') ?? ''}`
  const now = Date.now()
  const rec = hits.get(key)
  if (!rec || now - rec.at > 60000) {
    hits.set(key, { n: 1, at: now })
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.at > 60000) hits.delete(k)
  } else if (++rec.n > 240) {
    return c.json({ error: 'slow_down' }, 429)
  }
  return next()
})

app.route('/api/auth', auth)
app.route('/api/me', me)
app.route('/api/songs', songs)
app.route('/api/stream', stream)
app.route('/api/thumb', thumbs)
app.route('/api/likes', likes)
app.route('/api/plays', plays)
app.route('/api/playlists', playlists)
app.route('/api/requests', requests)
app.route('/api/youtube', youtube)
app.route('/api/wrapped', wrapped)
app.route('/api/rooms', rooms)
app.route('/api/lyrics', lyrics)
app.route('/api/radio', radio)
app.route('/api/live', live)
app.route('/api/artists', artistPages)
app.route('/api/admin/artists', artists)
app.route('/api/admin', admin)
app.route('/api/admin', adminManage)
app.route('/api/agent', agent)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  // D1's free tier stops serving after a day's row reads; it resumes at midnight UTC. Tell the app, so it can say so.
  if (/D1_ERROR/.test(String(err)) && /free tier|row read|limit/i.test(String(err))) {
    const now = new Date()
    const resumeAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
    return c.json({ error: 'maintenance', resumeAt }, 503)
  }
  return c.json({ error: 'internal_error' }, 500)
})

export { AgentHub } from './do/agent-hub'
export { Room } from './do/room'

export default app
