'use client'

import { BACKEND } from '@/lib/config'
import { selfHostedAuth } from './selfHosted'
import { supabaseAuth } from './supabase'
import type { AuthProvider } from './types'

export type { AuthProvider, AuthSession } from './types'

/** The sign-in this build uses. */
export const auth: AuthProvider = BACKEND === 'self-hosted' ? selfHostedAuth : supabaseAuth
