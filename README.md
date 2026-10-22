# Soundly

A private, invite-only music streaming web app (PWA), inspired by the layout of Spotify. Built as a portfolio project.

> Educational project. Not affiliated with Spotify. Name, logo and artwork are original.

## Stack

- React 19, TypeScript, Vite
- Zustand (player and app state), React Router
- Motion for animation, Tailwind CSS (base) plus hand-written design tokens
- Planned backend: Cloudflare Workers, D1 and R2, with a home-laptop agent that fetches requested songs

## What works now (Phase 1, mock data)

- Spotify-style shell: sidebar, top search, home shelves, bottom player bar, mobile tabs and mini player
- Real audio playback with queue, shuffle, repeat, seek, volume and Media Session controls
- Full-screen Now Playing with three screens (Classic, Immersive, Vinyl), lyrics and queue
- Themes: dark, light, system; interface styles: Classic and Blend
- Search with a "Request song" flow and a Requests page (role aware demo)
- Login screen (UI only)

## Run

```bash
npm install
npm run dev
```

## Roadmap

1. UI and player (done)
2. Cloudflare Worker API, D1 schema, R2 storage
3. Login (Google), invites, roles
4. Download queue and laptop agent
5. Admin panel and analytics
6. Social features, PWA polish, deploy
