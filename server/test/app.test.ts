import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createApp, type AuthMode } from '../src/app.ts'
import { Store } from '../src/store.ts'

function setup(auth: AuthMode = 'none') {
  const store = new Store(':memory:')
  const app = createApp({ store, auth, password: 'hunter2' })
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(`http://jottr.test/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(cookie && { cookie }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = response.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    // Loosely typed: each test knows the shape it asked for.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (await response.json()) as Record<string, any> }
  }
  return { store, app, call }
}

const page = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  created_at: '2026-01-01T00:00:00.000Z',
  title: '',
  parent_id: null,
  sort_key: 'a0',
  is_favorite: false,
  deleted_at: null,
  ...fields,
})

describe('pages', () => {
  it('stamps every write later than the last, and pulls oldest first', async () => {
    const { call } = setup()
    const { body } = await call('PUT', '/pages', { rows: [page('a'), page('b'), page('c')] })
    const stamps = body.rows.map((row: { updated_at: string }) => row.updated_at)
    assert.deepEqual([...stamps].sort(), stamps)
    assert.equal(new Set(stamps).size, 3, 'no two writes share a stamp')

    const pulled = await call('GET', `/pages?since=${encodeURIComponent(stamps[1])}`)
    assert.deepEqual(pulled.body.rows.map((row: { id: string }) => row.id), ['b', 'c'])
    const after = await call('GET', `/pages?after=${encodeURIComponent(stamps[1])}`)
    assert.deepEqual(after.body.rows.map((row: { id: string }) => row.id), ['c'])
  })

  it('writes only the fields a push sends', async () => {
    const { call } = setup()
    await call('PUT', '/pages', { rows: [page('a', { title: 'Kept', sort_key: 'a5' })] })
    await call('PUT', '/pages', { rows: [{ id: 'a', created_at: '2026-01-01T00:00:00.000Z', is_favorite: true }] })
    const [row] = (await call('GET', '/pages?since=')).body.rows
    assert.equal(row.title, 'Kept')
    assert.equal(row.sort_key, 'a5')
    assert.equal(row.is_favorite, true)
  })

  it('keeps a page deleted for good dead, and tombstones ids it never had', async () => {
    const { call } = setup()
    await call('PUT', '/pages', { rows: [page('a', { title: 'Secret' })] })
    await call('POST', '/pages/purge', { ids: ['a', 'never-seen'] })

    const rewrite = await call('PUT', '/pages', { rows: [page('a', { title: 'Back again' })] })
    assert.deepEqual(rewrite.body.rows, [], 'a tombstone is skipped, not written')

    const rows = (await call('GET', '/pages?since=')).body.rows
    assert.deepEqual(
      rows.map((row: { id: string; purged_at: string | null; title: string }) => [row.id, Boolean(row.purged_at), row.title]),
      [
        ['a', true, ''],
        ['never-seen', true, ''],
      ],
    )
    assert.deepEqual((await call('GET', '/pages/live')).body.ids, [])
  })
})

describe('documents', () => {
  it('is a compare-and-swap on the version', async () => {
    const { call } = setup()
    await call('PUT', '/pages', { rows: [page('a')] })
    const before = (await call('GET', '/pages?since=')).body.rows[0].updated_at

    const first = (await call('PUT', '/docs/a', { ydoc: 'one', base_version: 0 })).body
    assert.equal(first.applied, true)
    assert.equal(first.version, 1)
    const touched = (await call('GET', '/pages?since=')).body.rows[0].updated_at
    assert.ok(touched > before, 'saving a document stamps its page')
    assert.equal(first.saved_at, touched)

    const stale = (await call('PUT', '/docs/a', { ydoc: 'lost', base_version: 0 })).body
    assert.deepEqual(stale, { ydoc: 'one', version: 1, applied: false, saved_at: null })

    const second = (await call('PUT', '/docs/a', { ydoc: 'two', base_version: 1 })).body
    assert.equal(second.version, 2)
    const docs = (await call('POST', '/docs/fetch', { ids: ['a', 'missing'] })).body.docs
    assert.deepEqual(docs, [{ page_id: 'a', ydoc: 'two', version: 2 }])
    const versions = (await call('GET', '/docs?since=')).body.rows
    assert.deepEqual(
      versions.map((row: { page_id: string; version: number }) => [row.page_id, row.version]),
      [['a', 2]],
    )
  })

  it('reports version 0 for a page it has no live row for', async () => {
    const { call } = setup()
    const none = (await call('PUT', '/docs/nowhere', { ydoc: 'x', base_version: 0 })).body
    assert.deepEqual(none, { ydoc: '', version: 0, applied: true, saved_at: null })

    await call('PUT', '/pages', { rows: [page('a')] })
    await call('PUT', '/docs/a', { ydoc: 'x', base_version: 0 })
    await call('POST', '/pages/purge', { ids: ['a'] })
    const purged = (await call('PUT', '/docs/a', { ydoc: 'x', base_version: 1 })).body
    assert.equal(purged.version, 0)
    assert.deepEqual((await call('POST', '/docs/fetch', { ids: ['a'] })).body.docs, [])
  })
})

describe('sign-in', () => {
  it('lets anyone in with auth none', async () => {
    const { call } = setup('none')
    assert.equal((await call('GET', '/session')).status, 200)
    assert.equal((await call('GET', '/pages?since=')).status, 200)
  })

  it('needs the password, and a sign-out ends the session', async () => {
    const { call } = setup('password')
    assert.equal((await call('GET', '/session')).status, 401)
    assert.equal((await call('GET', '/pages?since=')).status, 401)
    assert.equal((await call('POST', '/session', { password: 'wrong' })).status, 401)

    const signedIn = await call('POST', '/session', { password: 'hunter2' })
    assert.equal(signedIn.status, 200)
    assert.equal(signedIn.body.user.id, 'owner')
    assert.equal((await call('GET', '/pages?since=')).status, 200)

    await call('DELETE', '/session')
    assert.equal((await call('GET', '/pages?since=')).status, 401)
  })

  it('stops answering after too many wrong passwords', async () => {
    const { call } = setup('password')
    for (let i = 0; i < 10; i += 1) await call('POST', '/session', { password: 'wrong' })
    assert.equal((await call('POST', '/session', { password: 'hunter2' })).status, 429)
  })

  it('refuses a write that is not JSON', async () => {
    const { app } = setup()
    const response = await app.request('http://jottr.test/api/v1/pages/purge', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"ids":[]}',
    })
    assert.equal(response.status, 415)
  })
})

describe('change stream', () => {
  it('tells a listener about each page row written', async () => {
    const { app, call } = setup()
    const response = await app.request('http://jottr.test/api/v1/events')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const read = async () => decoder.decode((await reader.read()).value)

    assert.match(await read(), /event: ping/)
    const { body } = await call('PUT', '/pages', { rows: [page('a')] })
    const message = await read()
    assert.equal(JSON.parse(/data: (.*)/.exec(message)![1]).updated_at, body.rows[0].updated_at)
    await reader.cancel()
  })
})

describe('store', () => {
  it('carries on from the newest stamp on disk, whatever the clock says', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'jottr-')), 'jottr.db')
    const future = new Date(Date.now() + 60_000).toISOString()
    const first = new Store(path)
    first.db
      .prepare('insert into pages (user_id, id, created_at, updated_at) values (?, ?, ?, ?)')
      .run('owner', 'a', future, future)
    first.close()

    const reopened = new Store(path)
    const [written] = reopened.upsertPages('owner', [page('b')])
    assert.ok(written.updated_at > future)
    reopened.close()
  })
})
