import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Shown on the home screen: "1.<deploy number>" from GitHub Actions, or "dev" for local builds. */
function appVersion() {
  const run = process.env.GITHUB_RUN_NUMBER
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!sha) {
    try { sha = execSync('git rev-parse --short HEAD').toString().trim() } catch { sha = '' }
  }
  return { version: run ? `1.${run}` : 'dev', sha, built: new Date().toISOString().slice(0, 10) }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // relative base so the build works from any host path (GitHub Pages subfolder, Cloudflare, LAN)
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Crawler Sheets',
        short_name: 'Crawler',
        description: 'Character sheet and tracker for the Dungeon Crawler Carl RPG (unofficial fan tool)',
        theme_color: '#0e1014',
        background_color: '#0e1014',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
