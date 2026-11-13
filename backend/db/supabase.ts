/**
 * Supabase client.
 *
 * Uses the service-role secret, so this client bypasses row-level security.
 * It must never be handed to the browser: the frontend gets the anon key
 * through BUN_PUBLIC_SUPABASE_ANON_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export function createSupabaseClient() {
    return createClient(env.SUPABASE_URL!, env.SUPABASE_API_SECRET!);
}
