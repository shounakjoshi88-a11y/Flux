import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createSupabaseClient> | null = null;

const storage = {
  getItem: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch {} },
};

export function createClient() {
  if (!client) {
    client = createSupabaseClient(
      process.env.BUN_PUBLIC_SUPABASE_URL!,
      process.env.BUN_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
          storage,
        },
      }
    );
  }
  return client;
}
