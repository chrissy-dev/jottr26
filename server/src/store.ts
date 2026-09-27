import { DatabaseSync } from 'node:sqlite'
import type {
  DocVersion,
  PageUpsert,
  PushResult,
  ServerDoc,
  ServerPage,
} from '../../lib/sync/backend.ts'

/** Rows per pull request, as with Supabase. */
export const PAGE_SIZE = 500

const SCHEMA = `
create table if not exists pages (
  user_id     text not null,
  id          text not null,
  title       text not null default '',
  -- Not a foreign key, as in schema.sql: a child can arrive before its parent.
  parent_id   text,
  sort_key    text not null default 'a0',
  is_favorite integer not null default 0,
  deleted_at  text,
  purged_at   text,
  created_at  text not null,
  updated_at  text not null,
  primary key (user_id, id)
);
create index if not exists pages_updated_idx on pages (user_id, updated_at);

create table if not exists page_docs (
  user_id    text not null,
  page_id    text not null,
  ydoc       text not null,
  version    integer not null,
  updated_at text not null,
  primary key (user_id, page_id)
);
create index if not exists page_docs_updated_idx on page_docs (user_id, updated_at);

create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null,
  created_at text not null
);
`

type PageRecord = Omit<ServerPage, 'is_favorite'> & { is_favorite: number }

/** A page row stamped by a write, for the change stream. */
export interface Change {
  id: string
  updated_at: string
}

/** Jottr's server-side data, in one SQLite file. Mirrors supabase/schema.sql:
 *  the same tables, the same compare-and-swap for documents and the same
 *  tombstones, scoped by user rather than by row level security.
 *
 *  node:sqlite is synchronous, and this process is the only writer, so every
 *  method runs start to finish without another request in between. */
export class Store {
  readonly db: DatabaseSync
  private lastStamp = 0
  private listeners = new Set<(userId: string, changes: Change[]) => void>()

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000;')
    this.db.exec(SCHEMA)
    // Carry on from the newest stamp on disk, so a clock that has gone
    // backwards since the last run never hands out an older one.
    const newest = this.db
      .prepare(
        'select max(at) as at from (select max(updated_at) as at from pages union all select max(updated_at) from page_docs)',
      )
      .get() as { at: string | null }
    this.lastStamp = newest.at ? Date.parse(newest.at) : 0
  }

  close() {
    this.db.close()
  }

  /** A fresh updated_at. Each one is later than every one before it, never
   *  equal, so a pull can page on the stamp alone and a device can tell its
   *  own write from anyone else's. Fixed-width ISO, so stamps sort as text. */
  private stamp() {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1)
    return new Date(this.lastStamp).toISOString()
  }

  /** Calls `listener` with the page rows each write stamps. */
  onChange(listener: (userId: string, changes: Change[]) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private announce(userId: string, changes: Change[]) {
    if (changes.length === 0) return
    for (const listener of this.listeners) listener(userId, changes)
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('begin immediate')
    try {
      const result = work()
      this.db.exec('commit')
      return result
    } catch (error) {
      this.db.exec('rollback')
      throw error
    }
  }

  // --- reads --------------------------------------------------------------

  /** Page rows stamped at or after `since`, or strictly after `after`,
   *  oldest first. */
  pagesSince(userId: string, from: { since?: string; after?: string }, limit = PAGE_SIZE): ServerPage[] {
    const { clause, value } = fromClause(from)
    const rows = this.db
      .prepare(
        `select id, title, parent_id, sort_key, is_favorite, deleted_at, purged_at, created_at, updated_at
           from pages where user_id = ? and updated_at ${clause} ?
          order by updated_at, id limit ?`,
      )
      .all(userId, value, limit) as unknown as PageRecord[]
    return rows.map((row) => ({ ...row, is_favorite: row.is_favorite === 1 }))
  }

  docVersionsSince(userId: string, from: { since?: string; after?: string }, limit = PAGE_SIZE): DocVersion[] {
    const { clause, value } = fromClause(from)
    return this.db
      .prepare(
        `select page_id, version, updated_at from page_docs
          where user_id = ? and updated_at ${clause} ?
          order by updated_at, page_id limit ?`,
      )
      .all(userId, value, limit) as unknown as DocVersion[]
  }

  fetchDocs(userId: string, pageIds: string[]): ServerDoc[] {
    const get = this.db.prepare('select page_id, ydoc, version from page_docs where user_id = ? and page_id = ?')
    return pageIds.flatMap((id) => {
      const row = get.get(userId, id) as ServerDoc | undefined
      return row ? [row] : []
    })
  }

  /** Every page that is not a tombstone. */
  livePageIds(userId: string): string[] {
    const rows = this.db
      .prepare('select id from pages where user_id = ? and purged_at is null order by id')
      .all(userId) as Array<{ id: string }>
    return rows.map((row) => row.id)
  }

  // --- writes -------------------------------------------------------------

  /** Last writer wins, on only the fields given. A tombstone is skipped, not
   *  an error, and left out of the answer, as the keep_purged trigger does. */
  upsertPages(userId: string, rows: PageUpsert[]): Change[] {
    const out = this.transaction(() => {
      const existing = this.db.prepare('select purged_at from pages where user_id = ? and id = ?')
      const written: Change[] = []
      for (const row of rows) {
        const current = existing.get(userId, row.id) as { purged_at: string | null } | undefined
        if (current?.purged_at) continue
        const updated_at = this.stamp()
        if (!current) {
          this.db
            .prepare(
              `insert into pages (user_id, id, title, parent_id, sort_key, is_favorite, deleted_at, created_at, updated_at)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              userId,
              row.id,
              row.title ?? '',
              row.parent_id ?? null,
              row.sort_key ?? 'a0',
              row.is_favorite ? 1 : 0,
              row.deleted_at ?? null,
              row.created_at,
              updated_at,
            )
        } else {
          const fields: Array<[string, string | number | null]> = []
          if ('title' in row) fields.push(['title', row.title ?? ''])
          if ('parent_id' in row) fields.push(['parent_id', row.parent_id ?? null])
          if ('sort_key' in row) fields.push(['sort_key', row.sort_key ?? 'a0'])
          if ('is_favorite' in row) fields.push(['is_favorite', row.is_favorite ? 1 : 0])
          if ('deleted_at' in row) fields.push(['deleted_at', row.deleted_at ?? null])
          fields.push(['updated_at', updated_at])
          this.db
            .prepare(`update pages set ${fields.map(([name]) => `${name} = ?`).join(', ')} where user_id = ? and id = ?`)
            .run(...fields.map(([, value]) => value), userId, row.id)
        }
        written.push({ id: row.id, updated_at })
      }
      return written
    })
    this.announce(userId, out)
    return out
  }

  /** Deletes pages for good, leaving tombstones, including for ids never
   *  seen, in case another device still holds the page. */
  purgePages(userId: string, ids: string[]) {
    const out = this.transaction(() => {
      const written: Change[] = []
      for (const id of ids) {
        this.db.prepare('delete from page_docs where user_id = ? and page_id = ?').run(userId, id)
        const current = this.db.prepare('select purged_at from pages where user_id = ? and id = ?').get(userId, id) as
          | { purged_at: string | null }
          | undefined
        if (current?.purged_at) continue
        const now = this.stamp()
        if (current) {
          this.db
            .prepare(
              `update pages set purged_at = ?, deleted_at = coalesce(deleted_at, ?), title = '', updated_at = ?
                where user_id = ? and id = ?`,
            )
            .run(now, now, now, userId, id)
        } else {
          this.db
            .prepare(
              `insert into pages (user_id, id, purged_at, deleted_at, created_at, updated_at)
               values (?, ?, ?, ?, ?, ?)`,
            )
            .run(userId, id, now, now, now, now)
        }
        written.push({ id, updated_at: now })
      }
      return written
    })
    this.announce(userId, out)
  }

  /** Compare-and-swap write of a document, as push_page_doc in schema.sql. */
  pushDoc(userId: string, pageId: string, ydoc: string, baseVersion: number): PushResult {
    let change: Change | null = null
    const result = this.transaction((): PushResult => {
      const page = this.db
        .prepare('select purged_at from pages where user_id = ? and id = ?')
        .get(userId, pageId) as { purged_at: string | null } | undefined
      // Deleted for good, or never here: version 0 tells the client to drop
      // its copy, or to push the page row first.
      if (!page || page.purged_at) return { ydoc: '', version: 0, applied: true, saved_at: null }

      const doc = this.db
        .prepare('select ydoc, version from page_docs where user_id = ? and page_id = ?')
        .get(userId, pageId) as { ydoc: string; version: number } | undefined

      let version: number | null = null
      if (baseVersion <= 0 && !doc) {
        version = 1
        this.db
          .prepare('insert into page_docs (user_id, page_id, ydoc, version, updated_at) values (?, ?, ?, 1, ?)')
          .run(userId, pageId, ydoc, this.stamp())
      } else if (doc && baseVersion > 0 && doc.version === baseVersion) {
        version = doc.version + 1
        this.db
          .prepare('update page_docs set ydoc = ?, version = ?, updated_at = ? where user_id = ? and page_id = ?')
          .run(ydoc, version, this.stamp(), userId, pageId)
      }

      if (version === null) {
        return { ydoc: doc?.ydoc ?? '', version: doc?.version ?? 0, applied: false, saved_at: null }
      }

      // The page row carries the news to other devices, as page_doc_saved.
      const saved_at = this.stamp()
      this.db.prepare('update pages set updated_at = ? where user_id = ? and id = ?').run(saved_at, userId, pageId)
      change = { id: pageId, updated_at: saved_at }
      return { ydoc: '', version, applied: true, saved_at }
    })
    if (change) this.announce(userId, [change])
    return result
  }

  // --- sessions -----------------------------------------------------------

  addSession(tokenHash: string, userId: string) {
    this.db
      .prepare('insert into sessions (token_hash, user_id, created_at) values (?, ?, ?)')
      .run(tokenHash, userId, new Date().toISOString())
  }

  sessionUser(tokenHash: string): string | null {
    const row = this.db.prepare('select user_id from sessions where token_hash = ?').get(tokenHash) as
      | { user_id: string }
      | undefined
    return row?.user_id ?? null
  }

  removeSession(tokenHash: string) {
    this.db.prepare('delete from sessions where token_hash = ?').run(tokenHash)
  }
}

function fromClause(from: { since?: string; after?: string }) {
  return from.after !== undefined
    ? { clause: '>', value: from.after }
    : { clause: '>=', value: from.since ?? '' }
}
