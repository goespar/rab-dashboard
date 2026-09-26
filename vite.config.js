import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'apps-script-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/api/apps-script', async (request, response) => {
            if (!env.APPS_SCRIPT_URL) {
              response.statusCode = 503
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({ ok: false, error: 'APPS_SCRIPT_URL belum diatur.' }))
              return
            }
            try {
              const incoming = new URL(request.url, 'http://localhost')
              const target = new URL(env.APPS_SCRIPT_URL)
              incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value))
              const body = request.method === 'POST'
                ? await new Promise((resolve, reject) => {
                    let raw = ''
                    request.on('data', (chunk) => { raw += chunk })
                    request.on('end', () => resolve(raw))
                    request.on('error', reject)
                  })
                : undefined
              const upstream = await fetch(target, {
                method: request.method,
                headers: request.method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
                body,
              })
              response.statusCode = upstream.status
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(await upstream.text())
            } catch (error) {
              response.statusCode = 502
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({ ok: false, error: error.message }))
            }
          })
        },
      },
    ],
  }
})
