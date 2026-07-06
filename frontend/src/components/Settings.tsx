// src/components/Settings.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Upload,
  Loader2,
  Check,
  Sun,
  Moon,
  Trash2,
  Volume2,
  Play,
  Plug,
  ExternalLink,
  ChevronDown,
  Lock,
} from "lucide-react";
import { useIsMobile } from "../hooks/useMediaQuery";
import { createClient } from "../lib/client";
import { BACKEND_URL } from "../lib/config";
import { usePerformance } from "../lib/performance-context";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUserUpdate?: (user: any) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const supabase = createClient();

// ─── Font definitions ──────────────────────────────────────
const FONT_OPTIONS = [
  { value: "system",    label: "System Default",         family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: "inter",     label: "Inter (Sans‑Serif)",     family: '"Inter", system-ui, sans-serif' },
  { value: "georgia",   label: "Georgia (Serif)",        family: 'Georgia, "Times New Roman", serif' },
  { value: "jetbrains", label: "JetBrains Mono",         family: '"JetBrains Mono", "Fira Code", monospace' },
  { value: "atkinson",  label: "Atkinson Hyperlegible",  family: '"Atkinson Hyperlegible", Arial, sans-serif' },
];

function applyFont(fontValue: string) {
  const font = FONT_OPTIONS.find(f => f.value === fontValue) || FONT_OPTIONS[0];
  if (font) {
    document.documentElement.style.setProperty('--flux-chat-font', font.family);
    const chatArea = document.querySelector('.chat-message-area') as HTMLElement | null;
    if (chatArea) chatArea.style.fontFamily = font.family;
  }
}

// ─── TTS Provider definitions ──────────────────────────────
const TTS_PROVIDERS = [
  { value: "browser",   label: "Browser Built‑in",       description: "Uses your OS speech engine" },
  { value: "local",     label: "Local (Piper)",      description: "On‑device neural TTS, no internet needed" },
  { value: "pollinations", label: "Pollinations (OpenAI)", description: "OpenAI TTS via Pollinations" },
];

// ─── Helper to parse user agent ──────────────────────────────
function parseUserAgent(userAgent: string): string {
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

function timeAgo(dateString: string | null): string {
  if (!dateString) return "";
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MemoryItem = {
  id: string;
  category: string;
  fact: string;
  importance: number;
  source_conversation_id?: string;
  created_at: string;
};

// ─── Custom UI Switch component matching native screenshots ──
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5.5 rounded-full p-0.5 transition-colors focus:outline-none shrink-0"
      style={{
        background: checked ? "#cc785c" : "rgba(255,255,255,0.12)",
      }}
    >
      <motion.div
        layout
        className="size-4.5 rounded-full bg-white shadow-sm"
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        style={{
          marginLeft: checked ? "16px" : "0px",
        }}
      />
    </button>
  );
}

// ─── Custom Layout Row Component for Clean Vertical Settings ──
function SettingRow({
  label,
  subtitle,
  value,
  onClick,
  rightSlot,
  isRed,
}: {
  label: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void;
  rightSlot?: React.ReactNode;
  isRed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center justify-between py-3.5 px-4 transition-colors text-left select-none
        ${onClick ? "hover:bg-[rgba(255,255,255,0.035)] active:scale-[0.99] cursor-pointer" : ""}`}
    >
      <div className="flex-1 pr-4 min-w-0">
        <p className={`text-[13.5px] leading-snug font-sans ${isRed ? "text-red-400 font-medium" : "text-[rgba(250,249,245,0.85)]"}`}>
          {label}
        </p>
        {subtitle && (
          <p className="text-[11px] text-[rgba(250,249,245,0.4)] mt-1.5 leading-relaxed font-sans max-w-[90%]">
            {subtitle}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3.5">
        {value && (
          <span className="text-[12.5px] text-[rgba(250,249,245,0.4)] font-sans">
            {value}
          </span>
        )}
        {rightSlot}
      </div>
    </button>
  );
}

export function Settings({
  isOpen,
  onClose,
  user,
  onUserUpdate,
  isDarkMode,
  toggleTheme,
}: SettingsProps) {
  const isMobile = useIsMobile();
  const { tier, setTier } = usePerformance();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  // ─── Form State ──────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // ─── Preferences State ──────────────────────────────────────
  const [chatFont, setChatFont] = useState("system");
  const [ttsProvider, setTtsProvider] = useState("browser");
  const [ttsVoice, setTtsVoice] = useState("");
  const [browserVoices, setBrowserVoices] = useState<{ value: string; label: string }[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ─── Notifications State ──────────────────────────────────
  const [responseCompletions, setResponseCompletions] = useState(true);
  const [dispatchMessages, setDispatchMessages] = useState(false);

  // ─── Capabilities State ──────────────────────────────────────
  const [enableMemory, setEnableMemory] = useState(true);
  const [toolAccessMode, setToolAccessMode] = useState("load_tools_when_needed");
  const [connectorDiscovery, setConnectorDiscovery] = useState(false);

  // ─── Memory Manager State ────────────────────────────────────
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  // ─── Account State ──────────────────────────────────────────
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [loggingOutAllDevices, setLoggingOutAllDevices] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // ─── Integrations State ────────────────────────────────────
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleConnecting, setGoogleConnecting] = useState(false);

  // ─── Preview TTS with current settings ─────────────────────
  const previewVoice = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const sampleText = "Hello! This is how I will sound when reading answers to you.";

    if (ttsProvider === "browser") {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sampleText);
      if (ttsVoice) {
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find(v => v.voiceURI === ttsVoice);
        if (match) utterance.voice = match;
      }
      utterance.rate = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return;
    }

    if (ttsProvider === "local") {
      setIsSpeaking(true);
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token || '';
        const res = await fetch(`${BACKEND_URL}/api/tts/local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: sampleText }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          audio.play();
        } else { setIsSpeaking(false); }
      } catch { setIsSpeaking(false); }
      return;
    }

    if (ttsProvider === "pollinations") {
      setIsSpeaking(true);
      try {
        const voiceMap: Record<string, string> = {
          alloy: 'alloy', echo: 'echo', fable: 'fable', onyx: 'onyx', nova: 'nova', shimmer: 'shimmer',
        };
        const v = voiceMap[ttsVoice] || 'alloy';

        const res = await fetch('https://text.pollinations.ai/openai/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'tts-1',
            input: sampleText,
            voice: v,
          }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          audio.play();
        } else {
          setIsSpeaking(false);
        }
      } catch { setIsSpeaking(false); }
      return;
    }
  }, [ttsProvider, ttsVoice]);

  // ─── Load user data when opened ─────────────────────────────
  useEffect(() => {
    if (user && isOpen) {
      const metadata = user.user_metadata || {};
      setFullName(metadata.full_name || user.email?.split("@")[0] || "");
      setDisplayName(metadata.display_name || user.email?.split("@")[0] || "");
      setInstructions(metadata.instructions || "");
      setAvatarUrl(metadata.avatar_url || null);

      const savedFont = metadata.chat_font || "system";
      setChatFont(savedFont);
      applyFont(savedFont);

      setTtsProvider(metadata.tts_provider || "browser");
      setTtsVoice(metadata.tts_voice || "");

      setResponseCompletions(metadata.response_completions ?? true);
      setDispatchMessages(metadata.dispatch_messages ?? false);

      setEnableMemory(metadata.enable_memory ?? true);
      setToolAccessMode(metadata.tool_access_mode || "load_tools_when_needed");
      setConnectorDiscovery(metadata.connector_discovery ?? false);

      loadSessions();
      checkGoogleStatus();
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [user, isOpen]);

  // ─── Load browser voices when selected ─────────────────────
  useEffect(() => {
    if (ttsProvider === "browser" && typeof window !== 'undefined' && window.speechSynthesis) {
      const loadBrowserVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const uniqueVoices = Array.from(
          new Map(voices.map(v => [v.voiceURI, v])).values()
        );
        setBrowserVoices(
          uniqueVoices
            .filter(v => v.lang.startsWith('en'))
            .map(v => ({
              value: v.voiceURI,
              label: `${v.name} (${v.lang})`,
            }))
        );
      };
      loadBrowserVoices();
      window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
    }
  }, [ttsProvider]);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      const interval = setInterval(loadSessions, 12000); // 12s interval
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => { if (isOpen && user) loadMemories(); }, [isOpen, user]);

  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) { URL.revokeObjectURL(prevBlobUrlRef.current); prevBlobUrlRef.current = null; }
    };
  }, []);

  // ─── Load ALL sessions via RPC ─────────────────────────────
  const loadSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession) { setSessions([]); setLoadingSessions(false); return; }
      const { data, error } = await (supabase as any).rpc('get_user_sessions', { p_user_id: user.id });
      if (error) throw error;
      if (data && Array.isArray(data)) {
        setSessions(data.map((s: any) => {
          let deviceName = parseUserAgent(s.user_agent || navigator.userAgent);
          // Unmask Brave runtimes
          if (s.id === (currentSession as any).id && (navigator as any).brave?.isBrave) {
            deviceName = deviceName.replace("Chrome", "Brave");
          }
          return {
            id: s.id, device: deviceName,
            created_at: s.created_at || new Date().toISOString(),
            updated_at: s.updated_at || new Date().toISOString(),
            isCurrent: s.id === (currentSession as any).id,
          };
        }));
      } else setSessions([]);
    } catch (error) { console.error('Error loading sessions:', error); setSessions([]); }
    finally { setLoadingSessions(false); }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      const { error } = await (supabase as any).rpc('revoke_user_session', { p_session_id: sessionId });
      if (error) throw error;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setOpenMenuSessionId(null);
    } catch (error) {
      console.error('Error revoking session:', error);
      alert('Failed to revoke session.');
    }
    finally { setRevokingSessionId(null); }
  };

  const loadMemories = async () => {
    if (!user) return;
    setMemoriesLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const res = await fetch(`${BACKEND_URL}/memories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to fetch memories:', res.status, errData);
        setMemories([]);
      }
    } catch (error) {
      console.error('Error loading memories:', error);
      setMemories([]);
    } finally {
      setMemoriesLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    setDeletingMemoryId(memoryId);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const res = await fetch(`${BACKEND_URL}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== memoryId));
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
      alert('Failed to delete memory.');
    } finally {
      setDeletingMemoryId(null);
    }
  };

  // ─── Auto‑save ──────────────────────────────────────────────
  const saveSettings = useCallback(async (overrides?: Record<string, any>) => {
    if (!user) return;
    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
        finalAvatarUrl = urlData.publicUrl; setAvatarUrl(finalAvatarUrl); setAvatarFile(null);
        if (prevBlobUrlRef.current) { URL.revokeObjectURL(prevBlobUrlRef.current); prevBlobUrlRef.current = null; }
      }
      const metadata: Record<string, any> = {
        full_name: fullName, display_name: displayName, instructions: instructions,
        avatar_url: finalAvatarUrl, chat_font: chatFont,
        tts_provider: ttsProvider, tts_voice: ttsVoice,
        response_completions: responseCompletions, dispatch_messages: dispatchMessages,
        enable_memory: enableMemory, tool_access_mode: toolAccessMode, connector_discovery: connectorDiscovery,
      };
      try {
        localStorage.setItem('tts_provider', ttsProvider);
        localStorage.setItem('tts_voice', ttsVoice);
      } catch { /* localStorage not available */ }
      if (overrides && typeof overrides === "object") {
        Object.assign(metadata, overrides);
      }
      const { data, error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await supabase.auth.refreshSession(); const { data: { session: ns } } = await supabase.auth.getSession(); if (ns?.user && onUserUpdate) onUserUpdate(ns.user); }
      else if (data.user && onUserUpdate) onUserUpdate(data.user);
      setSavedMessage("Saved"); setTimeout(() => setSavedMessage(null), 1500);
    } catch (error: any) { console.error("Auto-save error:", error); setSavedMessage(`Error: ${error.message}`); setTimeout(() => setSavedMessage(null), 4000); }
  }, [user, avatarUrl, avatarFile, fullName, displayName, instructions, chatFont, ttsProvider, ttsVoice, responseCompletions, dispatchMessages, enableMemory, toolAccessMode, connectorDiscovery, onUserUpdate]);

  const debouncedSave = useCallback(() => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => saveSettings(), 800); }, [saveSettings]);

  const handleToggle = useCallback((key: string, setter: (v: boolean) => void, cv: boolean) => { const nv = !cv; setter(nv); saveSettings({ [key]: nv }); }, [saveSettings]);
  const handleSelectChange = useCallback((key: string, setter: (v: string) => void, value: string) => { setter(value); if (key === 'chat_font') applyFont(value); saveSettings({ [key]: value }); }, [saveSettings]);
  const handleTextChange = useCallback((setter: (v: string) => void, value: string) => { setter(value); debouncedSave(); }, [debouncedSave]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setAvatarFile(file); const pu = URL.createObjectURL(file); if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current); prevBlobUrlRef.current = pu; setAvatarUrl(pu); debouncedSave(); }
  };

  const handleLogoutAllDevices = async () => {
    if (!confirm("Are you sure you want to sign out of all devices?")) return;
    setLoggingOutAllDevices(true);
    try { await supabase.auth.signOut({ scope: "global" }); window.location.href = "/auth"; }
    catch (error) { console.error("Error logging out all devices:", error); alert("Failed."); }
    finally { setLoggingOutAllDevices(false); }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account?")) return;
    setDeletingAccount(true);
    try { await supabase.auth.signOut(); window.location.href = "/auth"; }
    catch (error) { console.error("Error deleting account:", error); alert("Failed."); }
    finally { setDeletingAccount(false); }
  };

  // ─── Google Integration Handlers ────────────────────────────
  const checkGoogleStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`${BACKEND_URL}/api/integrations/google/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setGoogleConnected(data.connected);
      if (data.email) setGoogleEmail(data.email);
    } catch { /* ignore */ }
  }, []);

  const handleGoogleConnect = async () => {
    try {
      setGoogleConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const initRes = await fetch(`${BACKEND_URL}/api/integrations/google/init`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(initData.error || 'Failed to initiate Google connection');
      const { url } = initData;

      const popup = window.open(url, 'google-oauth', 'width=600,height=700');
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'google-oauth-success') {
          if (event.data.success) {
            setGoogleConnected(true);
            setGoogleEmail(event.data.email || '');
          }
          window.removeEventListener('message', handler);
          setGoogleConnecting(false);
        }
      };
      window.addEventListener('message', handler);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handler);
          setGoogleConnecting(false);
        }
      }, 500);
    } catch (err: any) {
      console.error('Google connect error:', err);
      alert(err.message || 'Failed to connect Google');
      setGoogleConnecting(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`${BACKEND_URL}/api/integrations/google/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setGoogleConnected(false);
      setGoogleEmail('');
    } catch (err: any) {
      console.error('Google disconnect error:', err);
    }
  };

  const voiceList = useMemo(() => {
    if (ttsProvider === "browser") return browserVoices;
    if (ttsProvider === "local") return [{ value: "", label: "Default (lessac-medium)" }];
    if (ttsProvider === "pollinations") {
      return [
        { value: "alloy", label: "Alloy (Neutral)" }, { value: "echo", label: "Echo (Warm)" },
        { value: "fable", label: "Fable (British)" }, { value: "onyx", label: "Onyx (Deep)" },
        { value: "nova", label: "Nova (Friendly)" }, { value: "shimmer", label: "Shimmer (Soft)" },
      ];
    }
    return [];
  }, [ttsProvider, browserVoices]);

  // Dropdown style helper
  const selectClass = "bg-[#252525] border border-[rgba(255,255,255,0.08)] text-[rgba(250,249,245,0.85)] rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#cc785c] cursor-pointer min-w-[140px]";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            initial={isMobile ? { y: "100%" } : { scale: 0.96, opacity: 0, y: 12 }}
            animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1, y: 0 }}
            exit={isMobile ? { y: "100%" } : { scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`flex flex-col bg-[#121212] overflow-hidden ${
              isMobile
                ? "fixed inset-0 w-full h-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                : "w-full max-w-[620px] h-[82vh] max-h-[740px] border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-[rgba(255,255,255,0.06)] bg-[#121212]/50 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex items-center justify-center size-8 rounded-xl transition hover:bg-[rgba(255,255,255,0.05)] text-[rgba(250,249,245,0.6)] hover:text-white"
                  aria-label="Back"
                >
                  <X className="size-5" />
                </button>
                <h1 className="text-base font-bold text-white tracking-wide font-sans">Settings</h1>
              </div>
              {savedMessage && (
                <span className="text-xs text-[#cc785c] font-sans font-medium px-2 py-0.5 rounded-lg bg-[#cc785c]/10">
                  {savedMessage}
                </span>
              )}
            </div>

            {/* Scrollable Settings Panel list */}
            <div className="flex-1 overflow-y-auto pb-12 divide-y divide-[rgba(255,255,255,0.06)]" style={{ scrollbarWidth: 'none' }}>
              
              {/* Profile details */}
              <div className="py-4">
                <div className="px-5 mb-4 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Profile
                </div>
                
                {/* Avatar change */}
                <div className="flex items-center gap-4.5 px-5 py-3">
                  <div className="relative size-14 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-[rgba(250,249,245,0.6)]">
                        {fullName.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-[#cc785c] hover:opacity-85 text-left"
                    >
                      Change photo
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    <p className="text-[10px] text-[rgba(250,249,245,0.35)]">PNG, JPG or GIF up to 2MB</p>
                  </div>
                </div>

                <div className="px-5 py-2.5 flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[rgba(250,249,245,0.45)]">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => handleTextChange(setFullName, e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-xl px-3.5 py-2.5 text-xs text-[rgba(250,249,245,0.85)] outline-none focus:border-[#cc785c]/40 font-sans"
                  />
                </div>

                <div className="px-5 py-2.5 flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[rgba(250,249,245,0.45)]">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => handleTextChange(setDisplayName, e.target.value)}
                    placeholder="What should Flux call you?"
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-xl px-3.5 py-2.5 text-xs text-[rgba(250,249,245,0.85)] outline-none focus:border-[#cc785c]/40 font-sans"
                  />
                </div>

                <div className="px-5 py-2.5 flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-[rgba(250,249,245,0.45)]">Instructions for Flux</label>
                  <p className="text-[10px] text-[rgba(250,249,245,0.35)] leading-snug">
                    Instructions keep Flux tailored to your specific preferences across chats.
                  </p>
                  <textarea
                    value={instructions}
                    onChange={(e) => handleTextChange(setInstructions, e.target.value)}
                    placeholder="e.g., respond code blocks in TypeScript, explain with examples..."
                    className="w-full h-24 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-xl px-3.5 py-2.5 text-xs text-[rgba(250,249,245,0.85)] outline-none focus:border-[#cc785c]/40 resize-none font-sans"
                  />
                </div>
              </div>

              {/* Appearance */}
              <div className="py-4">
                <div className="px-5 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Appearance
                </div>
                
                <SettingRow
                  label="Dark Mode"
                  subtitle="Toggle dark theme interface styling"
                  rightSlot={<Switch checked={isDarkMode} onChange={() => { toggleTheme(); saveSettings(); }} />}
                />

                <SettingRow
                  label="Display Refresh Rate"
                  subtitle={tier === 'high' ? "Smooth transition framing (120 FPS)" : "Reduced battery performance framing (60 FPS)"}
                  rightSlot={
                    <Switch checked={tier === 'high'} onChange={() => setTier(tier === 'high' ? 'low' : 'high')} />
                  }
                />

                <SettingRow
                  label="Chat Font Style"
                  rightSlot={
                    <select
                      value={chatFont}
                      onChange={(e) => handleSelectChange("chat_font", setChatFont, e.target.value)}
                      className={selectClass}
                    >
                      {FONT_OPTIONS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  }
                />
              </div>

              {/* Speech Output */}
              <div className="py-4">
                <div className="px-5 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Audio & Speech
                </div>
                
                <SettingRow
                  label="TTS Engine Provider"
                  subtitle="Select speech synthesis provider"
                  rightSlot={
                    <select
                      value={ttsProvider}
                      onChange={(e) => {
                        setTtsProvider(e.target.value);
                        setTtsVoice('');
                        handleSelectChange("tts_provider", setTtsProvider, e.target.value);
                      }}
                      className={selectClass}
                    >
                      {TTS_PROVIDERS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  }
                />

                <SettingRow
                  label="Voice Accent Style"
                  rightSlot={
                    <div className="flex items-center gap-2">
                      <select
                        value={ttsVoice}
                        onChange={(e) => handleSelectChange("tts_voice", setTtsVoice, e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Default Voice</option>
                        {voiceList.map(v => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={previewVoice}
                        disabled={isSpeaking}
                        className="p-2 rounded-xl bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] text-white transition active:scale-95 disabled:opacity-40"
                        title="Test voice"
                      >
                        <Volume2 className="size-3.5" />
                      </button>
                    </div>
                  }
                />
              </div>

              {/* Capabilities & Brain Memory */}
              <div className="py-4">
                <div className="px-5 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Capabilities & Memory
                </div>

                <SettingRow
                  label="Enable AI Memory Bank"
                  subtitle="Allow Flux to store key facts about your context across separate sessions"
                  rightSlot={<Switch checked={enableMemory} onChange={(v) => handleToggle("enable_memory", setEnableMemory, !v)} />}
                />

                <SettingRow
                  label="Connector Auto-Discovery"
                  subtitle="Permit automated mapping of local resource directories"
                  rightSlot={<Switch checked={connectorDiscovery} onChange={(v) => handleToggle("connector_discovery", setConnectorDiscovery, !v)} />}
                />

                <SettingRow
                  label="Tool Integration Execution"
                  rightSlot={
                    <select
                      value={toolAccessMode}
                      onChange={(e) => handleSelectChange("tool_access_mode", setToolAccessMode, e.target.value)}
                      className={selectClass}
                    >
                      <option value="load_tools_when_needed">On-demand Loading</option>
                      <option value="load_tools_upfront">Pre-load Instantly</option>
                    </select>
                  }
                />

                {/* Manage Memory bank inline accordion */}
                <div className="px-1.5">
                  <SettingRow
                    label="Manage Personal Memory Bank"
                    subtitle={`${memories.length} facts saved in memory bank`}
                    onClick={() => setShowMemoryManager(m => !m)}
                    rightSlot={<ChevronDown className={`size-4 transition-transform duration-200 ${showMemoryManager ? "rotate-180" : ""}`} />}
                  />
                  
                  <AnimatePresence>
                    {showMemoryManager && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3.5 pb-3 pt-1 space-y-2 overflow-hidden"
                      >
                        {memoriesLoading ? (
                          <p className="text-xs text-[rgba(250,249,245,0.4)] animate-pulse">Loading facts...</p>
                        ) : memories.length === 0 ? (
                          <p className="text-xs text-[rgba(250,249,245,0.45)]">Memory bank is empty. Start chatting to save facts.</p>
                        ) : (
                          <div className="max-h-[220px] overflow-y-auto space-y-1.5 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-2">
                            {memories.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs text-[rgba(250,249,245,0.8)] leading-relaxed truncate-2-lines">
                                    {m.fact}
                                  </p>
                                  <span className="text-[9.5px] uppercase tracking-wider text-[#cc785c]/80 font-semibold font-sans mt-0.5 block">
                                    {m.category}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMemory(m.id)}
                                  disabled={deletingMemoryId === m.id}
                                  className="p-1.5 rounded-lg text-[rgba(250,249,245,0.4)] hover:text-red-400 hover:bg-red-500/10 transition"
                                  title="Forget fact"
                                >
                                  {deletingMemoryId === m.id ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Integrations */}
              <div className="py-4">
                <div className="px-5 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Integrations
                </div>
                
                <SettingRow
                  label="Google Drive & Docs"
                  subtitle={googleConnected ? `Connected as ${googleEmail}` : "Connect your Google account to let Flux read files"}
                  rightSlot={
                    <button
                      type="button"
                      onClick={googleConnected ? handleGoogleDisconnect : handleGoogleConnect}
                      disabled={googleConnecting}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5
                        ${googleConnected
                          ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                          : "bg-[#cc785c]/10 border border-[#cc785c]/20 text-[#cc785c] hover:bg-[#cc785c]/20"
                        }`}
                    >
                      {googleConnecting && <Loader2 className="size-3 animate-spin" />}
                      {googleConnected ? "Disconnect" : "Connect"}
                      {!googleConnected && <Plug className="size-3" />}
                    </button>
                  }
                />
              </div>

              {/* Active Sessions & Security */}
              <div className="py-4">
                <div className="px-5 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#cc785c]/80 font-sans">
                  Account & Devices
                </div>
                
                <SettingRow
                  label="Email ID"
                  value={user?.email || "Unknown"}
                />

                <SettingRow
                  label="Two-factor authentication"
                  value="Disabled"
                  rightSlot={<Lock className="size-3.5 text-[rgba(250,249,245,0.3)]" />}
                />

                {/* Login session history */}
                <div className="px-5 py-3">
                  <span className="text-[11.5px] font-semibold text-[rgba(250,249,245,0.6)]">Active Devices</span>
                  <div className="mt-2.5 space-y-2 max-h-[160px] overflow-y-auto rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-2">
                    {loadingSessions && sessions.length === 0 ? (
                      <p className="text-xs text-[rgba(250,249,245,0.4)] animate-pulse">Loading login sessions...</p>
                    ) : (
                      sessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white leading-tight truncate">
                              {s.device}
                              {s.isCurrent && (
                                <span className="ml-1.5 text-[9px] font-bold bg-[#cc785c]/10 text-[#cc785c] px-1.5 py-0.5 rounded-md">
                                  Current
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-[rgba(250,249,245,0.4)] leading-tight mt-0.5 truncate">
                              Activity: {timeAgo(s.updated_at)}
                            </p>
                          </div>
                          {!s.isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(s.id)}
                              disabled={revokingSessionId === s.id}
                              className="text-[10.5px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-40 transition"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Account deletion and global logout actions */}
                <div className="mt-2">
                  <SettingRow
                    label="Sign out of all devices"
                    subtitle="Log out of this browser and revoke all secondary auth tokens globally"
                    onClick={handleLogoutAllDevices}
                    isRed={true}
                  />

                  <SettingRow
                    label="Delete Account permanently"
                    subtitle="Erase all conversations, files, custom configurations, and settings"
                    onClick={handleDeleteAccount}
                    isRed={true}
                  />
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
