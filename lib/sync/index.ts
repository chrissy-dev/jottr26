import { BACKEND } from '@/lib/config'
import { supabaseClient } from '@/lib/supabase/client'
import type { SyncBackend } from './backend'
import { SelfHostedBackend } from './selfHosted'
import { SupabaseBackend } from './supabase'

/** The server this build syncs with, for this account. */
export function syncBackend(userId: string): SyncBackend {
  return BACKEND === 'self-hosted' ? new SelfHostedBackend() : new SupabaseBackend(supabaseClient(), userId)
}
