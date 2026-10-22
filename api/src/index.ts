import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { admin } from './routes/admin'
import { agent } from './routes/agent'
import { likes, me, plays } from './routes/library'
import { playlists } from './routes/playlists'
import { requests } from './routes/requests'
import { songs, stream, thumbs } from './routes/songs'
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

app.route('/api/me', me)
app.route('/api/songs', songs)
app.route('/api/stream', stream)
app.route('/api/thumb', thumbs)
app.route('/api/likes', likes)
app.route('/api/plays', plays)
app.route('/api/playlists', playlists)
app.route('/api/requests', requests)
app.route('/api/admin', admin)
app.route('/api/agent', agent)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal_error' }, 500)
})

export default app
