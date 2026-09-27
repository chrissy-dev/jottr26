/** Which server this build talks to, fixed when it is built.
 *
 *  - supabase (the default): Supabase Auth and Postgres, as set up by
 *    supabase/schema.sql.
 *  - self-hosted: the server in server/, on the same origin as the app.
 *    Set NEXT_PUBLIC_JOTTR_BACKEND=self-hosted, usually with
 *    JOTTR_STATIC_EXPORT=1, since that server serves the app too. */
export const BACKEND: 'supabase' | 'self-hosted' =
  process.env.NEXT_PUBLIC_JOTTR_BACKEND === 'self-hosted' ? 'self-hosted' : 'supabase'
