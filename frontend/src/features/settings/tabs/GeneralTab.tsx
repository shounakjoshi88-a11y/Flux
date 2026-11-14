/**
 * GeneralTab — the General settings panel.
 *
 * Extracted from `features/settings/Settings.tsx`: the profile block (avatar,
 * names, custom instructions), the appearance / performance / font /
 * text-to-speech preferences and the notification toggles.
 */
import type { RefObject, ChangeEvent } from "react";
import { Loader2, Moon, Play, Sun, Upload, Volume2 } from "lucide-react";
import { FONT_OPTIONS, TTS_PROVIDERS } from "../settingsOptions";
import { ToggleRow } from "../ToggleRow";
/**
 * Props for GeneralTab, threaded from the settings modal in
 * `features/settings/Settings.tsx`, which owns the state.
 */
export interface GeneralTabProps {
  user: any;
  avatarUrl: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fullName: string;
  setFullName: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  handleTextChange: (setter: (v: string) => void, value: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  saveSettings: () => void;
  tier: "high" | "low";
  setTier: (t: "high" | "low") => void;
  chatFont: string;
  setChatFont: (v: string) => void;
  handleSelectChange: (key: string, setter: (v: string) => void, value: string) => void;
  ttsProvider: string;
  setTtsProvider: (v: string) => void;
  setTtsVoice: (v: string) => void;
  ttsVoice: string;
  voicesLoading: boolean;
  voiceList: { value: string; label: string }[];
  previewVoice: () => void | Promise<void>;
  isSpeaking: boolean;
  responseCompletions: boolean;
  setResponseCompletions: (v: boolean) => void;
  dispatchMessages: boolean;
  setDispatchMessages: (v: boolean) => void;
  handleToggle: (key: string, setter: (v: boolean) => void, currentValue: boolean) => void;
  selectClass: string;
}


export function GeneralTab({
  user,
  avatarUrl,
  fileInputRef,
  handleAvatarChange,
  fullName,
  setFullName,
  displayName,
  setDisplayName,
  instructions,
  setInstructions,
  handleTextChange,
  isDarkMode,
  toggleTheme,
  saveSettings,
  tier,
  setTier,
  chatFont,
  setChatFont,
  handleSelectChange,
  ttsProvider,
  setTtsProvider,
  setTtsVoice,
  ttsVoice,
  voicesLoading,
  voiceList,
  previewVoice,
  isSpeaking,
  responseCompletions,
  setResponseCompletions,
  dispatchMessages,
  setDispatchMessages,
  handleToggle,
  selectClass,
}: GeneralTabProps) {
  return (
      <div className="space-y-10 max-w-2xl mx-auto">
        {/* Profile */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">Profile</h3>
          <div className="space-y-5">
            <div className="flex items-center gap-5">
              <div className="relative size-16 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-purple-500/20 ring-2 ring-white/50 dark:ring-white/10 flex items-center justify-center text-2xl font-bold overflow-hidden shadow-sm">
                {avatarUrl ? (<img src={avatarUrl} alt="Avatar" className="size-full object-cover" />) : (<span className="text-[var(--text-primary)]/60">{fullName.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "?"}</span>)}
              </div>
              <div>
                <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent)] hover:opacity-80 transition font-medium"><Upload className="size-4" />Change avatar</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-xs text-[var(--text-primary)]/40 mt-1">JPG, PNG, GIF • Max 2MB</p>
              </div>
            </div>
            <div><label className="text-sm font-medium text-[var(--text-primary)]/50 block mb-1.5">Full name</label><input type="text" value={fullName} onChange={(e) => handleTextChange(setFullName, e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-transparent focus:border-[var(--accent)]/40 focus:bg-[var(--bg-primary)] dark:focus:bg-[var(--bg-secondary)] outline-none text-sm transition-all duration-200 text-[var(--text-primary)]/40" placeholder="Your full name" /></div>
            <div><label className="text-sm font-medium text-[var(--text-primary)]/50 block mb-1.5">What should Flux call you?</label><input type="text" value={displayName} onChange={(e) => handleTextChange(setDisplayName, e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-transparent focus:border-[var(--accent)]/40 focus:bg-[var(--bg-primary)] dark:focus:bg-[var(--bg-secondary)] outline-none text-sm transition-all duration-200 text-[var(--text-primary)]/40" placeholder="Your display name" /></div>
            <div><label className="text-sm font-medium text-[var(--text-primary)]/50 block mb-2">Instructions for Flux</label><p className="text-xs text-[var(--text-primary)]/40 mb-2">Flux will keep these in mind across all conversations.</p><textarea value={instructions} onChange={(e) => handleTextChange(setInstructions, e.target.value)} placeholder="e.g. ask clarifying questions..." className="w-full h-32 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-transparent focus:border-[var(--accent)]/40 focus:bg-[var(--bg-primary)] dark:focus:bg-[var(--bg-secondary)] outline-none text-sm resize-none transition-all duration-200 text-[var(--text-primary)]/40" /></div>
          </div>
        </div>

        {/* Preferences */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">Preferences</h3>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">Appearance</span>
              <button onClick={() => { toggleTheme(); saveSettings(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-200 text-sm font-medium">
                {isDarkMode ? (<><Sun className="size-4" /><span>Light</span></>) : (<><Moon className="size-4" /><span>Dark</span></>)}
              </button>
            </div>

            {/* Display Mode */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">Display mode</span>
                <p className="text-xs text-[var(--text-primary)]/40">{tier === 'high' ? 'Smooth (120Hz)' : 'Performance (60Hz)'}</p>
              </div>
              <button onClick={() => setTier(tier === 'high' ? 'low' : 'high')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tier === 'high' ? 'bg-amber-500' : 'bg-[var(--surface-border)]'}`}>
                <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${tier === 'high' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Fonts */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">Chat font</span>
              <select value={chatFont} onChange={(e) => handleSelectChange("chat_font", setChatFont, e.target.value)} className={selectClass}>
                {FONT_OPTIONS.map(f => (<option key={f.value} value={f.value}>{f.label}</option>))}
              </select>
            </div>

            {/* TTS */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[var(--text-primary)]">Text‑to‑Speech</span>
                <select value={ttsProvider} onChange={(e) => { setTtsProvider(e.target.value); setTtsVoice(''); handleSelectChange("tts_provider", setTtsProvider, e.target.value); }} className={selectClass}>
                  {TTS_PROVIDERS.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {voicesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]/50"><Loader2 className="size-3 animate-spin" />Loading voices...</div>
                ) : (
                  <select value={ttsVoice} onChange={(e) => handleSelectChange("tts_voice", setTtsVoice, e.target.value)} className={`${selectClass} flex-1`}>
                    <option value="">{ttsProvider === 'pollinations' ? 'Select voice...' : 'Default voice'}</option>
                    {voiceList.map(v => (<option key={v.value} value={v.value}>{v.label}</option>))}
                  </select>
                )}
                <button onClick={previewVoice} disabled={isSpeaking}
                  className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] disabled:opacity-50 shrink-0"
                  title="Preview voice">
                  {isSpeaking ? <Volume2 className="size-4 animate-pulse text-[var(--accent)]" /> : <Play className="size-4" />}
                </button>
              </div>
              <p className="text-[10px] text-[var(--text-primary)]/40 mt-1.5">{TTS_PROVIDERS.find(p => p.value === ttsProvider)?.description}</p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">Notifications</h3>
          <div className="space-y-5">
            <ToggleRow label="Response completions" description="Get notified when Flux has finished a response." enabled={responseCompletions} onToggle={() => handleToggle("response_completions", setResponseCompletions, responseCompletions)} />
            <ToggleRow label="Dispatch messages" description="Get a push notification on your phone when Flux messages you in Dispatch." enabled={dispatchMessages} onToggle={() => handleToggle("dispatch_messages", setDispatchMessages, dispatchMessages)} />
          </div>
        </div>
      </div>
  );
}
