import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/sw.ts): offline app shell, offline library and saved audio with Range support.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'], globIgnores: ['**/privacy.html'] },
      manifest: {
        name: 'Soundly',
        short_name: 'Soundly',
        description: 'Private music for friends. Invite only.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0A0A0B',
        theme_color: '#0A0A0B',
        categories: ['music', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Search', url: '/search', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Your Library', url: '/library', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  server: {
    // Same-origin API in dev, so cookies work later and CORS never gets in the way.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
})
