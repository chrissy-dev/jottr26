import { mkdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp, type AuthMode } from './app.ts'
import { Store } from './store.ts'

/** Settings, all from the environment:
 *
 *  JOTTR_AUTH        password (the default) or none
 *  JOTTR_PASSWORD    the password, when JOTTR_AUTH is password
 *  JOTTR_DATA_DIR    where jottr.db lives (default ./data)
 *  JOTTR_STATIC_DIR  the app built with JOTTR_STATIC_EXPORT=1 (default ../out)
 *  PORT              default 8080 */
const auth = (process.env.JOTTR_AUTH ?? 'password') as AuthMode
if (auth !== 'none' && auth !== 'password') {
  console.error(`JOTTR_AUTH must be "password" or "none", not "${auth}"`)
  process.exit(1)
}
const password = process.env.JOTTR_PASSWORD
if (auth === 'password' && !password) {
  console.error('Set JOTTR_PASSWORD, or JOTTR_AUTH=none to run without one')
  process.exit(1)
}

const dataDir = resolve(process.env.JOTTR_DATA_DIR ?? 'data')
mkdirSync(dataDir, { recursive: true })
const store = new Store(join(dataDir, 'jottr.db'))

const app = createApp({ store, auth, password })

// serveStatic wants a root relative to the working directory.
const root = relative(process.cwd(), resolve(process.env.JOTTR_STATIC_DIR ?? '../out')) || '.'
const cacheFor = (path: string) =>
  // Named by their content, so a copy never goes stale.
  path.includes('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache'

app.use(
  '*',
  serveStatic({ root, onFound: (path, c) => c.header('cache-control', cacheFor(path)) }),
  // /app and /login are exported as app.html and login.html.
  serveStatic({
    root,
    rewriteRequestPath: (path) => `${path.replace(/\/$/, '')}.html`,
    onFound: (_path, c) => c.header('cache-control', 'no-cache'),
  }),
)
app.notFound((c) => c.text('Not found', 404))

const port = Number(process.env.PORT ?? 8080)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Jottr on http://localhost:${port} (auth: ${auth}, data: ${dataDir})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    store.close()
    process.exit(0)
  })
}
