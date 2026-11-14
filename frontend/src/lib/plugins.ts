/**
 * Client for the plugins API — installable bundles of skills.
 * Installing a plugin enables its bundled skills.
 */
import { BACKEND_URL } from "./config";
import { createClient } from "./client";

export type PluginIconKey = "office" | "design" | "research";

export interface FluxPlugin {
  id: string;
  name: string;
  source: string;
  description: string;
  skills: string[];
  badge: string;
  iconKey: PluginIconKey;
  installed: boolean;
  enabled: boolean;
  installedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

export async function fetchPlugins(): Promise<FluxPlugin[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/plugins`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.plugins ?? [];
  } catch {
    return [];
  }
}

export async function installPlugin(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/plugins/${encodeURIComponent(id)}/install`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uninstallPlugin(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/plugins/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function togglePlugin(id: string, enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/plugins/${encodeURIComponent(id)}/toggle`, {
      method: "PATCH",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
