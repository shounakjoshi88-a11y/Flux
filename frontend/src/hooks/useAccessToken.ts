/**
 * Cached Supabase access-token accessor.
 *
 * Every backend call goes through `useAccessToken(supabase)` instead of
 * calling `supabase.auth.getSession()` directly, because the Supabase
 * round-trip is expensive. A token is reused until it has less than 15
 * seconds of life left; when it's expired (or missing) Supabase is asked to
 * refresh the session before anything is handed back out. Callers always
 * get either a usable token string or `""` ("no token available") - never a
 * stale token - and an empty string lets the caller bail out cleanly.
 *
 * The Supabase client is passed in by the caller so this hook does not
 * create a second client (multiple GoTrue instances trigger Supabase's
 * "Multiple GoTrueClient instances" warning).
 *
 * Extracted from `pages/Dashboard.tsx`, where the cache logic lived inline;
 * keeping it in its own module makes the contract explicit.
 *
 * Usage:
 *   const getAccessToken = useAccessToken(supabase);
 *   const token = await getAccessToken();
 *   if (!token) return;
 */
import { useCallback, useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** How long before expiry a cached token is considered unusable. */
const FRESHNESS_MARGIN_MS = 15_000;
/** Fallback lifetime when Supabase does not report an expiry time. */
const DEFAULT_TOKEN_TTL_MS = 3_600_000;

export function useAccessToken(supabase: SupabaseClient) {
  const cacheRef = useRef<{ token: string; expiresAt: number } | null>(null);

  // Drop the cache on unmount so a remount can't see a token the old
  // session already invalidated.
  useEffect(() => () => { cacheRef.current = null; }, []);

  return useCallback(async () => {
    const now = Date.now();
    // Return the cached token while it still has >15 s of life.
    if (cacheRef.current && cacheRef.current.expiresAt > now + FRESHNESS_MARGIN_MS) {
      return cacheRef.current.token;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      cacheRef.current = {
        token: session.access_token,
        expiresAt: session.expires_at ? session.expires_at * 1000 : now + DEFAULT_TOKEN_TTL_MS,
      };
      return session.access_token;
    }
    await supabase.auth.refreshSession();
    const { data: { session: fresh } } = await supabase.auth.getSession();
    const token = fresh?.access_token ?? "";
    if (token) {
      cacheRef.current = {
        token,
        expiresAt: fresh?.expires_at ? fresh.expires_at * 1000 : now + DEFAULT_TOKEN_TTL_MS,
      };
    }
    return token;
  }, [supabase]);
}
