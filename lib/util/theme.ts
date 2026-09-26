'use client'

import { useSyncExternalStore } from 'react'
import { THEME_EVENT, THEME_KEY } from './themeScript'

export type Theme = 'system' | 'light' | 'dark'

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(THEME_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function snapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, snapshot, () => 'system')
}

/** Stored, then handed to the script in the head, which does the applying. */
export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Without storage there is nowhere to keep a choice, and the page stays
    // with the device's setting.
  }
  window.dispatchEvent(new Event(THEME_EVENT))
}
