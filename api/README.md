# Soundly API

Cloudflare Worker (Hono) with D1 (SQLite) and R2 (audio and thumbnails).

## Run locally

Wrangler simulates D1 and R2 on your machine, so no Cloudflare account is needed for development.

```bash
npm install
npm run db:reset        # wipes local state, applies migrations, loads seed.sql
npm run dev             # http://127.0.0.1:8787
```

Audio lives in R2, not in the seed. Put any mp3 under the seeded keys to hear something:

```bash
npx wrangler r2 object put soundly-songs/songs/s1.mp3 --file=./some.mp3 --content-type audio/mpeg --local
```

`.dev.vars` (gitignored) holds `AGENT_TOKEN`, the shared secret for the laptop agent.

## Auth (Phase 2 stand-in)

With `DEV_AUTH=true` you act as a seeded user by sending `X-Dev-User: <email>`; no header means the admin.
Seeded users: `akashkumar48874@gmail.com` (admin), `trusted@example.com`, `member@example.com`.
`npm run deploy` forces `DEV_AUTH=false`, so a deployed Worker rejects everything until Phase 3 adds real sign-in.

## Endpoints

| Route | Who | What |
|---|---|---|
| `GET /api/health` | anyone | liveness |
| `GET /api/me` | user | profile, role, request limits, Pro status |
| `GET /api/songs?q=&limit=&offset=` | user | library search |
| `GET /api/stream/:id` | user | audio with HTTP Range (seeking) |
| `GET /api/thumb/:id` | user | cover art from R2 |
| `GET/PUT/DELETE /api/likes[/:songId]` | user | liked songs |
| `POST /api/plays`, `GET /api/plays/recent` | user | play history |
| `GET/POST /api/playlists`, `/:id`, `/:id/songs` | user | playlists |
| `POST/GET /api/requests` | member+ | request a YouTube song, list your requests |
| `GET /api/admin/requests`, `POST .../:id/approve\|reject\|retry` | admin | approval queue |
| `GET /api/admin/stats`, `GET/PATCH /api/admin/users`, `GET/POST /api/admin/invites` | admin | dashboard, users, invites |
| `POST /api/agent/heartbeat\|claim`, `PUT /api/agent/upload`, `POST /api/agent/jobs/:id/...` | agent token | laptop agent |

### Request rules

- Listeners cannot request. Daily limit per user (`daily_request_limit`).
- Already in the library returns `already_available`; already queued returns `already_requested`.
- Trusted users and admins go straight to `queued`; everyone else starts as `pending_approval`.
- Non-music (`category` not Music) or longer than `max_duration_sec` is flagged and always needs an admin.

### Job states

```
pending_approval -> queued -> downloading -> uploading -> done
        \-> rejected              \-> back to queued (up to 3 attempts) -> failed -> admin retry
```

## Deploy (when you are ready)

```bash
npx wrangler login
npx wrangler d1 create soundly            # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create soundly-songs
npm run db:migrate:remote
npx wrangler secret put AGENT_TOKEN
npm run deploy
```
