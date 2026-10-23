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
app.route('/api/admin', admin)
app.route('/api/admin', adminManage)
app.route('/api/agent', agent)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal_error' }, 500)
})

export { AgentHub } from './do/agent-hub'
export { Room } from './do/room'

export default app
