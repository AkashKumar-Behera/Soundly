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

## Auth

Google sign-in (OAuth code flow with PKCE and a `state` check) creates a server-side session. The browser only holds an
opaque, HttpOnly, SameSite=Lax cookie; D1 stores its SHA-256, so a database leak does not expose live sessions.

- **Invite only.** A new Google account can join only with an unused, unexpired invite code, and only while the user
  count is below `max_users` (30). Existing accounts, including the seeded owner, sign in by email with no invite.
- **Invites** are one-time, 8 characters, 7 days, created by an admin (`POST /api/admin/invites` or Settings > Invites).
- **CSRF.** Cookie-authenticated writes must send an allowed `Origin` (the app itself), otherwise `403 bad_origin`.
- **Disabled users** are rejected immediately, including on existing sessions.
- **Local dev.** With `DEV_AUTH=true` you can act as a seeded user via `X-Dev-User`, or sign in through
  `POST /api/auth/dev-login` (the login page shows a dev form). Production forces `DEV_AUTH=false`, which also
  removes `dev-login` (404). Seeded users: `akashkumar48874@gmail.com` (admin), `trusted@`, `member@`, `listener@example.com`.

### Google setup (one time)

1. Google Cloud Console > create a project > **APIs & Services > OAuth consent screen**: External, app name Soundly,
   your email, scopes `openid`, `email`, `profile` only. Then **Publish app** (basic scopes need no verification).
2. **Credentials > Create credentials > OAuth client ID > Web application**.
   - Authorized JavaScript origins: `https://soundly-api.akashkumar48874.workers.dev` and `http://127.0.0.1:5173`
   - Authorized redirect URIs: `https://soundly-api.akashkumar48874.workers.dev/api/auth/google/callback` and
     `http://127.0.0.1:5173/api/auth/google/callback`
3. Put the **client ID** (public) in `wrangler.jsonc` under `vars.GOOGLE_CLIENT_ID`.
4. Store the **client secret** as a Wrangler secret (it never goes in a file): `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
   For local testing add `GOOGLE_CLIENT_SECRET=...` to `api/.dev.vars` (gitignored).
5. `npm run deploy`.

## Endpoints

| Route | Who | What |
|---|---|---|
| `GET /api/health` | anyone | liveness |
| `GET /api/auth/google/start`, `/callback` | anyone | Google sign-in |
| `GET /api/auth/invite/:code` | anyone | is this invite usable? |
| `POST /api/auth/logout` | user | end the session |
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

## Deployed

Live Worker: `https://soundly-api.akashkumar48874.workers.dev` (Cloudflare account akashkumar48874).

| Resource | Name |
|---|---|
| Worker | `soundly-api` |
| D1 database | `soundly` (schema applied, only the owner account and settings seeded: `seed.prod.sql`) |
| R2 bucket | `soundly-songs` |
| Secret | `AGENT_TOKEN` (also saved locally in `.prod-agent-token`, which is gitignored) |

The same Worker also serves the built frontend (`../dist`) from static assets, so the app and API share one origin and
cookies are first-party. Only `/api/*` runs Worker code. Production runs with `DEV_AUTH=false`. The agent routes work
with the bearer token. Existing buckets in the account (`r2bucket`, `saajcraft`) are not used.

Redeploy after changes:

```bash
npm run deploy                         # builds the frontend, forces DEV_AUTH=false
npm run db:migrate:remote              # when you add a migration
npx wrangler d1 execute soundly --remote --file=./seed.prod.sql
```

