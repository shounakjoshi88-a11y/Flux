/**
 * Client for the connectors API — powers the composer menu, the Add custom
 * connector dialog, and Settings → Customize → Connectors.
 */
import { BACKEND_URL } from "./config";
import { createClient } from "./client";

export interface BuiltinConnector {
  id: string;
  kind: "builtin";
  name: string;
  subtitle: string;
  description: string;
  by: string;
  connected: boolean;
  account: string | null;
}

export interface CustomConnector {
  id: string;
  kind: "custom";
  name: string;
  subtitle: string;
  description: string;
  by: string;
  url: string;
  enabled: boolean;
  addedAt: string;
}

export interface ConnectorsResponse {
  builtin: BuiltinConnector[];
  custom: CustomConnector[];
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

export async function fetchConnectors(): Promise<ConnectorsResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/connectors`, { headers: await authHeaders() });
    if (!res.ok) return { builtin: [], custom: [] };
    return await res.json();
  } catch {
    return { builtin: [], custom: [] };
  }
}

export async function addCustomConnector(name: string, url: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/connectors`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ name, url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message ?? `Couldn't add connector (${res.status})` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Couldn't reach the backend." };
  }
}

export async function toggleCustomConnector(id: string, enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/connectors/${encodeURIComponent(id)}/toggle`, {
      method: "PATCH",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCustomConnector(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/connectors/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Google Workspace connect flow — reuses /api/integrations/google/*. */
export async function fetchGoogleStatus(): Promise<{ connected: boolean; email: string | null }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/integrations/google/status`, { headers: await authHeaders() });
    if (!res.ok) return { connected: false, email: null };
    const data = await res.json();
    return { connected: !!data.connected, email: data.email ?? null };
  } catch {
    return { connected: false, email: null };
  }
}

export async function startGoogleConnect(): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/integrations/google/init`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    const url = data?.url ?? data?.authUrl ?? data?.authorizationUrl;
    if (url) {
      window.open(url, "google-connect", "width=520,height=640");
      return;
    }
    // Backend may redirect instead of returning a URL — let the popup navigate itself.
    window.open(`${BACKEND_URL}/api/integrations/google/init`, "google-connect", "width=520,height=640");
  } catch (e) {
    console.error("[CONNECTORS] Google init failed:", e);
  }
}

export async function disconnectGoogle(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/integrations/google/disconnect`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}
