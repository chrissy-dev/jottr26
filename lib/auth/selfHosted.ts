'use client'

import { api } from '@/lib/selfHosted'
import type { AuthProvider, AuthSession } from './types'

const STORAGE_KEY = 'jottr.selfHosted.session'

const listeners = new Set<(session: AuthSession | null) => void>()

function store(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage refused: the session still holds for as long as the page does.
  }
}

function changed(session: AuthSession | null) {
  store(session)
  for (const listener of listeners) listener(session)
}

/** Sign-in for the server in server/: a session cookie the server sets,
 *  and a copy of who you are on the device so the app opens offline. With
 *  JOTTR_AUTH=none the server says everyone is signed in, and the login page
 *  moves straight on. */
export const selfHostedAuth: AuthProvider = {
  configured: true,

  storedSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AuthSession | null
      return stored?.user?.id ? stored : null
    } catch {
      return null
    }
  },

  async getSession() {
    try {
      const session = await api<AuthSession>('GET', '/session')
      store(session)
      return session
    } catch (error) {
      // Only the server saying no ends the session on this device; not
      // being able to reach it is what offline looks like.
      if ((error as { status?: number }).status === 401) store(null)
      return null
    }
  },

  onSessionChange(listener) {
    listeners.add(listener)
    // Another tab signing in or out.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) listener(selfHostedAuth.storedSession())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  },

  async signOut() {
    try {
      await api('DELETE', '/session')
    } finally {
      changed(null)
    }
  },

  signIn: {
    kind: 'password',

    async submit(password) {
      try {
        changed(await api<AuthSession>('POST', '/session', { body: { password } }))
        return null
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not sign in'
      }
    },
  },
}
