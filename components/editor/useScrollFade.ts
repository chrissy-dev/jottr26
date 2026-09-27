'use client'

import { useCallback, useRef } from 'react'

/** Marks a row that scrolls sideways with which of its ends has more beyond
 *  it, as `data-fade-start` and `data-fade-end`, for `.scroll-fade` to fade
 *  that edge out. A row cut off cleanly at the screen's edge looks like it
 *  simply ends there; one that fades away looks like it carries on.
 *
 *  A callback ref, since the rows it goes on come and go with the bar. */
export function useScrollFade() {
  const cleanup = useRef<(() => void) | null>(null)

  return useCallback((row: HTMLElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!row) return

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = row
      // A pixel of slack, as a zoomed screen can leave the scroll a fraction
      // short of either end.
      row.dataset.fadeStart = String(scrollLeft > 1)
      row.dataset.fadeEnd = String(scrollLeft + clientWidth < scrollWidth - 1)
    }

    update()
    row.addEventListener('scroll', update, { passive: true })
    // The screen turning, or buttons appearing and going, changes whether
    // there is anything to scroll to.
    const observer = new ResizeObserver(update)
    const observeAll = () => {
      observer.disconnect()
      observer.observe(row)
      for (const child of row.children) observer.observe(child)
    }
    observeAll()
    const mutations = new MutationObserver(observeAll)
    mutations.observe(row, { childList: true })
    cleanup.current = () => {
      row.removeEventListener('scroll', update)
      observer.disconnect()
      mutations.disconnect()
    }
  }, [])
}
