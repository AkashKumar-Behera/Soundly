# Soundly

A private, invite-only music streaming web app (PWA), inspired by the layout of Spotify. Built as a portfolio project.

> Educational project. Not affiliated with Spotify. Name, logo and artwork are original.

## Stack

- React 19, TypeScript, Vite
- Zustand (player and app state), React Router
- Motion for animation, Tailwind CSS (base) plus hand-written design tokens
- Backend (`api/`): Cloudflare Worker with Hono, D1 (SQLite) and R2, plus a planned home-laptop agent that fetches requested songs

## What works now

- Spotify-style shell: sidebar, top search, home shelves, bottom player bar, mobile tabs and mini player
- Real audio playback with queue, shuffle, repeat, seek, volume and Media Session controls
- Full-screen Now Playing with three screens (Classic, Immersive, Vinyl), lyrics and queue
- Themes: dark, light, system; interface styles: Classic and Blend
- Search with a "Request song" flow and a Requests page (role aware demo)
- Google sign-in, invite-only signup, sessions and roles (the login screen and admin invite manager)
- Connected to the API: songs, streaming, playlists, likes, play history, requests and admin approvals. If the API is not reachable the app falls back to bundled demo data

## Run

```bash
npm install
npm run dev            # frontend, http://127.0.0.1:5173
cd api && npm install && npm run db:reset && npm run dev   # API, http://127.0.0.1:8787
```

The Vite dev server proxies `/api` to the Worker on port 8787. Without the API the app runs on demo data. See [api/README.md](api/README.md) for the API, schema and deploy steps.

## Roadmap

1. UI and player (done)
2. Cloudflare Worker API, D1 schema, R2 storage (done: songs, Range streaming, playlists, likes, plays, requests and approvals, admin, agent endpoints)
3. Login (Google), invites, roles (done; add your Google client ID to switch it on)
4. Download queue and laptop agent
5. Admin panel and analytics
6. Social features, PWA polish, deploy
