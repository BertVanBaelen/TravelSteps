import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The server CSP only allows 'self' scripts, so register via an external file.
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TravelSteps',
        short_name: 'TravelSteps',
        description: "Reisblog met tijdlijn, kaart en foto's",
        lang: 'nl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#16a34a',
        background_color: '#f4f4f5',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Web Push handlers (push + notificationclick) live in public/push-sw.js.
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/api\/media\/[^/]+\/(thumbnail|preview)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'travelsteps-media',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/avatars/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'travelsteps-avatars',
              expiration: { maxEntries: 100 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin, request }) =>
              sameOrigin &&
              request.method === 'GET' &&
              /^\/api\/(posts|travels|library)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'travelsteps-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'travelsteps-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet'],
          dexie: ['dexie'],
          editor: [
            '@tiptap/starter-kit',
            '@tiptap/markdown',
            '@tiptap/extensions',
            '@tiptap/core',
            '@tiptap/pm/state',
            '@tiptap/pm/view',
            '@tiptap/pm/model',
          ],
        },
      },
    },
  },
});
