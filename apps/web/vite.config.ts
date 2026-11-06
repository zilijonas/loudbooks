import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/loudbooks/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: base,
        name: 'Loud Books',
        short_name: 'Loud Books',
        description: 'Your books. Your pace.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#FBF4EA',
        theme_color: '#FBF4EA',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline: chunks, worker bundles (.js), WASM, fonts, SVG, icons.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024, // mediabunny + WASM
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true, // first install only controls the open page; updates still wait for the user (prompt mode)
      },
    }),
  ],
  worker: { format: 'es' },
})
