/** What the sync engine needs from a server. Supabase is one (see
 *  ./supabase.ts); anything that keeps these promises can stand in for it.
 *
 *  The promises that matter:
 *  - The server stamps `updated_at` itself, on every write, and a pull by
 *    `updated_at` returns rows oldest first. The engine re-reads a window
 *    behind its cursor, so a stamp taken just before a pull but committed
 *    after it is still seen.
 *  - Page rows are last-writer-wins, and an upsert writes only the fields it
 *    is given.
 *  - A document is written only by `pushDoc`, as a compare-and-swap on its
 *    version. Saving one stamps its page row, so watching pages is enough.
 *  - A page deleted for good leaves a tombstone row (`purged_at` set) that
 *    never comes back to life, so every device's next pull hears about it.
 *
 *  Timestamps are ISO strings exactly as the server wrote them: the engine
 *  hands them back to the server, and parsing them would lose precision. */

export interface ServerPage {
  id: string
  title: string
  parent_id: string | null
  sort_key: string
  is_favorite: boolean
  deleted_at: string | null
  purged_at?: string | null
  created_at: string
  updated_at: string
}

/** A page row as a push sends it: the id, and only the fields that changed. */
export interface PageUpsert {
  id: string
  created_at: string
  title?: string
  parent_id?: string | null
  sort_key?: string
  is_favorite?: boolean
  deleted_at?: string | null
}

export interface DocVersion {
  page_id: string
  version: number
  updated_at: string
}

export interface ServerDoc {
  page_id: string
  /** Base64 of Y.encodeStateAsUpdate. */
  ydoc: string
  version: number
}

/** How a compare-and-swap push went.
 *
 *  - applied, version > 0: written. `saved_at` is the stamp it left on the
 *    page row, when the server can say, so the echo can be recognised.
 *  - applied, version 0: there is no live page to write it into.
 *  - not applied: the server has moved on. `ydoc` and `version` are what it
 *    holds now, to merge and push again at. */
export interface PushResult {
  applied: boolean
  version: number
  ydoc: string
  saved_at?: string | null
}

export interface SyncBackend {
  /** False while there is no session the server will accept. A read made
   *  without one may come back empty rather than failing, and an empty
   *  answer would look like every page having been deleted. */
  hasSession(): Promise<boolean>

  /** Every page row stamped at or after `since`, oldest first, a batch at a
   *  time. Tombstones included. */
  pagesSince(since: string, signal: AbortSignal): AsyncIterable<ServerPage[]>
  /** The version of every document stamped at or after `since`, oldest
   *  first, a batch at a time. No blobs. */
  docVersionsSince(since: string, signal: AbortSignal): AsyncIterable<DocVersion[]>
  /** The documents of these pages. One the server lacks is left out. */
  fetchDocs(pageIds: string[], signal: AbortSignal): Promise<ServerDoc[]>
  /** The id of every page that is not a tombstone, and how many the server
   *  said there were, so a scan cut short can be told from a complete one. */
  livePageIds(signal: AbortSignal): Promise<{ ids: Set<string>; expected: number }>

  /** Writes page rows, returning the stamp each was given. A tombstone is
   *  skipped rather than written, and left out of the answer. */
  upsertPages(rows: PageUpsert[], signal: AbortSignal): Promise<Array<{ id: string; updated_at: string }>>
  /** Deletes these pages for good, leaving tombstones, including for ids the
   *  server has never seen. */
  purgePages(pageIds: string[], signal: AbortSignal): Promise<void>
  pushDoc(pageId: string, ydoc: string, baseVersion: number, signal: AbortSignal): Promise<PushResult>

  /** Tells the engine when a page row changes, so it can pull now rather
   *  than on its next poll. A hint only: the engine always reads through the
   *  methods above. Optional, since the poll carries on without it.
   *  `onState` reports whether the hints are flowing. Returns a function
   *  that stops them; nothing is called after it. */
  watch?(
    onChange: (row: { id?: unknown; updated_at?: unknown }) => void,
    onState: (up: boolean) => void,
  ): () => void
}
