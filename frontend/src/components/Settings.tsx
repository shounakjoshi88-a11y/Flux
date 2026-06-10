// src/components/Settings.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  User,
  Shield,
  X,
  Upload,
  Loader2,
  Check,
  Sun,
  Moon,
  Brain,
  LogOut,
  MoreVertical,
  Trash2,
  ArrowLeft,
  Volume2,
  Play,
} from "lucide-react";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";

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
  { value: "edge",      label: "Edge TTS (Microsoft)",   description: "200+ neural voices, free" },
  { value: "kokoro",    label: "Kokoro (Local AI)",      description: "Self‑hosted, OpenAI‑compatible" },
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

type MemoryItem = {
  id: string;
  category: string;
  fact: string;
  importance: number;
  source_conversation_id?: string;
  created_at: string;
};

interface VoiceOption {
  name: string;
  shortName: string;
  locale: string;
  gender: string;
}

export function Settings({
  isOpen,
  onClose,
  user,
  onUserUpdate,
  isDarkMode,
  toggleTheme,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState("General");
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
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [kokoroUrl, setKokoroUrl] = useState("http://localhost:3000");

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

  // ─── Fetch Edge TTS voices ──────────────────────────────────
  const fetchEdgeVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const res = await fetch(`${BACKEND_URL}/api/tts/voices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableVoices(data.voices || []);
      }
    } catch { /* ignore */ }
    finally { setVoicesLoading(false); }
  }, []);

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

    if (ttsProvider === "edge") {
      setIsSpeaking(true);
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token || '';
        const res = await fetch(`${BACKEND_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: sampleText, voice: ttsVoice || 'en-US-JennyNeural' }),
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

    if (ttsProvider === "kokoro") {
      setIsSpeaking(true);
      try {
        const res = await fetch(`${kokoroUrl}/api/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'model_q8f16', input: sampleText, voice: ttsVoice || 'af_heart' }),
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
  }, [ttsProvider, ttsVoice, kokoroUrl]);

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
      setKokoroUrl(metadata.kokoro_url || "http://localhost:3000");

      setResponseCompletions(metadata.response_completions ?? true);
      setDispatchMessages(metadata.dispatch_messages ?? false);

      setEnableMemory(metadata.enable_memory ?? true);
      setToolAccessMode(metadata.tool_access_mode || "load_tools_when_needed");
      setConnectorDiscovery(metadata.connector_discovery ?? false);

      loadSessions();
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [user, isOpen]);

  // ─── Fetch voices when Edge TTS provider is selected ────────
  useEffect(() => {
    if (ttsProvider === "edge") fetchEdgeVoices();
    else if (ttsProvider === "browser" && typeof window !== 'undefined' && window.speechSynthesis) {
      const loadBrowserVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        // De-duplicate matching voiceURI nodes to prevent duplicate key panics
        const uniqueVoices = Array.from(
          new Map(voices.map(v => [v.voiceURI, v])).values()
        );
        setAvailableVoices(
          uniqueVoices
            .filter(v => v.lang.startsWith('en'))
            .map(v => ({
              name: v.name, shortName: v.voiceURI, locale: v.lang, gender: 'Unknown',
            }))
        );
      };
      loadBrowserVoices();
      window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
    }
  }, [ttsProvider, fetchEdgeVoices]);

  useEffect(() => {
    if (isOpen && activeTab === "Account") {
      loadSessions();
      const interval = setInterval(loadSessions, 12000); // 12s interval
      return () => clearInterval(interval);
    }
  }, [isOpen, activeTab]);

  useEffect(() => { if (activeTab === "Capabilities" && user) loadMemories(); }, [activeTab, user]);

  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) { URL.revokeObjectURL(prevBlobUrlRef.current); prevBlobUrlRef.current = null; }
    };
  }, []);

  // ─── Load ALL sessions via RPC ─────────────────────────────
  const loadSessions = async () => {
    if (!user) return; setLoadingSessions(true);
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession) { setSessions([]); setLoadingSessions(false); return; }
      const { data, error } = await supabase.rpc('get_user_sessions', { p_user_id: user.id });
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
    // Relocated setOpenMenuSessionId(null) to the success block
    try {
      const { error } = await supabase.rpc('revoke_user_session', { p_session_id: sessionId });
      if (error) throw error;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setOpenMenuSessionId(null); // Finalize UI only on success
    } catch (error) { 
      console.error('Error revoking session:', error); 
      alert('Failed to revoke session.'); 
    }
    finally { setRevokingSessionId(null); }
  };

  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  const loadMemories = async () => {
    if (!user) return; setMemoriesLoading(true);
    setDebugError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      
      // Also fetch whoami for debugging
      fetch(`${BACKEND_URL}/whoami`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async r => {
          if (!r.ok) throw new Error(`Status ${r.status}`);
          return r.json();
        })
        .then(setDebugInfo)
        .catch(err => {
          console.error('Debug fetch failed:', err);
          setDebugError(err.message);
        });

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
        tts_provider: ttsProvider, tts_voice: ttsVoice, kokoro_url: kokoroUrl,
        response_completions: responseCompletions, dispatch_messages: dispatchMessages,
        enable_memory: enableMemory, tool_access_mode: toolAccessMode, connector_discovery: connectorDiscovery,
      };
      if (overrides) Object.assign(metadata, overrides);
      const { data, error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await supabase.auth.refreshSession(); const { data: { session: ns } } = await supabase.auth.getSession(); if (ns?.user && onUserUpdate) onUserUpdate(ns.user); }
      else if (data.user && onUserUpdate) onUserUpdate(data.user);
      setSavedMessage("Saved"); setTimeout(() => setSavedMessage(null), 1500);
    } catch (error: any) { console.error("Auto-save error:", error); setSavedMessage(`Error: ${error.message}`); setTimeout(() => setSavedMessage(null), 4000); }
  }, [user, avatarUrl, avatarFile, fullName, displayName, instructions, chatFont, ttsProvider, ttsVoice, kokoroUrl, responseCompletions, dispatchMessages, enableMemory, toolAccessMode, connectorDiscovery, onUserUpdate]);

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

  const tabs = useMemo(() => [
    { id: "General", icon: <User className="size-4" />, label: "General" },
    { id: "Account", icon: <Shield className="size-4" />, label: "Account" },
    { id: "Capabilities", icon: <Brain className="size-4" />, label: "Capabilities" },
  ], []);

  // ── Voice list for current provider ────────────────────────
  const voiceList: { value: string; label: string }[] = useMemo(() => {
    if (ttsProvider === "browser" || ttsProvider === "edge") {
      return availableVoices.map(v => ({ value: v.shortName, label: `${v.name} (${v.locale})` }));
    }
    if (ttsProvider === "kokoro") {
      return [
        { value: "af_heart", label: "Heart (American F)" }, { value: "af_bella", label: "Bella (American F)" },
        { value: "af_nicole", label: "Nicole (American F)" }, { value: "af_sarah", label: "Sarah (American F)" },
        { value: "af_sky", label: "Sky (American F)" }, { value: "am_adam", label: "Adam (American M)" },
        { value: "am_michael", label: "Michael (American M)" }, { value: "bf_emma", label: "Emma (British F)" },
        { value: "bf_isabella", label: "Isabella (British F)" }, { value: "bm_george", label: "George (British M)" },
        { value: "bm_lewis", label: "Lewis (British M)" },
      ];
    }
    if (ttsProvider === "pollinations") {
      return [
        { value: "alloy", label: "Alloy (Neutral)" }, { value: "echo", label: "Echo (Warm)" },
        { value: "fable", label: "Fable (British)" }, { value: "onyx", label: "Onyx (Deep)" },
        { value: "nova", label: "Nova (Friendly F)" }, { value: "shimmer", label: "Shimmer (F)" },
      ];
    }
    return [];
  }, [ttsProvider, availableVoices]);

  // ── Common select style that matches the theme ──────────────
  const selectClass = `
    bg-neutral-200 dark:bg-neutral-700
    text-neutral-800 dark:text-neutral-200
    rounded-xl px-4 py-2 text-sm font-medium
    border-none outline-none
    cursor-pointer
    focus:ring-2 focus:ring-blue-500/40
    transition
  `;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="h-[80vh] max-h-[800px] w-full max-w-4xl flex bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-white/20 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Left Sidebar */}
            <div className="w-56 flex-shrink-0 border-r border-white/10 dark:border-white/5 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl p-2 flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-4">
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Settings</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-all duration-200 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white"><X className="size-5" /></button>
              </div>
              <div className="space-y-1 flex-1 overflow-y-auto">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowMemoryManager(false); }}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${activeTab === tab.id ? "bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 font-medium shadow-sm" : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"}`}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-white/10 dark:border-white/5">
                <AnimatePresence>
                  {savedMessage && (
                    <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
                      className={`flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${savedMessage.startsWith("Error") ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"}`}>
                      <Check className="size-3" />{savedMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right Content */}
            <div className="flex-1 overflow-y-auto p-8">
              {activeTab === "General" && (
                <div className="space-y-10 max-w-2xl mx-auto">
                  {/* Profile */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">Profile</h3>
                    <div className="space-y-5">
                      <div className="flex items-center gap-5">
                        <div className="relative size-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-400/10 dark:to-purple-400/10 ring-2 ring-white/50 dark:ring-white/10 flex items-center justify-center text-2xl font-bold overflow-hidden shadow-sm">
                          {avatarUrl ? (<img src={avatarUrl} alt="Avatar" className="size-full object-cover" />) : (<span className="text-neutral-600 dark:text-neutral-300">{fullName.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "?"}</span>)}
                        </div>
                        <div>
                          <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition font-medium"><Upload className="size-4" />Change avatar</button>
                          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">JPG, PNG, GIF • Max 2MB</p>
                        </div>
                      </div>
                      <div><label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 block mb-1.5">Full name</label><input type="text" value={fullName} onChange={(e) => handleTextChange(setFullName, e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-blue-500/40 focus:bg-white dark:focus:bg-neutral-800 outline-none text-sm transition-all duration-200 placeholder:text-neutral-400" placeholder="Your full name" /></div>
                      <div><label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 block mb-1.5">What should Flux call you?</label><input type="text" value={displayName} onChange={(e) => handleTextChange(setDisplayName, e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-blue-500/40 focus:bg-white dark:focus:bg-neutral-800 outline-none text-sm transition-all duration-200 placeholder:text-neutral-400" placeholder="Your display name" /></div>
                      <div><label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 block mb-2">Instructions for Flux</label><p className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">Flux will keep these in mind across all conversations.</p><textarea value={instructions} onChange={(e) => handleTextChange(setInstructions, e.target.value)} placeholder="e.g. ask clarifying questions..." className="w-full h-32 px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-blue-500/40 focus:bg-white dark:focus:bg-neutral-800 outline-none text-sm resize-none transition-all duration-200 placeholder:text-neutral-400" /></div>
                    </div>
                  </div>

                  {/* Preferences */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">Preferences</h3>
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Appearance</span>
                        <button onClick={() => { toggleTheme(); saveSettings(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-200 text-sm font-medium">
                          {isDarkMode ? (<><Sun className="size-4" /><span>Light</span></>) : (<><Moon className="size-4" /><span>Dark</span></>)}
                        </button>
                      </div>

                      {/* Fonts */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Chat font</span>
                        <select value={chatFont} onChange={(e) => handleSelectChange("chat_font", setChatFont, e.target.value)} className={selectClass}>
                          {FONT_OPTIONS.map(f => (<option key={f.value} value={f.value}>{f.label}</option>))}
                        </select>
                      </div>

                      {/* TTS */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Text‑to‑Speech</span>
                          <select value={ttsProvider} onChange={(e) => { setTtsProvider(e.target.value); setTtsVoice(''); handleSelectChange("tts_provider", setTtsProvider, e.target.value); }} className={selectClass}>
                            {TTS_PROVIDERS.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          {voicesLoading ? (
                            <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="size-3 animate-spin" />Loading voices...</div>
                          ) : (
                            <select value={ttsVoice} onChange={(e) => handleSelectChange("tts_voice", setTtsVoice, e.target.value)} className={`${selectClass} flex-1`}>
                              <option value="">{ttsProvider === 'edge' ? 'Select voice...' : ttsProvider === 'kokoro' ? 'Select voice...' : ttsProvider === 'pollinations' ? 'Select voice...' : 'Default voice'}</option>
                              {voiceList.map(v => (<option key={v.value} value={v.value}>{v.label}</option>))}
                            </select>
                          )}
                          <button onClick={previewVoice} disabled={isSpeaking}
                            className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50 shrink-0"
                            title="Preview voice">
                            {isSpeaking ? <Volume2 className="size-4 animate-pulse text-blue-500" /> : <Play className="size-4" />}
                          </button>
                        </div>
                        {ttsProvider === "kokoro" && (
                          <div className="mt-2">
                            <label className="text-xs text-neutral-500 block mb-1">Kokoro server URL</label>
                            <input type="text" value={kokoroUrl} onChange={(e) => { setKokoroUrl(e.target.value); debouncedSave(); }}
                              className="w-full px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-transparent focus:border-blue-500/40 outline-none text-xs" placeholder="http://localhost:3000" />
                          </div>
                        )}
                        <p className="text-[10px] text-neutral-400 mt-1.5">{TTS_PROVIDERS.find(p => p.value === ttsProvider)?.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Notifications */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">Notifications</h3>
                    <div className="space-y-5">
                      <ToggleRow label="Response completions" description="Get notified when Flux has finished a response." enabled={responseCompletions} onToggle={() => handleToggle("response_completions", setResponseCompletions, responseCompletions)} />
                      <ToggleRow label="Dispatch messages" description="Get a push notification on your phone when Flux messages you in Dispatch." enabled={dispatchMessages} onToggle={() => handleToggle("dispatch_messages", setDispatchMessages, dispatchMessages)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === "Account" && (
                <div className="space-y-8 max-w-2xl mx-auto">
                  <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">Account</h3>
                  <div className="space-y-5">
                    <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Log out of all devices</span><button onClick={handleLogoutAllDevices} disabled={loggingOutAllDevices} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-sm font-medium transition-all duration-200 disabled:opacity-50">{loggingOutAllDevices ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Log out</button></div>
                    <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Delete your account</span><button onClick={handleDeleteAccount} disabled={deletingAccount} className="px-4 py-2 rounded-xl bg-white dark:bg-black hover:bg-gray-100 dark:hover:bg-neutral-800 text-black dark:text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 border border-neutral-200 dark:border-neutral-800">{deletingAccount ? <Loader2 className="size-4 animate-spin" /> : "Delete account"}</button></div>
                    <div className="flex items-center justify-between py-1"><span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Organization ID</span><div className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-xs font-mono text-neutral-500">{user?.id || "Not available"}</div></div>
                  </div>
                  <div className="pt-6">
                    <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">Active sessions</h4>
                    {loadingSessions ? (<div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>) : sessions.length === 0 ? (<p className="text-sm text-neutral-500">No active sessions found.</p>) : (
                      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                        <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/50"><th className="px-5 py-3 font-medium">Device</th><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Updated</th><th className="px-5 py-3 w-10"></th></tr></thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {sessions.map((session) => (
                              <tr key={session.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors duration-150">
                                <td className="px-5 py-3"><div className="flex items-center gap-2"><span className="font-medium text-neutral-800 dark:text-neutral-200">{session.device}</span>{session.isCurrent && (<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium">Current</span>)}</div></td>
                                <td className="px-5 py-3 text-neutral-500">{new Date(session.created_at).toLocaleString()}</td>
                                <td className="px-5 py-3 text-neutral-500">{new Date(session.updated_at).toLocaleString()}</td>
                                <td className="px-5 py-3 text-right relative">
                                  {!session.isCurrent && (
                                    <div className="relative inline-block">
                                      <button onClick={() => setOpenMenuSessionId(openMenuSessionId === session.id ? null : session.id)} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all duration-200 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"><MoreVertical className="size-4" /></button>
                                      <AnimatePresence>
                                        {openMenuSessionId === session.id && (
                                          <motion.div initial={{ opacity: 0, scale: 0.95, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 4 }} className="absolute right-0 bottom-full mb-1 w-36 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xl z-10 overflow-hidden">
                                            <button onClick={() => handleRevokeSession(session.id)} disabled={revokingSessionId === session.id} className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition flex items-center gap-2">{revokingSessionId === session.id ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}Sign out</button>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Capabilities Tab */}
              {activeTab === "Capabilities" && !showMemoryManager && (
                <div className="space-y-10 max-w-2xl mx-auto">
                  <div><h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">Memory</h3><div className="space-y-5"><ToggleRow label="Generate memory from chat history" description="Allow Flux to remember relevant context from your chats." enabled={enableMemory} onToggle={() => handleToggle("enable_memory", setEnableMemory, enableMemory)} /><button className="w-full text-left px-5 py-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 flex items-center justify-between text-sm" onClick={() => { setShowMemoryManager(true); loadMemories(); }}><span className="font-medium text-neutral-700 dark:text-neutral-300">View and manage memory</span><span className="text-xs text-neutral-400">{memories.length > 0 ? `${memories.length} items` : 'Empty'}</span></button></div></div>
                  <div><h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">General</h3><div className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tool access mode</p><p className="text-xs text-neutral-500 mt-0.5">Controls how connector tools are loaded in new conversations.</p></div><select value={toolAccessMode} onChange={(e) => handleSelectChange("tool_access_mode", setToolAccessMode, e.target.value)} className={selectClass}><option value="load_tools_when_needed">Load when needed</option><option value="always_allow">Always allow</option><option value="manual">Manual approval</option></select></div><ToggleRow label="Connector discovery" description="Let Flux surface connectors from the directory that may be relevant to your conversation." enabled={connectorDiscovery} onToggle={() => handleToggle("connector_discovery", setConnectorDiscovery, connectorDiscovery)} /></div></div>
                </div>
              )}

              {activeTab === "Capabilities" && showMemoryManager && (
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => setShowMemoryManager(false)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition">
                      <ArrowLeft className="size-4" />
                    </button>
                    <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Memory Manager</h3>
                  </div>
                  
                  {debugInfo && (
                    <div className="mb-4 p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono text-neutral-500 overflow-hidden">
                      <p>appUserId: {debugInfo.appUserId}</p>
                      <p>supabaseId: {debugInfo.supabaseUserId}</p>
                      <p>email: {debugInfo.email}</p>
                    </div>
                  )}

                  {memoriesLoading ? (<div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>) : memories.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500">
                      <Brain className="size-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No memories stored yet.</p>
                      <p className="text-xs mt-1 mb-4">Memories are automatically created when you chat with Flux.</p>
                      <button onClick={loadMemories} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-600 text-xs font-medium hover:bg-blue-500/20 transition">
                        Retry Fetch
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">{memories.map((memory) => (<div key={memory.id} className="flex items-start justify-between gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 transition-all duration-200 group"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">{memory.category}</span><span className="text-[10px] text-neutral-400">{Math.round(memory.importance * 100)}% importance</span></div><p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{memory.fact}</p><p className="text-[10px] text-neutral-400 mt-1.5">{new Date((memory as any).createdAt || memory.created_at || new Date()).toLocaleString()}</p></div><button onClick={() => handleDeleteMemory(memory.id)} disabled={deletingMemoryId === memory.id} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-neutral-400 hover:text-red-500 transition-all duration-200 opacity-0 group-hover:opacity-100 flex-shrink-0">{deletingMemoryId === memory.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button></div>))}</div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Reusable accessible toggle row ─────────────────────────
function ToggleRow({ label, description, enabled, onToggle }: { label: string; description?: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</p>{description && (<p className="text-xs text-neutral-500 mt-0.5">{description}</p>)}</div>
      <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${enabled ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${enabled ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
