'use client'

import { isSupabaseConfigured, storedSession, supabaseClient } from '@/lib/supabase/client'
import type { AuthProvider } from './types'

/** Supabase Auth, signing in with a code sent by email. */
export const supabaseAuth: AuthProvider = {
  configured: isSupabaseConfigured,

  storedSession,

  async getSession() {
    const { data } = await supabaseClient().auth.getSession()
    return data.session
  },

  onSessionChange(listener) {
    const { data } = supabaseClient().auth.onAuthStateChange((_event, session) => listener(session))
    return () => data.subscription.unsubscribe()
  },

  async signOut() {
    await supabaseClient().auth.signOut({ scope: 'local' })
  },

  signIn: {
    kind: 'emailCode',

    async sendCode(email) {
      const { error } = await supabaseClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/app`,
        },
      })
      return error?.message ?? null
    },

    async verifyCode(email, code) {
      const { error } = await supabaseClient().auth.verifyOtp({ email, token: code, type: 'email' })
      return error?.message ?? null
    },
  },
}
