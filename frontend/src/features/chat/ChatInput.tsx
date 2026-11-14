// src/components/ChatInput.tsx
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowUp, IconChevronDown, IconMic, IconPlus, IconStop, IconClose, IconFolder, IconArtifacts, IconAttachment, IconCamera, IconSkill, IconLink, IconHistory, IconGlobe, IconSearch, IconGear, IconCheck, IconChevronRight } from "../layout/anthropicIcons";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { fetchSkills, toggleSkill, type SkillMeta } from "../../lib/skills";
import { getMemoryEnabled, setMemoryEnabled as persistMemoryEnabled } from "../../lib/preferences";
import { AddCustomConnectorDialog } from "../connectors/AddCustomConnectorDialog";
import type { AttachedFile } from "@/types";
import { marked } from "marked";
import { usePerformance } from "../../lib/performance-context";

const ANIMATED_AUDIO_DURATIONS = [0.45, 0.5, 0.55, 0.5, 0.45];
const ANIMATED_AUDIO_DELAYS = [0, 0.1, 0.2, 0.1, 0];

interface ModelOption {
  id: string;
  label: string;
}

interface ModelCategory {
  category: string;
  models: ModelOption[];
}

export interface ChatInputProps {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>> | ((value: string) => void);
  onSend: (query?: string) => void;
  isLoading: boolean;
  placeholderText: string;
  attachedFiles: AttachedFile[];
  setAttachedFiles: (files: AttachedFile[]) => void;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  models: ModelCategory[];
  currentModelLabel: string;
  modelDropdownOpen: boolean;
  setModelDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleAttachFiles: (files: FileList | null) => Promise<void>;
  onStop?: () => void;
  hideModelSelector?: boolean;
  searchEnabled?: boolean;
  setSearchEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
  compact?: boolean;
  /** New-chat composer: editor row on top, controls underneath. */
  hero?: boolean;
  toolsSlot?: React.ReactNode;
  /** Open Settings on a given tab, e.g. ("Customize", "Plugins") — used by the composer menu links. */
  onRequestSettingsTab?: (tab: string, sub?: string) => void;
}

// Fixed SpeechRecognition types
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new(): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new(): SpeechRecognition;
    };
  }
}

const AnimatedAudioLines = ({ isActive }: { isActive: boolean }) => {
  return (
    <div className="flex items-center gap-[2px] h-4">
      {[4, 10, 14, 10, 4].map((height, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-current"
          initial={{ height: 2 }}
          animate={isActive ? { height: height } : { height: 2 }}
          transition={
            isActive
              ? {
                duration: ANIMATED_AUDIO_DURATIONS[i],
                repeat: Infinity,
                repeatType: "reverse",
                delay: ANIMATED_AUDIO_DELAYS[i],
              }
              : {
                duration: 0.2,
                ease: "easeOut",
              }
          }
        />
      ))}
    </div>
  );
};

// ─── Cursor preservation helpers ───
function saveCursor(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const preCaret = range.cloneRange();
  preCaret.selectNodeContents(el);
  preCaret.setEnd(range.endContainer, range.endOffset);
  return preCaret.toString().length;
}

function restoreCursor(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const treeWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let node: Text | null;
  while ((node = treeWalker.nextNode() as Text | null)) {
    const next = charCount + node.length;
    if (next >= offset) {
      const range = document.createRange();
      range.setStart(node, offset - charCount);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    charCount = next;
  }
  // fallback: end of content
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function ChatInput({
  query,
  setQuery,
  onSend,
  isLoading,
  placeholderText,
  attachedFiles,
  setAttachedFiles,
  selectedModel,
  setSelectedModel,
  models,
  currentModelLabel,
  modelDropdownOpen,
  setModelDropdownOpen,
  handleAttachFiles,
  onStop,
  hideModelSelector = false,
  searchEnabled = true,
  setSearchEnabled,
  compact = false,
  hero = false,
  onRequestSettingsTab,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [skillsFlyoutOpen, setSkillsFlyoutOpen] = useState(false);
  const [connectorFlyoutOpen, setConnectorFlyoutOpen] = useState(false);
  const [pluginFlyoutOpen, setPluginFlyoutOpen] = useState(false);
  const [addConnectorOpen, setAddConnectorOpen] = useState(false);
  const [menuSkills, setMenuSkills] = useState<SkillMeta[] | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [menuHint, setMenuHint] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isComposing = useRef(false);
  const { isLow: isPerfLow } = usePerformance();

  // Memory preference (shared with Settings → Capabilities).
  useEffect(() => { let cancelled = false; getMemoryEnabled().then((v) => { if (!cancelled) setMemoryEnabled(v); }); return () => { cancelled = true; }; }, []);

  // Lazy-load the skills catalog the first time the menu opens.
  useEffect(() => {
    if (!attachMenuOpen || menuSkills !== null) return;
    let cancelled = false;
    fetchSkills().then((s) => { if (!cancelled) setMenuSkills(s); });
    return () => { cancelled = true; };
  }, [attachMenuOpen, menuSkills]);

  useEffect(() => {
    if (!attachMenuOpen) { setSkillsFlyoutOpen(false); setConnectorFlyoutOpen(false); setPluginFlyoutOpen(false); }
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!menuHint) return;
    const t = setTimeout(() => setMenuHint(null), 3500);
    return () => clearTimeout(t);
  }, [menuHint]);

  const handleScreenshot = useCallback(async () => {
    setAttachMenuOpen(false);
    if (!navigator.clipboard?.read) {
      setMenuHint("Clipboard read isn't supported here — press Ctrl+V in the composer instead.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((i) => i.types.some((t) => t.startsWith("image/")));
      const type = item?.types.find((t) => t.startsWith("image/"));
      if (!item || !type) {
        setMenuHint("No image in the clipboard — copy a screenshot first, or press Ctrl+V in the composer.");
        return;
      }
      const blob = await item.getType(type);
      const ext = type.split("/")[1] || "png";
      const file = new File([blob], `screenshot-${Date.now()}.${ext}`, { type });
      const dt = new DataTransfer();
      dt.items.add(file);
      await handleAttachFiles(dt.files);
    } catch {
      setMenuHint("Clipboard access was blocked — allow it, or press Ctrl+V in the composer.");
    }
  }, [handleAttachFiles]);

  const toggleSkillInMenu = useCallback(async (skill: SkillMeta) => {
    // Optimistic toggle; the source of truth flips on with the user's write.
    setMenuSkills((prev) => prev?.map((s) => (s.name === skill.name ? { ...s, enabled: !s.enabled } : s)) ?? prev);
    const ok = await toggleSkill(skill, !skill.enabled);
    if (!ok) {
      setMenuSkills((prev) => prev?.map((s) => (s.name === skill.name ? { ...s, enabled: skill.enabled } : s)) ?? prev);
      setMenuHint("Couldn't update the skill — try again.");
    }
  }, []);

  const toggleMemoryInMenu = useCallback(async () => {
    const next = !memoryEnabled;
    setMemoryEnabled(next);
    const ok = await persistMemoryEnabled(next);
    if (!ok) {
      setMemoryEnabled(!next);
      setMenuHint("Couldn't update the memory setting.");
    }
  }, [memoryEnabled]);

  // ─── Render markdown to HTML ───
  const renderMarkdown = useCallback(async (text: string): Promise<string> => {
    if (!text.trim()) return "";
    try {
      const result = await marked.parse(text, { async: true, breaks: true });
      return result as string;
    } catch {
      return text;
    }
  }, []);

  // ─── Sync contenteditable from external query changes ───
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    if (text === query) return;
    renderMarkdown(query).then((html) => {
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  }, [query, renderMarkdown]);

  // ─── Handle user input ───
  const handleInput = useCallback(async () => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    (setQuery as any)(text);
    const cursor = saveCursor(el);
    const html = await renderMarkdown(text);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      restoreCursor(el, cursor);
    }
  }, [setQuery, renderMarkdown]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd+U — Claude's "Upload or add files" shortcut.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      e.preventDefault();
      fileInputRef.current?.click();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
      e.preventDefault();
      const text = editorRef.current?.innerText || "";
      onSend(text);
    }
  }, [onSend]);

  const handleCompositionStart = useCallback(() => { isComposing.current = true; }, []);
  const handleCompositionEnd = useCallback(() => { isComposing.current = false; }, []);

  // ─── Paste: handle images/files from clipboard ───
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter(item => item.kind === 'file');
    if (fileItems.length === 0) return;
    e.preventDefault();
    const dt = new DataTransfer();
    for (const item of fileItems) {
      const file = item.getAsFile();
      if (file) {
        const named = new File([file], file.name || `pasted-${Date.now()}`, { type: file.type });
        dt.items.add(named);
      }
    }
    if (dt.files.length > 0) {
      await handleAttachFiles(dt.files);
    }
  }, [handleAttachFiles]);

  const handleLocalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await handleAttachFiles(files);
    setAttachMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleButtonClick = () => {
    if (isLoading) {
      onStop?.();
      return;
    }
    const text = editorRef.current?.innerText || "";
    const hasText = text.trim().length > 0;
    if (hasText) {
      onSend(text);
      return;
    }
    startVoiceRecording();
  };

  const startVoiceRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      const transcript = result?.[0]?.transcript;
      if (transcript) {
        if (typeof setQuery === 'function') {
          (setQuery as any)((prev: string) => (prev + ' ' + transcript).trim());
        }
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const hasText = query.trim().length > 0;


  /* Claude builds its composer from three groups and composes them
     differently for the hero (new chat) and inline (in-conversation) states. */
  const editorControl = (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      data-placeholder={placeholderText}
      className="w-full min-h-[21px] max-h-[160px] overflow-y-auto custom-scrollbar text-[15px] leading-[21px] text-[var(--text-primary)] font-sans outline-none [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-[#a09d96] [&:empty:before]:pointer-events-none [&_p]:my-0 [&_pre]:my-1 [&_pre]:bg-[var(--code-bg)] [&_pre]:rounded-lg [&_pre]:p-2 [&_code]:text-[var(--inline-code-text)] [&_code]:bg-[var(--inline-code-bg)]"
    />
  );

  const menuItemClass =
    "flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] leading-5 text-[var(--text-primary)]/95 hover:bg-[var(--surface-bg)] transition-colors select-none";
  const menuKbdClass = "ml-auto pl-6 text-[11px] text-[var(--text-muted)] font-mono";
  const checkClass = "ml-auto pl-6 text-[var(--accent)] size-4";

  const attachMenuContent = (
    <>
      <button onClick={() => { fileInputRef.current?.click(); setAttachMenuOpen(false); }} className={menuItemClass}>
        <IconAttachment className="size-[18px] text-[var(--text-secondary)]" />
        Upload or add files
        <span className={menuKbdClass}>Ctrl+U</span>
      </button>
      <button onClick={() => { void handleScreenshot(); }} className={menuItemClass}>
        <IconCamera className="size-[18px] text-[var(--text-secondary)]" />
        Take a screenshot
      </button>

      <div className="my-1 h-px bg-white/[0.06] mx-1.5" />

      {/* Skills — submenu listing the user's merged catalog, toggle to enable/disable */}
      <div className="relative">
        <button onClick={() => { setSkillsFlyoutOpen((v) => !v); setConnectorFlyoutOpen(false); }} className={menuItemClass}>
          <IconSkill className="size-4 text-[var(--text-secondary)]" />
          Skills
          <IconChevronRight className="ml-auto size-4 text-[var(--text-muted)]" />
        </button>
        {skillsFlyoutOpen && (
          <div className="absolute left-full bottom-0 ml-2 w-80 max-h-80 overflow-y-auto custom-scrollbar rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl z-[70] p-1.5">
            {menuSkills === null ? (
              <div className="px-3 py-3 text-[12px] text-[var(--text-muted)]">Loading skills…</div>
            ) : menuSkills.length === 0 ? (
              <div className="px-3 py-2.5 text-[12px] text-[var(--text-muted)]">No skills yet — ask the model to “save this as a skill”, or create one here.</div>
            ) : (
              menuSkills.map((skill) => (
                <button
                  key={skill.name}
                  onClick={() => toggleSkillInMenu(skill)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface-bg)] transition-colors"
                  title={skill.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  {skill.source === "custom"
                    ? <IconArtifacts className="mt-0.5 size-4 shrink-0 text-[var(--accent)]/80" />
                    : <IconFolder className="mt-0.5 size-4 shrink-0 text-[var(--text-secondary)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] leading-4 font-medium text-[var(--text-primary)]">{skill.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-muted)] line-clamp-2">{skill.description}</span>
                  </span>
                  {skill.enabled && <IconCheck className="mt-1 size-4 shrink-0 text-[var(--accent)]" />}
                </button>
              ))
            )}
            <div className="my-1 h-px bg-white/[0.06] mx-1" />
            <button onClick={() => { setAttachMenuOpen(false); onRequestSettingsTab?.("Customize", "Skills"); }} className={menuItemClass}>
              <IconGear className="size-4 text-[var(--text-secondary)]" />
              Manage skills
            </button>
            <button onClick={() => { setAttachMenuOpen(false); onRequestSettingsTab?.("Customize", "Skills"); }} className={menuItemClass}>
              <IconPlus className="size-4 text-[var(--text-secondary)]" />
              Browse skills
            </button>
          </div>
        )}
      </div>

      {/* Add connector — browse the catalog or add a custom MCP server */}
      <div className="relative">
        <button onClick={() => { setConnectorFlyoutOpen((v) => !v); setSkillsFlyoutOpen(false); setPluginFlyoutOpen(false); }} className={menuItemClass}>
          <IconLink className="size-4 text-[var(--text-secondary)]" />
          Add connector
          <IconChevronRight className="ml-auto size-4 text-[var(--text-muted)]" />
        </button>
        {connectorFlyoutOpen && (
          <div className="absolute left-full bottom-0 ml-2 w-64 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl z-[70] p-1.5">
            <button
              onClick={() => { setAttachMenuOpen(false); onRequestSettingsTab?.("Customize", "Connectors"); }}
              className={menuItemClass}
            >
              <IconGlobe className="size-4 text-[var(--text-secondary)]" />
              Browse connectors
            </button>
            <button
              onClick={() => { setAttachMenuOpen(false); setAddConnectorOpen(true); }}
              className={menuItemClass}
            >
              <IconPlus className="size-4 text-[var(--text-secondary)]" />
              Add custom connector
            </button>
          </div>
        )}
      </div>

      {/* Plugins — browse bundles of skills */}
      <div className="relative">
        <button onClick={() => { setPluginFlyoutOpen((v) => !v); setSkillsFlyoutOpen(false); setConnectorFlyoutOpen(false); }} className={menuItemClass}>
          <IconArtifacts className="size-4 text-[var(--text-secondary)]" />
          Plugins
          <IconChevronRight className="ml-auto size-4 text-[var(--text-muted)]" />
        </button>
        {pluginFlyoutOpen && (
          <div className="absolute left-full bottom-0 ml-2 w-72 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl z-[70] p-1.5">
            <button
              onClick={() => { setAttachMenuOpen(false); onRequestSettingsTab?.("Customize", "Plugins"); }}
              className={menuItemClass}
            >
              <IconGear className="size-4 text-[var(--text-secondary)]" />
              Manage plugins
            </button>
            <button
              onClick={() => { setAttachMenuOpen(false); onRequestSettingsTab?.("Customize", "Plugins"); }}
              className={menuItemClass}
            >
              <IconPlus className="size-4 text-[var(--text-secondary)]" />
              Browse plugins
            </button>
          </div>
        )}
      </div>

      <div className="my-1 h-px bg-white/[0.06] mx-1.5" />

      <button onClick={() => setSearchEnabled?.((prev) => !prev)} className={menuItemClass}>
        <IconGlobe className="size-4 text-[var(--text-secondary)]" />
        Web search
        {searchEnabled && <IconCheck className={checkClass} />}
      </button>
      <button onClick={() => { void toggleMemoryInMenu(); }} className={menuItemClass}>
        <IconHistory className="size-4 text-[var(--text-secondary)]" />
        Memory
        {memoryEnabled && <IconCheck className={checkClass} />}
      </button>
    </>
  );

  const attachControl = (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setAttachMenuOpen(!attachMenuOpen)}
          className="flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-[var(--surface-bg)] transition p-1"
          title="Add files, skills, connectors…"
        >
          <IconPlus className="size-5" />
        </button>

        {menuHint && (
          <div className="absolute bottom-full left-0 mb-2 z-[80] w-72 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl px-3 py-2 text-[12px] leading-4 text-[var(--text-secondary)]">
            {menuHint}
          </div>
        )}
      </div>
      {isPerfLow ? (
        attachMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl z-50 overflow-hidden p-1.5">
            {attachMenuContent}
          </div>
        )
      ) : (
        <AnimatePresence>
          {attachMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-2xl z-50 p-1.5"
            >
              {attachMenuContent}
            </motion.div>
          )}
        </AnimatePresence>
      )}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept="image/*,video/*,.txt,.md,.docx,.doc,.pdf,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.c,.h,.cpp,.hpp,.cc,.cxx,.rs,.go,.java,.kt,.swift,.js,.jsx,.ts,.tsx,.py,.rb,.php,.css,.scss,.less,.html,.htm,.xml,.json,.yaml,.yml,.toml,.ini,.cfg,.conf,.sh,.bash,.zsh,.ps1,.bat,.cmd,.sql,.svg,.webp"
        onChange={(e) => handleLocalFiles(e.target.files)}
      />
    </div>
  );


  /* Claude shows the model picker inside the hero composer and in the
     meta row under the box once a conversation is running. */
  const modelControl = (dense = false) => {
    if (hideModelSelector) return null;
    // Two-tone label like claude.ai's chip: model name bright, tier dimmed
    // ("DeepSeek V4" bright, "Pro" dimmed).
    const bare = currentModelLabel.replace(/\s*\([^)]*\)/g, "");
    const words = bare.split(" ");
    const tier = words.length > 1 ? words.pop()! : "";
    const main = words.join(" ");
    return (
      <div className="relative model-selector">
        <button
          onClick={() => setModelDropdownOpen((prev) => !prev)}
          className={dense
            ? "flex h-6 items-center gap-1 rounded-[6px] px-2 text-[13px] leading-[19px] font-[435] text-[var(--text-primary)]/90 hover:bg-[var(--surface-bg)] transition"
            : "flex h-7 items-center gap-1 rounded-full px-2 text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition"}
        >
          {dense ? (
            <span className="max-w-[140px] truncate">
              <span className="text-[var(--text-primary)]/90">{main}</span>
              {tier && <span className="text-[var(--text-muted)]"> {tier}</span>}
            </span>
          ) : (
            <span className="max-w-[125px] truncate">{bare}</span>
          )}
          {!dense && <IconChevronDown className="size-3.5 opacity-50" />}
        </button>
        {isPerfLow ? (
          modelDropdownOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-xl z-[70] p-1.5 custom-scrollbar">
              {models.map((group) => (group.models.length > 0 && (
                <div key={group.category} className="mb-1 last:mb-0">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] select-none">
                    {group.category}
                  </div>
                  {group.models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition flex items-center justify-between ${selectedModel === model.id
                        ? "text-[var(--accent)] bg-[var(--accent)]/8"
                        : "text-[var(--text-primary)]/70 hover:bg-[var(--surface-bg)]"
                        }`}
                    >
                      <span>{model.label.replace(/\s*\([^)]*\)/g, "")}</span>
                      {selectedModel === model.id && <span className="text-[var(--accent)]">●</span>}
                    </button>
                  ))}
                </div>
              )))}
            </div>
          )
        ) : (
          <AnimatePresence>
            {modelDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute bottom-full right-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-xl z-[70] p-1.5 custom-scrollbar"
              >
                {models.map((group) => (group.models.length > 0 && (
                  <div key={group.category} className="mb-1 last:mb-0">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] select-none">
                      {group.category}
                    </div>
                    {group.models.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg transition flex items-center justify-between ${selectedModel === model.id
                          ? "text-[var(--accent)] bg-[var(--accent)]/8"
                          : "text-[var(--text-primary)]/70 hover:bg-[var(--surface-bg)]"
                          }`}
                      >
                        <span>{model.label.replace(/\s*\([^)]*\)/g, "")}</span>
                        {selectedModel === model.id && <span className="text-[var(--accent)]">●</span>}
                      </button>
                    ))}
                  </div>
                )))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  const rightControls = (
    <div className="flex items-center gap-1.5">
      {isLoading ? (
        <button
          onClick={onStop}
          className="h-7 w-7 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 flex items-center justify-center transition-colors"
          aria-label="Stop generating"
        >
          <IconStop className="size-3.5" />
        </button>
      ) : (
        <button
          onClick={handleButtonClick}
          disabled={isLoading}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
            hasText
              ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {hasText ? (
            <IconArrowUp className="size-4" />
          ) : isRecording ? (
            <div className="flex items-center justify-center h-3 w-3">
              <AnimatedAudioLines isActive={isRecording} />
            </div>
          ) : (
            /* Idle slot is Claude's dictation button. */
            <IconMic className="size-4" />
          )}
        </button>
      )}
    </div>
  );

  return (
    <>
      <AddCustomConnectorDialog
        isOpen={addConnectorOpen}
        onClose={() => setAddConnectorOpen(false)}
        onAdded={() => { setMenuSkills(null); /* connector list refreshes on next open */ }}
      />
      {previewImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            <img src={previewImage} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 size-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <IconClose className="size-4" />
            </button>
          </div>
        </div>
      )}
      <div
        className={`
          w-full p-2 bg-[var(--user-msg-bg)] relative transition-colors z-10
          ${compact ? "rounded-none" : "rounded-[14px] max-w-[768px] shadow-[0_2px_12px_rgba(0,0,0,0.18)]"}
        `}
      >
      {/* ─── FILE CARDS ─── */}
      {isPerfLow ? (
        attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-3 px-1 pb-2">
            {attachedFiles.map((file, idx) => {
              const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
              const isImage = file.type?.startsWith('image/');
              const isVideo = file.type?.startsWith('video/');
              return isImage ? (
                <img key={file.name + idx} src={file.content} alt={file.name} className="size-20 object-cover rounded-lg cursor-pointer" onClick={() => setPreviewImage(file.content)} />
              ) : (
                <div
                  key={file.name + idx}
                  className="flex flex-col bg-[var(--bg-primary)] border border-[var(--surface-border)] rounded-lg p-3 min-w-[160px] max-w-[200px] w-auto hover:border-[var(--accent)]/35 transition-colors group"
                >
                  {isVideo ? (
                    <video src={file.content} className="size-20 object-cover rounded-md mb-2" />
                  ) : (
                    <>
                      <div className="font-semibold text-sm text-[var(--text-primary)] truncate">{file.name}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {file.content ? `${file.content.split('\n').length} lines` : 'Media file'}
                      </div>
                    </>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] px-2 py-0.5 border border-[var(--surface-border)] rounded bg-[var(--surface-bg)] text-[var(--text-secondary)]">{ext}</span>
                    <button
                      onClick={() => setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded hover:bg-[var(--surface-bg)]"
                    >
                      <IconClose className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex flex-wrap gap-3 px-1 pb-2"
            >
              {attachedFiles.map((file, idx) => {
                const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
                const isImage = file.type?.startsWith('image/');
                const isVideo = file.type?.startsWith('video/');
                return isImage ? (
                  <div key={file.name + idx} className="relative size-20 group">
                    <img src={file.content} alt={file.name} className="size-20 object-cover rounded-lg cursor-pointer" onClick={() => setPreviewImage(file.content)} />
                    <button
                      onClick={() => setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                    >
                      <IconClose className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={file.name + idx}
                    className="flex flex-col bg-[var(--bg-primary)] border border-[var(--surface-border)] rounded-lg p-3 min-w-[160px] max-w-[200px] w-auto hover:border-[var(--accent)]/35 transition-colors group"
                  >
                    {isVideo ? (
                      <video src={file.content} className="size-20 object-cover rounded-md mb-2" />
                    ) : (
                      <>
                        <div className="font-semibold text-sm text-[var(--text-primary)] truncate">{file.name}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {file.content ? `${file.content.split('\n').length} lines` : 'Media file'}
                        </div>
                      </>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 border border-[var(--surface-border)] rounded bg-[var(--surface-bg)] text-[var(--text-secondary)]">{ext}</span>
                      <button
                        onClick={() => setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded hover:bg-[var(--surface-bg)]"
                      >
                        <IconClose className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ─── CONTENTEDITABLE EDITOR (markdown renders inline) ─── */}
      {hero ? (
        <>
          {/* New chat: editor row on top, controls underneath - claude.ai/new.
              Claude reserves 32px under the first line so a second line of
              text appears before the controls row has to move. */}
          <div className="px-2 pt-[3.5px] pb-[32.5px]">{editorControl}</div>
          <div className="mt-0.5 flex items-center justify-between gap-2 px-0.5">
            {attachControl}
            <div className="flex items-center gap-1.5">
              {modelControl()}
              {rightControls}
            </div>
          </div>
        </>
      ) : (
        /* Mid-conversation: one 44px row - plus, text, controls. */
        <div className="flex items-end gap-1">
          <div className="shrink-0">{attachControl}</div>
          <div className="min-w-0 flex-1 py-[3.5px]">{editorControl}</div>
          <div className="flex shrink-0 items-center gap-1">{rightControls}</div>
        </div>
      )}
    </div>

    {/* Meta row: Claude keeps this below the composer box, not inside it.
        In conversation the model picker lives here instead of in the box.
        Measured claude.ai: 13px/17px muted disclaimer with hover underline,
        and an h24 br6 chip (fs13/19, weight 435) with the model name bright
        and the effort/tier suffix dimmed. */}
    {!hero && (
      <div className="mx-auto mt-2 flex w-full max-w-[768px] items-center justify-between px-2 text-[13px] leading-[17px]">
        <span className="truncate text-[var(--composer-meta)] hover:underline cursor-default">Flux is AI and can make mistakes. Please double-check responses.</span>
        {modelControl(true)}
      </div>
    )}
    </>
  );
}
