'use client'

import { supabaseAuth } from './supabase'
import type { AuthProvider } from './types'

export type { AuthProvider, AuthSession } from './types'

/** The sign-in this build uses. */
export const auth: AuthProvider = supabaseAuth
