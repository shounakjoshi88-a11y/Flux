/**
 * Shared settings options and helpers.
 *
 * Extracted from `features/settings/Settings.tsx`: the font list, the
 * text-to-speech provider list, the helpers that apply them, the user-agent
 * parser used to label sessions, and the memory row type.
 */
import { createClient } from "@/lib/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lazily created Supabase client shared by the settings screens. */
let _supabase: ReturnType<typeof createClient> | null = null;

/** The shared Supabase client. */
export function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

// ─── Font definitions ──────────────────────────────────────
export const FONT_OPTIONS = [
  { value: "system",    label: "System Default",         family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: "inter",     label: "Inter (Sans‑Serif)",     family: '"Inter", system-ui, sans-serif' },
  { value: "georgia",   label: "Georgia (Serif)",        family: 'Georgia, "Times New Roman", serif' },
  { value: "jetbrains", label: "JetBrains Mono",         family: '"JetBrains Mono", "Fira Code", monospace' },
  { value: "atkinson",  label: "Atkinson Hyperlegible",  family: '"Atkinson Hyperlegible", Arial, sans-serif' },
];

export function applyFont(fontValue: string) {
  const font = FONT_OPTIONS.find(f => f.value === fontValue) || FONT_OPTIONS[0];
  if (font) {
    document.documentElement.style.setProperty('--flux-chat-font', font.family);
    const chatArea = document.querySelector('.chat-message-area') as HTMLElement | null;
    if (chatArea) chatArea.style.fontFamily = font.family;
  }
}

// ─── TTS Provider definitions ──────────────────────────────
export const TTS_PROVIDERS = [
  { value: "browser",   label: "Browser Built‑in",       description: "Uses your OS speech engine" },
  { value: "local",     label: "Local (Piper)",      description: "On‑device neural TTS, no internet needed" },
  { value: "pollinations", label: "Pollinations (OpenAI)", description: "OpenAI TTS via Pollinations" },
];

// ─── Helper to parse user agent ──────────────────────────────
export function parseUserAgent(userAgent: string): string {
  if (!userAgent) return "Unknown device";
  let browser = "Unknown";
  if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("OPR/") || userAgent.includes("Opera")) browser = "Opera";
  else if (userAgent.includes("Brave")) browser = "Brave";
  else if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";
  let os = "Unknown OS";
  if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
  else if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac") || userAgent.includes("Macintosh")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  return `${browser} (${os})`;
}
