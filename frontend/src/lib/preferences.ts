/** Read/write small user_metadata preferences (same keys Settings uses). */
import { createClient } from "./client";

export async function getUserMetadata<T = any>(): Promise<Record<string, T> | null> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return (user?.user_metadata as Record<string, T>) ?? null;
  } catch {
    return null;
  }
}

export async function setUserMetadata(patch: Record<string, any>): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: patch });
    return !error;
  } catch {
    return false;
  }
}

export async function getMemoryEnabled(): Promise<boolean> {
  const meta = await getUserMetadata<boolean>();
  return meta?.enable_memory ?? true;
}

export async function setMemoryEnabled(enabled: boolean): Promise<boolean> {
  return setUserMetadata({ enable_memory: enabled });
}
