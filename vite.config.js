import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import scopeBootstrapUtilities from './scripts/postcss-scope-bootstrap-utilities.js'

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
export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
  css: { postcss: { plugins: [scopeBootstrapUtilities()] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
