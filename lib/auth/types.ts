/** Who is signed in. Shaped like a Supabase session's user, which is all the
 *  app reads from one. */
export interface AuthSession {
  user: { id: string; email?: string | null }
}

/** Sign in with a code sent to an email address. */
export interface EmailCodeSignIn {
  kind: 'emailCode'
  /** Sends the code, creating the account if there isn't one. Resolves with
   *  an error message, or null once the code is on its way. */
  sendCode(email: string): Promise<string | null>
  /** Resolves with an error message, or null once signed in. */
  verifyCode(email: string, code: string): Promise<string | null>
}

export type SignIn = EmailCodeSignIn

/** Where sessions come from. The workspace opens from `storedSession` alone,
 *  so the installed app can show your notes with no network at all. */
export interface AuthProvider {
  /** False when the build lacks the settings this provider needs. */
  readonly configured: boolean
  /** The session last saved on this device, read without the network. It
   *  may have expired, and is still enough to open your notes offline. */
  storedSession(): AuthSession | null
  /** The session as the server sees it. Null may only mean the server could
   *  not be reached; the stored session says whether you have signed out. */
  getSession(): Promise<AuthSession | null>
  /** Calls `listener` whenever the session changes. Returns a function that
   *  stops it. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void
  /** Signs out on this device, without needing the server. */
  signOut(): Promise<void>
  readonly signIn: SignIn
}
