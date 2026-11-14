// src/components/Settings.tsx
import { motion, AnimatePresence } from "framer-motion";
import { applyFont, parseUserAgent, getSupabase } from "./settingsOptions";
import { GeneralTab } from "./tabs/GeneralTab";
import { AccountTab } from "./tabs/AccountTab";
import { CapabilitiesTab } from "./tabs/CapabilitiesTab";
import { IntegrationsTab } from "./tabs/IntegrationsTab";
import type { MemoryItem } from "./settingsMemory";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { User, Shield, Brain, Plug } from "lucide-react";
import { IconCheck, IconClose } from "../layout/anthropicIcons.tsx";
import { createClient } from "../../lib/client";
import { BACKEND_URL } from "../../lib/config";
import { usePerformance } from "../../lib/performance-context";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUserUpdate?: (user: any) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export function Settings({
  isOpen,
  onClose,
  user,
  onUserUpdate,
  isDarkMode,
  toggleTheme,
}: SettingsProps) {
  const { tier, setTier } = usePerformance();
  const [activeTab, setActiveTab] = useState("General");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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
        const token = (await getSupabase().auth.getSession()).data.session?.access_token || '';
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
    if (isOpen && activeTab === "Account") {
      loadSessions();
      const interval = setInterval(loadSessions, 12000); // 12s interval
      return () => clearInterval(interval);
    }
  }, [isOpen, activeTab]);

  useEffect(() => { if (activeTab === "Capabilities" && user) loadMemories(); }, [activeTab, user]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) { URL.revokeObjectURL(prevBlobUrlRef.current); prevBlobUrlRef.current = null; }
    };
  }, []);

  // ─── Load ALL sessions via RPC ─────────────────────────────
  const loadSessions = async () => {
    if (!user) return; setLoadingSessions(true);
    try {
      const { data: { session: currentSession }, error: sessionError } = await getSupabase().auth.getSession();
      if (sessionError || !currentSession) { setSessions([]); setLoadingSessions(false); return; }
      const { data, error } = await getSupabase().rpc('get_user_sessions', { p_user_id: user.id });
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
      const { error } = await getSupabase().rpc('revoke_user_session', { p_session_id: sessionId });
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
      const token = (await getSupabase().auth.getSession()).data.session?.access_token || '';
      
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
      const token = (await getSupabase().auth.getSession()).data.session?.access_token || '';
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
        const { error: uploadError } = await getSupabase().storage.from("avatars").upload(fileName, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = getSupabase().storage.from("avatars").getPublicUrl(fileName);
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
      const { data, error } = await getSupabase().auth.updateUser({ data: metadata });
      if (error) throw error;
      const { data: { session } } = await getSupabase().auth.getSession();
      if (session) { await getSupabase().auth.refreshSession(); const { data: { session: ns } } = await getSupabase().auth.getSession(); if (ns?.user && onUserUpdate) onUserUpdate(ns.user); }
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
    try { await getSupabase().auth.signOut({ scope: "global" }); window.location.href = "/auth"; }
    catch (error) { console.error("Error logging out all devices:", error); alert("Failed."); }
    finally { setLoggingOutAllDevices(false); }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account?")) return;
    setDeletingAccount(true);
    try { await getSupabase().auth.signOut(); window.location.href = "/auth"; }
    catch (error) { console.error("Error deleting account:", error); alert("Failed."); }
    finally { setDeletingAccount(false); }
  };

  // ─── Google Integration Handlers ────────────────────────────
  const checkGoogleStatus = useCallback(async () => {
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
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
      const { data: { session } } = await getSupabase().auth.getSession();
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
      const { data: { session } } = await getSupabase().auth.getSession();
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

  const tabs = useMemo(() => [
    { id: "General", icon: <User className="size-4" />, label: "General" },
    { id: "Account", icon: <Shield className="size-4" />, label: "Account" },
    { id: "Capabilities", icon: <Brain className="size-4" />, label: "Capabilities" },
    { id: "Integrations", icon: <Plug className="size-4" />, label: "Integrations" },
  ], []);

  // ── Voice list for current provider ────────────────────────
  // For browser: populated by useEffect listening to voiceschanged
  // For local/pollinations: static lists
  const voiceList: { value: string; label: string }[] = useMemo(() => {
    if (ttsProvider === "browser") {
      return browserVoices;
    }
    if (ttsProvider === "local") {
      return [{ value: "", label: "Default (lessac-medium)" }];
    }
    if (ttsProvider === "pollinations") {
      return [
        { value: "alloy", label: "Alloy (Neutral)" }, { value: "echo", label: "Echo (Warm)" },
        { value: "fable", label: "Fable (British)" }, { value: "onyx", label: "Onyx (Deep)" },
        { value: "nova", label: "Nova (Friendly F)" }, { value: "shimmer", label: "Shimmer (F)" },
      ];
    }
    return [];
  }, [ttsProvider, browserVoices]);

  const selectClass = `
    bg-[var(--bg-secondary)]
    text-[var(--text-primary)]
    rounded-lg px-4 py-2 text-sm font-medium
    border border-[var(--surface-border)] outline-none
    cursor-pointer
    focus:ring-2 focus:ring-[var(--accent)]/40
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
            className={`${isMobile ? "fixed inset-0 w-full h-full rounded-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "h-[80vh] max-h-[800px] w-full max-w-4xl"} flex flex-col sm:flex-row bg-[var(--bg-primary)] backdrop-blur-xl border-[var(--surface-border)] rounded-lg shadow-2xl overflow-hidden`}
          >
            {/* Left Sidebar */}
            <div className={`${isMobile ? "w-full border-b border-[var(--surface-border)] bg-[var(--bg-secondary)]/80 px-3 py-2.5 gap-1.5 overflow-x-auto no-scrollbar sticky top-0 z-10 flex items-center" : "w-56 flex-shrink-0 border-r border-white/10 dark:border-white/5 bg-white/60 dark:bg-[var(--bg-secondary)] backdrop-blur-xl p-2 flex flex-col h-full"}`}>
              <div className="flex items-center justify-between px-3 py-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all duration-200 text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]"><IconClose className="size-5" /></button>
              </div>
              <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowMemoryManager(false); }}
                      className={`${isMobile ? "whitespace-nowrap px-3.5 py-2 text-xs font-medium rounded-lg" : "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm"} transition-all duration-200 ${activeTab === tab.id ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold shadow-sm" : "text-[var(--text-primary)]/50 hover:bg-[var(--surface-border)]/30 hover:text-[var(--text-primary)]"}`}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-white/10 dark:border-white/5">
                <AnimatePresence>
                  {savedMessage && (
                    <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
                      className={`flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${savedMessage.startsWith("Error") ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"}`}>
                      <IconCheck className="size-3" />{savedMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right Content */}
            <div className={`flex-1 overflow-y-auto ${isMobile ? "px-4 pt-4 pb-8" : "p-8"} custom-scrollbar`}>
              {activeTab === "General" && (
                <GeneralTab
                  user={user}
                  avatarUrl={avatarUrl}
                  fileInputRef={fileInputRef}
                  handleAvatarChange={handleAvatarChange}
                  fullName={fullName}
                  setFullName={setFullName}
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                  instructions={instructions}
                  setInstructions={setInstructions}
                  handleTextChange={handleTextChange}
                  isDarkMode={isDarkMode}
                  toggleTheme={toggleTheme}
                  saveSettings={saveSettings}
                  tier={tier}
                  setTier={setTier}
                  chatFont={chatFont}
                  setChatFont={setChatFont}
                  handleSelectChange={handleSelectChange}
                  ttsProvider={ttsProvider}
                  setTtsProvider={setTtsProvider}
                  setTtsVoice={setTtsVoice}
                  ttsVoice={ttsVoice}
                  voicesLoading={voicesLoading}
                  voiceList={voiceList}
                  previewVoice={previewVoice}
                  isSpeaking={isSpeaking}
                  responseCompletions={responseCompletions}
                  setResponseCompletions={setResponseCompletions}
                  dispatchMessages={dispatchMessages}
                  setDispatchMessages={setDispatchMessages}
                  handleToggle={handleToggle}
                  selectClass={selectClass}
                />
              )}
              {/* Account Tab */}
              {activeTab === "Account" && (
                <AccountTab
                  user={user}
                  handleLogoutAllDevices={handleLogoutAllDevices}
                  loggingOutAllDevices={loggingOutAllDevices}
                  handleDeleteAccount={handleDeleteAccount}
                  deletingAccount={deletingAccount}
                  loadingSessions={loadingSessions}
                  sessions={sessions}
                  openMenuSessionId={openMenuSessionId}
                  setOpenMenuSessionId={setOpenMenuSessionId}
                  handleRevokeSession={handleRevokeSession}
                  revokingSessionId={revokingSessionId}
                />
              )}
              {/* Capabilities Tab */}
              {activeTab === "Capabilities" && (
                <CapabilitiesTab
                  showMemoryManager={showMemoryManager}
                  setShowMemoryManager={setShowMemoryManager}
                  enableMemory={enableMemory}
                  setEnableMemory={setEnableMemory}
                  handleToggle={handleToggle}
                  memories={memories}
                  memoriesLoading={memoriesLoading}
                  debugInfo={debugInfo}
                  loadMemories={loadMemories}
                  handleDeleteMemory={handleDeleteMemory}
                  deletingMemoryId={deletingMemoryId}
                  toolAccessMode={toolAccessMode}
                  setToolAccessMode={setToolAccessMode}
                  handleSelectChange={handleSelectChange}
                  connectorDiscovery={connectorDiscovery}
                  setConnectorDiscovery={setConnectorDiscovery}
                  selectClass={selectClass}
                />
              )}
              {/* Integrations Tab */}
              {activeTab === "Integrations" && (
                <IntegrationsTab
                  googleConnected={googleConnected}
                  googleEmail={googleEmail}
                  googleConnecting={googleConnecting}
                  handleGoogleConnect={handleGoogleConnect}
                  handleGoogleDisconnect={handleGoogleDisconnect}
                />
              )}

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
