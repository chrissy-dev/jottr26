import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DocVersion,
  PageUpsert,
  PushResult,
  ServerDoc,
  ServerPage,
  SyncBackend,
} from './backend'

const PAGE_SIZE = 500

/** The sync backend as supabase/schema.sql sets it up: tables read through
 *  PostgREST under row level security, the two writes that need care done by
 *  RPC, and realtime on the pages table for hints. */
export class SupabaseBackend implements SyncBackend {
  private readonly supabase: SupabaseClient
  private readonly userId: string

  constructor(supabase: SupabaseClient, userId: string) {
    this.supabase = supabase
    this.userId = userId
  }

  async hasSession() {
    const { data } = await this.supabase.auth.getSession()
    return Boolean(data.session)
  }

  pagesSince(since: string, signal: AbortSignal) {
    return this.changedSince<ServerPage>('pages', '*', 'id', since, signal)
  }

  docVersionsSince(since: string, signal: AbortSignal) {
    return this.changedSince<DocVersion>('page_docs', 'page_id, version, updated_at', 'page_id', since, signal)
  }

  /** Every row of `table` stamped at or after `since`, oldest first, a page
   *  of rows at a time.
   *
   *  Keyset paging on (updated_at, id): with offsets, a row another device
   *  edits mid-scan moves to the end and shifts the rest left, so one row is
   *  never read, and the cursor then moves past it for good. The id breaks
   *  ties, since one transaction stamps every row it writes with the same
   *  time. */
  private async *changedSince<T extends { updated_at: string }>(
    table: string,
    columns: string,
    idColumn: keyof T & string,
    since: string,
    signal: AbortSignal,
  ): AsyncGenerator<T[]> {
    let last: T | null = null
    for (;;) {
      let query = this.supabase
        .from(table)
        .select(columns)
        .gte('updated_at', since)
        .order('updated_at', { ascending: true })
        .order(idColumn, { ascending: true })
      // The server's own timestamp string, which keeps the microseconds a
      // Date would round away.
      if (last) {
        const at = last.updated_at
        const id = String(last[idColumn])
        query = query.or(`updated_at.gt."${at}",and(updated_at.eq."${at}",${idColumn}.gt."${id}")`)
      }
      const { data, error } = await query.limit(PAGE_SIZE).abortSignal(signal)

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as T[]
      if (rows.length > 0) yield rows
      if (rows.length < PAGE_SIZE) return
      last = rows[rows.length - 1]
    }
  }

  async fetchDocs(pageIds: string[], signal: AbortSignal) {
    const { data, error } = await this.supabase
      .from('page_docs')
      .select('page_id, ydoc, version')
      .in('page_id', pageIds)
      .abortSignal(signal)

    if (error) throw new Error(error.message)
    return (data ?? []) as ServerDoc[]
  }

  async livePageIds(signal: AbortSignal) {
    // Keyset paging by id: unlike offsets, a row created or deleted by another
    // device mid-scan cannot shift a live id out of the pages being read, and
    // a missed id here would mean deleting a page that still exists.
    const ids = new Set<string>()
    let after = ''
    // How many the first fetch said there are. A later fetch sent as the anon
    // key, its token having expired in between, comes back empty and ends the
    // scan early, and this is how that is told from having read them all.
    let expected = 0
    for (;;) {
      // Tombstones are left out: a purged page is as gone as a missing one.
      let query = this.supabase
        .from('pages')
        .select('id', after ? undefined : { count: 'exact' })
        .is('purged_at', null)
        .order('id', { ascending: true })
      if (after) query = query.gt('id', after)
      const { data, error, count } = await query.limit(PAGE_SIZE).abortSignal(signal)

      if (error) throw new Error(error.message)
      if (!after) expected = count ?? 0
      const rows = (data ?? []) as Array<{ id: string }>
      if (rows.length === 0) break
      for (const row of rows) ids.add(row.id)
      after = rows[rows.length - 1].id
    }
    return { ids, expected }
  }

  async upsertPages(rows: PageUpsert[], signal: AbortSignal) {
    const { data, error } = await this.supabase
      .from('pages')
      .upsert(
        rows.map((row) => ({ ...row, user_id: this.userId })),
        { onConflict: 'id' },
      )
      .select('id, updated_at')
      .abortSignal(signal)

    if (error) throw new Error(error.message)
    return (data ?? []) as Array<{ id: string; updated_at: string }>
  }

  async purgePages(pageIds: string[], signal: AbortSignal) {
    const { error } = await this.supabase.rpc('purge_pages', { p_ids: pageIds }).abortSignal(signal)
    if (error) throw new Error(error.message)
  }

  async pushDoc(pageId: string, ydoc: string, baseVersion: number, signal: AbortSignal) {
    const { data, error } = await this.supabase
      .rpc('push_page_doc', {
        p_page_id: pageId,
        p_ydoc: ydoc,
        p_base_version: baseVersion,
      })
      .abortSignal(signal)

    if (error) throw new Error(error.message)

    // saved_at is absent from a server that has not had schema.sql re-run.
    const result = (data as PushResult[] | null)?.[0]
    if (!result) throw new Error('push_page_doc returned nothing')
    return result
  }

  watch(
    onChange: (row: { id?: unknown; updated_at?: unknown }) => void,
    onState: (up: boolean) => void,
  ) {
    let open = true
    // Only pages. A saved document stamps its page row on the server, so this
    // one small row stands in for the blob, which realtime would otherwise
    // carry in full, twice over, to every device on every save.
    const channel = this.supabase
      .channel(`jottr:${this.userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pages', filter: `user_id=eq.${this.userId}` },
        (event: { new?: { id?: unknown; updated_at?: unknown } }) => {
          if (open) onChange(event?.new ?? {})
        },
      )
    channel.subscribe((state) => {
      // A leftover callback from a channel since let go of.
      if (open) onState(state === 'SUBSCRIBED')
    })
    return () => {
      open = false
      void this.supabase.removeChannel(channel)
    }
  }
}
