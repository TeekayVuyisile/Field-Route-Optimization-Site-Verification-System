import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Runs the Web-standard handlers in api/ (export GET/POST(request)) during
// `npm run dev`, mirroring how Vercel routes /api/* in production. Without
// this, plain Vite would serve index.html for /api requests.
const vercelApiDev = () => ({
  name: 'vercel-api-dev',
  configureServer(server) {
    // Server-only vars (e.g. ORS_API_KEY) from .env, without overriding the shell
    const env = loadEnv(server.config.mode, server.config.root, '')
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) process.env[key] = value
    }

    server.middlewares.use(async (req, res, next) => {
      const path = req.url.split('?')[0]
      if (!path.startsWith('/api/') || path.includes('/_')) return next()

      let mod
      try {
        mod = await server.ssrLoadModule(`${path}.js`)
      } catch {
        return next()
      }

      const handler = mod[req.method]
      if (!handler) {
        res.statusCode = 405
        return res.end()
      }

      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const hasBody = !['GET', 'HEAD'].includes(req.method)

      try {
        const response = await handler(new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: hasBody ? Buffer.concat(chunks) : undefined,
        }))
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (error) {
        server.config.logger.error(`[api] ${path}: ${error.stack}`)
        res.statusCode = 500
        res.end()
      }
    })
  },
})

// https://vite.dev/config/
// Installable, works offline. The service worker precaches the app shell;
// map tiles are cached as they're viewed (OSM's tile policy forbids bulk
// pre-downloading). Supabase and /api are never cached: data goes through
// the outbox. `prompt`: a new version waits for the user (UpdatePrompt), so
// the page never reloads by itself mid-drive.
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'RouteOps',
    short_name: 'RouteOps',
    description: 'Plan field routes, drive them turn by turn and verify every site.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F8FAFC',
    theme_color: '#2563EB',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    // SheetJS (425 kB) is only for Excel imports: cached on first use instead
    globIgnores: ['**/xlsx-*.js'],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => /^([abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname),
        handler: 'CacheFirst',
        options: {
          cacheName: 'osm-tiles',
          expiration: { maxEntries: 3000, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'fonts', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/xlsx-.*\.js$/.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'lazy-chunks', expiration: { maxEntries: 5 } },
      },
    ],
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev(), pwa],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // Tests never use the developer's .env: CI has none, and a test that

    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
