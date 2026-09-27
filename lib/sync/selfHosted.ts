import { API, api } from '@/lib/selfHosted'
import type {
  DocVersion,
  PageUpsert,
  PushResult,
  ServerDoc,
  ServerPage,
  SyncBackend,
} from './backend'

const PAGE_SIZE = 500

/** The sync backend for the server in server/. */
export class SelfHostedBackend implements SyncBackend {
  /** Always true. Signed out on the server, every call fails with a 401,
   *  rather than answering with nothing as Supabase's anon key does, so no
   *  read can be mistaken for an empty account. */
  async hasSession() {
    return true
  }

  pagesSince(since: string, signal: AbortSignal) {
    return this.changedSince<ServerPage>('/pages', since, signal)
  }

  docVersionsSince(since: string, signal: AbortSignal) {
    return this.changedSince<DocVersion>('/docs', since, signal)
  }

  /** Rows stamped at or after `since`, then after the last one read. The
   *  server never gives two writes the same stamp, so the stamp alone says
   *  where to carry on from. */
  private async *changedSince<T extends { updated_at: string }>(
    path: string,
    since: string,
    signal: AbortSignal,
  ): AsyncGenerator<T[]> {
    let from = `since=${encodeURIComponent(since)}`
    for (;;) {
      const { rows } = await api<{ rows: T[] }>('GET', `${path}?${from}&limit=${PAGE_SIZE}`, { signal })
      if (rows.length > 0) yield rows
      if (rows.length < PAGE_SIZE) return
      from = `after=${encodeURIComponent(rows[rows.length - 1].updated_at)}`
    }
  }

  async fetchDocs(pageIds: string[], signal: AbortSignal) {
    const { docs } = await api<{ docs: ServerDoc[] }>('POST', '/docs/fetch', { body: { ids: pageIds }, signal })
    return docs
  }

  async livePageIds(signal: AbortSignal) {
    const { ids } = await api<{ ids: string[] }>('GET', '/pages/live', { signal })
    return { ids: new Set(ids), expected: ids.length }
  }

  async upsertPages(rows: PageUpsert[], signal: AbortSignal) {
    const result = await api<{ rows: Array<{ id: string; updated_at: string }> }>('PUT', '/pages', {
      body: { rows },
      signal,
    })
    return result.rows
  }

  async purgePages(pageIds: string[], signal: AbortSignal) {
    await api('POST', '/pages/purge', { body: { ids: pageIds }, signal })
  }

  pushDoc(pageId: string, ydoc: string, baseVersion: number, signal: AbortSignal) {
    return api<PushResult>('PUT', `/docs/${encodeURIComponent(pageId)}`, {
      body: { ydoc, base_version: baseVersion },
      signal,
    })
  }

  watch(
    onChange: (row: { id?: unknown; updated_at?: unknown }) => void,
    onState: (up: boolean) => void,
  ) {
    if (typeof EventSource === 'undefined') return () => {}
    // Reconnects on its own after an error; each reconnect is an open again.
    const source = new EventSource(`${API}/events`)
    source.onopen = () => onState(true)
    source.onerror = () => onState(false)
    source.onmessage = (event: MessageEvent<string>) => {
      try {
        onChange(JSON.parse(event.data))
      } catch {
        // A hint that cannot be read is a hint missed; the poll covers it.
      }
    }
    return () => source.close()
  }
}
