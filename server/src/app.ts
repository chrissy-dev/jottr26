import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import type { PageUpsert } from '../../lib/sync/backend.ts'
import type { Store } from './store.ts'

/** How someone proves who they are.
 *  - none: everyone who can reach the server is the owner. For localhost, or
 *    behind something that already checks, like Tailscale.
 *  - password: one password, set when the server starts. */
export type AuthMode = 'none' | 'password'

export interface AppOptions {
  store: Store
  auth: AuthMode
  password?: string
}

/** There is one account. Its id names the database on each device. */
export const OWNER = 'owner'

const COOKIE = 'jottr_session'
const YEAR_S = 365 * 24 * 60 * 60
/** How often an idle change stream sends something, so proxies that drop
 *  quiet connections leave it alone. */
const HEARTBEAT_MS = 25_000
/** Wrong passwords allowed per minute, from everyone together. One person's
 *  server does not need more, and it makes guessing slow. */
const FAILURES_PER_MINUTE = 10

type Env = { Variables: { userId: string } }

const hash = (value: string) => createHash('sha256').update(value).digest()

export function createApp({ store, auth, password }: AppOptions) {
  if (auth === 'password' && !password) throw new Error('auth "password" needs a password')

  const app = new Hono<Env>()
  const api = new Hono<Env>()
  let failures: number[] = []

  const userFor = (c: Context<Env>): string | null => {
    if (auth === 'none') return OWNER
    const token = getCookie(c, COOKIE)
    return token ? store.sessionUser(hash(token).toString('hex')) : null
  }

  // A write from another site has to be JSON, which a browser will only send
  // cross-origin after asking first, and this server never says yes. Together
  // with a SameSite cookie, that keeps other sites from acting as you.
  api.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'DELETE' && !c.req.header('content-type')?.startsWith('application/json')) {
      return c.json({ error: 'Expected JSON' }, 415)
    }
    await next()
  })

  api.get('/session', (c) => {
    const userId = userFor(c)
    return userId ? c.json({ user: { id: userId, email: null } }) : c.json({ error: 'Not signed in' }, 401)
  })

  api.post('/session', async (c) => {
    if (auth === 'none') return c.json({ user: { id: OWNER, email: null } })

    const now = Date.now()
    failures = failures.filter((at) => now - at < 60_000)
    if (failures.length >= FAILURES_PER_MINUTE) {
      return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
    }

    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown }
    const given = typeof body.password === 'string' ? body.password : ''
    // Hashed first so the comparison takes the same time whatever the length.
    if (!timingSafeEqual(hash(given), hash(password!))) {
      failures.push(now)
      return c.json({ error: 'That password is not right.' }, 401)
    }

    const token = randomBytes(32).toString('base64url')
    store.addSession(hash(token).toString('hex'), OWNER)
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api',
      maxAge: YEAR_S,
      secure: isHttps(c),
    })
    return c.json({ user: { id: OWNER, email: null } })
  })

  api.delete('/session', (c) => {
    const token = getCookie(c, COOKIE)
    if (token) store.removeSession(hash(token).toString('hex'))
    deleteCookie(c, COOKIE, { path: '/api' })
    return c.json({})
  })

  // Everything below needs a session.
  api.use('*', async (c, next) => {
    const userId = userFor(c)
    if (!userId) return c.json({ error: 'Signed out on the server. Sign in again.' }, 401)
    c.set('userId', userId)
    await next()
  })

  api.get('/pages', (c) => c.json({ rows: store.pagesSince(c.get('userId'), range(c)) }))

  api.get('/pages/live', (c) => c.json({ ids: store.livePageIds(c.get('userId')) }))

  api.put('/pages', async (c) => {
    const { rows } = (await c.req.json()) as { rows: PageUpsert[] }
    if (!Array.isArray(rows)) return c.json({ error: 'Expected rows' }, 400)
    return c.json({ rows: store.upsertPages(c.get('userId'), rows) })
  })

  api.post('/pages/purge', async (c) => {
    const { ids } = (await c.req.json()) as { ids: string[] }
    if (!Array.isArray(ids)) return c.json({ error: 'Expected ids' }, 400)
    store.purgePages(c.get('userId'), ids)
    return c.json({})
  })

  api.get('/docs', (c) => c.json({ rows: store.docVersionsSince(c.get('userId'), range(c)) }))

  api.post('/docs/fetch', async (c) => {
    const { ids } = (await c.req.json()) as { ids: string[] }
    if (!Array.isArray(ids)) return c.json({ error: 'Expected ids' }, 400)
    return c.json({ docs: store.fetchDocs(c.get('userId'), ids) })
  })

  api.put('/docs/:id', async (c) => {
    const { ydoc, base_version } = (await c.req.json()) as { ydoc: string; base_version: number }
    if (typeof ydoc !== 'string' || typeof base_version !== 'number') {
      return c.json({ error: 'Expected ydoc and base_version' }, 400)
    }
    return c.json(store.pushDoc(c.get('userId'), c.req.param('id'), ydoc, base_version))
  })

  /** Page rows as they are stamped, as hints to pull. Missing one costs
   *  nothing but a wait for the next poll. */
  api.get('/events', (c) => {
    const userId = c.get('userId')
    return streamSSE(c, async (stream) => {
      const stop = store.onChange((changedFor, changes) => {
        if (changedFor !== userId) return
        for (const change of changes) void stream.writeSSE({ data: JSON.stringify(change) })
      })
      stream.onAbort(stop)
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(HEARTBEAT_MS)
      }
      stop()
    })
  })

  app.route('/api/v1', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
  return app
}

function range(c: Context<Env>) {
  const after = c.req.query('after')
  return after !== undefined ? { after } : { since: c.req.query('since') ?? '' }
}

/** Direct, or through a proxy that says so. */
function isHttps(c: Context<Env>) {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
}
