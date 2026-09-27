'use client'

import { useEffect } from 'react'
import { auth } from '@/lib/auth'

/** Sends a signed-in visitor on the landing page straight to their notes.
 *
 *  The session lives in localStorage, not a cookie, so the server can't make
 *  this call — it has to happen here once the page is in the browser. */
export function SignedInRedirect() {
  useEffect(() => {
    if (!auth.configured) return
    void auth.getSession().then((session) => {
      if (session) window.location.replace('/app')
    })
  }, [])

  return null
}
