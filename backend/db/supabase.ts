/**
 * Supabase client.
 *
 * Uses the service-role secret, so this client bypasses row-level security.
 * It must never be handed to the browser: the frontend gets the anon key
 * through BUN_PUBLIC_SUPABASE_ANON_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { env, isSmoke } from '../config/env';

/**
 * Build a Supabase client. In smoke mode, when the keys are absent, returns a
 * stub whose auth.getUser always fails, so the auth middleware answers 401
 * instead of crashing at import time.
 */
export function createSupabaseClient() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_API_SECRET;

    if (!url || !key) {
        if (!isSmoke) {
            throw new Error('SUPABASE_URL and SUPABASE_API_SECRET are required outside smoke mode');
        }
        console.warn('[supabase] running without credentials (smoke mode)');
        return {
            auth: { getUser: async () => ({ data: { user: null }, error: new Error('no credentials') }) },
        } as any;
    }

    return createClient(url, key);
}
