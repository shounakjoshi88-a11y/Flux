import { createBrowserClient } from '@supabase/ssr'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function createClient() {
  return createBrowserClient(
    process.env.BUN_PUBLIC_SUPABASE_URL!,
    process.env.BUN_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      db: {
        schema: 'public',
      },
    }
  )
}
