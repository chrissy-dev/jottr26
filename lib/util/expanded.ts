'use client'

import { useSyncExternalStore } from 'react'

/** Which pages have their subpages showing in the sidebar. Only the sidebar
 *  changes it; nothing done in the editor opens a branch. Remembered per
 *  device in localStorage, as it always has been: which folders are open is a
 *  view preference, not page data. The page tree and the favourites each keep
 *  their own, so opening a page in one doesn't open it in the other. */

const EMPTY: ReadonlySet<string> = new Set()

function createExpandedStore(key: string) {
  let current: ReadonlySet<string> | null = null
  const listeners = new Set<() => void>()

  function snapshot(): ReadonlySet<string> {
    if (!current) {
      try {
        const raw = localStorage.getItem(key)
        current = new Set(raw ? (JSON.parse(raw) as string[]) : [])
      } catch {
        current = new Set()
      }
    }
    return current
  }

  function save(next: ReadonlySet<string>) {
    current = next
    try {
      localStorage.setItem(key, JSON.stringify([...next]))
    } catch {
      /* Ignore. */
    }
    for (const listener of listeners) listener()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    use: (): ReadonlySet<string> => useSyncExternalStore(subscribe, snapshot, () => EMPTY),
    toggle(id: string) {
      const next = new Set(snapshot())
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save(next)
    },
  }
}

const pages = createExpandedStore('jottr.expanded')
const favourites = createExpandedStore('jottr.expanded.favourites')

export const useExpanded = pages.use
export const toggleExpanded = pages.toggle
export const useExpandedFavourites = favourites.use
export const toggleExpandedFavourite = favourites.toggle
