'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { auth, type AuthSession } from '@/lib/auth'
import { supabaseClient } from '@/lib/supabase/client'
import { closeDatabase, eraseDatabase, openDatabase } from '@/lib/db/dexie'
import { moveSearchTexts } from '@/lib/db/searchText'
import { releaseAll } from '@/lib/db/ydoc'
import { SyncEngine } from '@/lib/sync/engine'
import { SupabaseBackend } from '@/lib/sync/supabase'
import { initialStatus, type SyncStatus } from '@/lib/sync/types'

/** What rarely changes: who is signed in, and the actions. Kept apart from the
 *  sync status, which moves with every keystroke, so that most of the app does
 *  not re-render each time the pending count does. */
interface WorkspaceValue {
  session: AuthSession | null
  userId: string | null
  /** True once we know whether there is a session and, if so, the local
   *  database is open. Everything downstream can assume storage is ready. */
  ready: boolean
  /** Retries a failed sync at once, skipping the backoff. Resolves once that
   *  sync has finished, with how it went — or null when there is no engine to
   *  ask. */
  retrySync: () => Promise<SyncStatus | null>
  /** Abandons the sync in progress, for a network that never answers. */
  cancelSync: () => void
  signOut: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)
const SyncStatusContext = createContext<SyncStatus>(initialStatus)

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}

export function useSyncStatus() {
  return useContext(SyncStatusContext)
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [ready, setReady] = useState(false)
  const [engineStatus, setEngineStatus] = useState<SyncStatus>(initialStatus)
  // Which account's database is open, so readiness can wait for it.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const engineRef = useRef<SyncEngine | null>(null)

  useEffect(() => {
    let cancelled = false

    // Open straight from storage rather than waiting on the server, which with an
    // expired token spends half a minute trying to refresh it when offline
    // and then reports no session at all.
    queueMicrotask(() => {
      const stored = auth.storedSession()
      if (cancelled || !stored) return
      setSession((current) => current ?? stored)
      setReady(true)
    })

    // A null from the server is only believed once it has also cleared
    // storage: that is a real sign-out, not an unreachable server.
    auth.getSession().then((next) => {
      if (cancelled) return
      setSession(next ?? auth.storedSession())
      setReady(true)
    })

    const unsubscribe = auth.onSessionChange((next) => {
      setSession(next ?? auth.storedSession())
      setReady(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
      engineRef.current?.stop()
      engineRef.current = null
      releaseAll()
      closeDatabase()
      return
    }

    const db = openDatabase(userId)
    const engine = new SyncEngine(new SupabaseBackend(supabaseClient(), userId), userId)
    engineRef.current = engine
    // subscribe() hands over the current status straight away, so this is
    // also the signal that the database is open for this account.
    const unsubscribe = engine.subscribe((next) => {
      setOpenFor(userId)
      setEngineStatus(next)
    })
    // The engine waits for the search text to move off the page rows: a pull
    // rewrites a row whole, and would drop the text before it was copied.
    let stopped = false
    void moveSearchTexts(db)
      .catch(() => undefined)
      .then(() => {
        if (!stopped) void engine.start()
      })

    return () => {
      stopped = true
      unsubscribe()
      engine.stop()
      engineRef.current = null
      releaseAll()
    }
  }, [userId])

  // Signed out is a fact about the session, not a value the engine reports, so
  // it is derived rather than pushed into state from an effect.
  const status: SyncStatus = useMemo(
    () => (userId ? engineStatus : { ...initialStatus, phase: 'signedOut' }),
    [userId, engineStatus],
  )

  const signOut = useCallback(async () => {
    const id = userId
    engineRef.current?.stop()
    engineRef.current = null
    releaseAll()
    // Local scope: a server-side revoke needs the network, and being unable to
    // reach the server is not a reason to leave someone signed in on a device
    // they are trying to hand back.
    await auth.signOut().catch(() => undefined)

    // Notes are cloud-backed; leaving a copy in IndexedDB on a device that may
    // be shared is not a trade worth making. Another tab holding the database
    // open would make the delete wait, so it is given a deadline rather than
    // being allowed to hang the sign-out.
    if (id) {
      await Promise.race([
        eraseDatabase(id),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    }
  }, [userId])

  const retrySync = useCallback(async () => engineRef.current?.retryNow() ?? null, [])
  const cancelSync = useCallback(() => engineRef.current?.cancelSync(), [])

  const value = useMemo<WorkspaceValue>(
    () => ({
      session,
      userId,
      ready: ready && (!userId || openFor === userId),
      retrySync,
      cancelSync,
      signOut,
    }),
    [session, userId, ready, openFor, retrySync, cancelSync, signOut],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
    </WorkspaceContext.Provider>
  )
}
