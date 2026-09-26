'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** The workspace is one route with the open page in the query string.
 *
 *  Navigating between pages therefore never fetches a document or an RSC
 *  payload — it is a `pushState` and a re-render off IndexedDB. That is what
 *  makes clicking through the sidebar feel instant, and it is also what lets
 *  the service worker serve one cached shell for every /app URL when offline. */

const EVENT = 'jottr:navigate'

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(EVENT, callback)
  }
}

const snapshot = () => window.location.search
const serverSnapshot = () => ''

function useQuery() {
  const search = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return new URLSearchParams(search)
}

export function useOpenPageId(): [string | null, (id: string | null, options?: { replace?: boolean }) => void] {
  const params = useQuery()
  const open = useCallback((id: string | null, options?: { replace?: boolean }) => {
    const next = new URLSearchParams(window.location.search)
    if (id) next.set('p', id)
    else next.delete('p')
    next.delete('new')
    for (const view of VIEWS) next.delete(view)
    navigate(next, options?.replace)
  }, [])
  return [params.get('p'), open]
}

/** The trash and the settings are views of their own, in place of a page, so
 *  they live in the query string the same way and the back button leaves them
 *  like any page. */
const VIEWS = ['trash', 'settings'] as const
export type View = (typeof VIEWS)[number]

export function useView(): [View | null, (view: View) => void] {
  const params = useQuery()
  const openView = useCallback((view: View) => {
    const next = new URLSearchParams(window.location.search)
    next.delete('p')
    next.delete('new')
    for (const other of VIEWS) next.delete(other)
    next.set(view, '')
    navigate(next)
  }, [])
  return [VIEWS.find((view) => params.has(view)) ?? null, openView]
}

function navigate(next: URLSearchParams, replace?: boolean) {
  const url = next.toString() ? `${window.location.pathname}?${next}` : window.location.pathname
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(EVENT))
}
