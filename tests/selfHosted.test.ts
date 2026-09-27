import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import * as Y from 'yjs'
import { installBrowserGlobals } from './harness'

/** The sync engine against the real self-hosted server, over its HTTP API,
 *  with SQLite in memory. The engine's own behaviour is covered at length in
 *  sync.test.ts; this is that the server keeps the same promises.
 *
 *  Skipped until server/ has its packages: `npm install --prefix server`. */
const serverInstalled = existsSync(new URL('../server/node_modules/hono', import.meta.url))

installBrowserGlobals()

const { openDatabase, activeDatabase, closeDatabase } = await import('@/lib/db/dexie')
const { createPage, deleteForever, refreshDerived } = await import('@/lib/db/pages')
const { openDoc, releaseAll, readPlainText, whenPersisted, DOC_FIELD } = await import('@/lib/db/ydoc')
const { SyncEngine } = await import('@/lib/sync/engine')
const { SelfHostedBackend } = await import('@/lib/sync/selfHosted')

type Fetch = typeof fetch
type ServerApp = { request: (url: string, init?: RequestInit) => Promise<Response> }

/** The server, answering the requests a browser would send to its origin.
 *  Loaded by a path TypeScript does not follow, so the app's typecheck never
 *  needs the server's packages. */
async function startServer() {
  const serverDir = '../server/src/'
  const { Store } = await import(`${serverDir}store.ts`)
  const { createApp } = await import(`${serverDir}app.ts`)
  const app = createApp({ store: new Store(':memory:'), auth: 'none' }) as ServerApp
  globalThis.fetch = ((input: string, init?: RequestInit) =>
    app.request(new URL(input, 'http://jottr.test').href, init)) as Fetch
}

class Device {
  readonly engine: InstanceType<typeof SyncEngine>

  constructor(readonly name: string) {
    openDatabase(name)
    this.engine = new SyncEngine(new SelfHostedBackend(), name)
  }

  /** As in sync.test.ts: point the stores at this device, and put the engine
   *  in the state start() would, without a real tab's timers. */
  async focus() {
    releaseAll()
    openDatabase(this.name)
    Object.assign(this.engine as unknown as object, { db: activeDatabase(), isLeader: true, running: true })
  }

  async sync() {
    await this.focus()
    await this.engine.syncOnce()
    const status = this.engine.getStatus()
    assert.equal(status.error, null, `${this.name} failed to sync`)
  }

  async type(pageId: string, text: string) {
    await this.focus()
    const handle = await openDoc(pageId)
    const paragraph = handle.doc.getXmlFragment(DOC_FIELD).get(1) as Y.XmlElement
    handle.doc.transact(() => paragraph.insert(paragraph.length, [new Y.XmlText(text)]))
    await whenPersisted()
    await refreshDerived(pageId)
  }

  async text(pageId: string) {
    await this.focus()
    return readPlainText((await openDoc(pageId)).doc)
  }

  async page(pageId: string) {
    await this.focus()
    return activeDatabase()!.pages.get(pageId)
  }
}

describe('sync with the self-hosted server', { skip: !serverInstalled && 'server/ packages not installed' }, () => {
  after(() => {
    releaseAll()
    closeDatabase()
  })

  it('carries pages and their text between devices, and merges edits made on both', async () => {
    await startServer()
    const laptop = new Device('sh-laptop')
    const phone = new Device('sh-phone')

    await laptop.focus()
    const id = await createPage({ parentId: '' })
    await laptop.type(id, 'from the laptop')
    await laptop.sync()

    await phone.sync()
    assert.ok(await phone.page(id), 'the page reached the phone')
    assert.match(await phone.text(id), /from the laptop/)

    // Both edit before either hears from the other: the second push is
    // refused, merged and pushed again.
    await laptop.type(id, ' + laptop')
    await phone.type(id, ' + phone')
    await laptop.sync()
    await phone.sync()
    await laptop.sync()

    for (const device of [laptop, phone]) {
      const text = await device.text(id)
      assert.match(text, /\+ laptop/, `${device.name} kept the laptop's edit`)
      assert.match(text, /\+ phone/, `${device.name} kept the phone's edit`)
    }
  })

  it('deletes a page for good on every device', async () => {
    const laptop = new Device('sh-laptop')
    const phone = new Device('sh-phone')

    await laptop.focus()
    const id = await createPage({ parentId: '' })
    await laptop.sync()
    await phone.sync()
    assert.ok(await phone.page(id))

    await laptop.focus()
    await deleteForever(id)
    await laptop.sync()
    await phone.sync()
    assert.equal(await phone.page(id), undefined, 'gone from the phone')
    assert.equal(await laptop.page(id), undefined, 'gone from the laptop')
  })
})
