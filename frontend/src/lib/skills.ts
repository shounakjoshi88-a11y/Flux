/**
 * Client for the skills API — powers the composer "+" menu Skills list and
 * Settings → Capabilities → Skills.
 *
 * Built-in skills toggle through Supabase user_metadata (`disabledBuiltinSkills`),
 * matching how `enable_memory` is stored. Custom skills toggle/delete through
 * the backend (`Skill` table).
 */
import { BACKEND_URL } from "./config";
import { createClient } from "./client";

export interface SkillMeta {
  name: string;
  description: string;
  source: "builtin" | "custom";
  enabled: boolean;
  id?: string;
  docType?: string;
}

export interface SkillBody extends SkillMeta {
  body: string;
  files?: Record<string, string>;
}

const TTL_MS = 30_000;
let cache: { at: number; skills: SkillMeta[] } | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

export function invalidateSkillsCache() {
  cache = null;
}

export async function fetchSkills(force = false): Promise<SkillMeta[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.skills;
  try {
    const res = await fetch(`${BACKEND_URL}/api/skills`, { headers: await authHeaders() });
    if (!res.ok) return cache?.skills ?? [];
    const data = await res.json();
    cache = { at: Date.now(), skills: data.skills ?? [] };
    return cache.skills;
  } catch {
    return cache?.skills ?? [];
  }
}

export async function fetchSkillBody(name: string): Promise<SkillBody | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skills/${encodeURIComponent(name)}`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.skill ?? null;
  } catch {
    return null;
  }
}

/** Toggle a built-in via user_metadata. */
async function toggleBuiltin(name: string, nextEnabled: boolean): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const current: string[] = Array.isArray(user.user_metadata?.disabledBuiltinSkills)
      ? user.user_metadata.disabledBuiltinSkills.filter((x: any) => typeof x === "string")
      : [];
    const next = nextEnabled
      ? current.filter((n) => n !== name)
      : Array.from(new Set([...current, name]));
    const { error } = await supabase.auth.updateUser({ data: { disabledBuiltinSkills: next } });
    return !error;
  } catch {
    return false;
  }
}

/** Toggle any skill. Optimistic callers should revert on false. */
export async function toggleSkill(skill: SkillMeta, nextEnabled: boolean): Promise<boolean> {
  let ok: boolean;
  if (skill.source === "builtin") {
    ok = await toggleBuiltin(skill.name, nextEnabled);
  } else {
    try {
      const res = await fetch(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.name)}/toggle`, {
        method: "PATCH",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
  }
  invalidateSkillsCache();
  return ok;
}

export async function createSkill(input: {
  name: string;
  description: string;
  content: string;
  files?: Record<string, string>;
}): Promise<{ ok: boolean; message?: string; skill?: SkillMeta }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skills`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message ?? `Create failed (${res.status})` };
    invalidateSkillsCache();
    return { ok: true, skill: data.skill };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Create failed" };
  }
}

export async function deleteSkill(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    invalidateSkillsCache();
    return res.ok;
  } catch {
    return false;
  }
}
