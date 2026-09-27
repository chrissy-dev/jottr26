'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Wide enough for the sidebar to sit beside the page rather than over it. */
export const WIDE_QUERY = '(min-width: 880px)'

/** Whether the screen is wide, and whether the sidebar is showing: always
 *  beside the page on a wide screen, and a drawer over it on a narrow one. */
export function useSidebarDrawer() {
  // Read at once rather than in the effect below, or a phone would draw its
  // first frame with the sidebar beside the page. The workspace only renders
  // in the browser, so there is always a window to ask.
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY)
    let cold = true
    const apply = () => {
      setWide(media.matches)
      // A phone opening the app cold lands on the page list, since picking a
      // page is the first thing to do there. Narrowing a window later is not
      // a fresh start, and gets the page to itself. A wide screen always has
      // the sidebar: there is no way to hide it there.
      setSidebarOpen(media.matches || cold)
      cold = false
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  // Leaving for another page from the open drawer waits for the drawer to
  // finish sliding shut. iOS takes the picture it shows during a swipe back at
  // the moment the history entry is pushed, so pushing any earlier would have
  // the drawer reappear on the page being swiped back to.
  const pending = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pending.current), [])
  // Read through a ref so the callback keeps one identity: every sidebar row
  // takes it as a prop, and would otherwise all redraw as the drawer slides.
  const drawer = useRef({ wide, sidebarOpen })
  useLayoutEffect(() => {
    drawer.current = { wide, sidebarOpen }
  }, [wide, sidebarOpen])
  const afterDrawerShuts = useCallback((go: () => void) => {
    window.clearTimeout(pending.current)
    if (drawer.current.wide || !drawer.current.sidebarOpen) {
      go()
      return
    }
    setSidebarOpen(false)
    // The slide's 200ms, and a little over for its last frame to be shown.
    pending.current = window.setTimeout(go, 250)
  }, [])

  return { wide, sidebarOpen, setSidebarOpen, afterDrawerShuts }
}
