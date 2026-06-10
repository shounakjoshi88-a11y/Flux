// src/components/ChatInput.tsx
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Globe,
  HardDrive,
  SendHorizontal,
  X,
  Plus,
} from "lucide-react";
import React, { useRef, useState, useEffect, useCallback } from "react";
import type { AttachedFile } from "@/types";
import { marked } from "marked";

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
  toolsSlot?: React.ReactNode;
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
  const delays = [0, 0.1, 0.2, 0.1, 0];
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
                duration: 0.4 + Math.random() * 0.2,
                repeat: Infinity,
                repeatType: "reverse",
                delay: (delays[i % delays.length] ?? 0) + Math.random() * 0.1,
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

// ─── Cursor preservation helpers ──────────────────────────────
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
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isComposing = useRef(false);

  // ─── Render markdown to HTML ──────────────────────────────
  const renderMarkdown = useCallback(async (text: string): Promise<string> => {
    if (!text.trim()) return "";
    try {
      const result = await marked.parse(text, { async: true, breaks: true });
      return result as string;
    } catch {
      return text;
    }
  }, []);

  // ─── Sync contenteditable from external query changes ────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    if (text === query) return;
    renderMarkdown(query).then((html) => {
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  }, [query, renderMarkdown]);

  // ─── Handle user input ────────────────────────────────────
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
    if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  const handleCompositionStart = useCallback(() => { isComposing.current = true; }, []);
  const handleCompositionEnd = useCallback(() => { isComposing.current = false; }, []);

  // ─── Paste: handle images/files from clipboard ────────────
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
    const hasText = query.trim().length > 0;
    if (hasText) {
      onSend();
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

  return (
    <div
      className={`
        w-full rounded-2xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-sm relative transition-colors z-10
        ${compact ? "rounded-none border-x-0" : "max-w-[740px]"}
      `}
    >
      {/* ─── FILE CARDS ─── */}
      <AnimatePresence>
        {attachedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex flex-wrap gap-4 px-4 pt-3 pb-1 border-b border-[var(--surface-border)]"
          >
            {attachedFiles.map((file, idx) => {
              const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
              const isImage = file.type?.startsWith('image/');
              const isVideo = file.type?.startsWith('video/');
              return (
                <div
                  key={file.name + idx}
                  className="flex flex-col bg-[var(--bg-primary)] border border-[var(--surface-border)] rounded-lg p-3 min-w-[160px] max-w-[200px] w-auto hover:border-[var(--accent)]/35 transition-colors group"
                >
                  {isImage ? (
                    <img src={file.content} alt={file.name} className="w-full h-20 object-cover rounded-md mb-2" />
                  ) : isVideo ? (
                    <video src={file.content} className="w-full h-20 object-cover rounded-md mb-2" />
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
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── CONTENTEDITABLE EDITOR (markdown renders inline) ─── */}
      <div className="px-4 pt-[14px] pb-1">
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
          className="w-full min-h-[36px] max-h-[160px] overflow-y-auto text-[14px] text-[var(--text-primary)] leading-relaxed font-sans outline-none [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-[#a09d96] [&:empty:before]:pointer-events-none [&_p]:my-0 [&_pre]:my-1 [&_pre]:bg-[var(--code-bg)] [&_pre]:rounded-lg [&_pre]:p-2 [&_code]:text-[var(--inline-code-text)] [&_code]:bg-[var(--inline-code-bg)]"
        />
      </div>

      {/* ─── BOTTOM CONTROLS — Claude-style clean ─── */}
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="relative">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              className="flex items-center justify-center rounded-full text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition p-1"
              title="Attach files"
            >
              <Plus className="size-4" />
            </button>

          </div>
          <AnimatePresence>
            {attachMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-xl z-50 overflow-hidden"
              >
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setAttachMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition"
                >
                  <HardDrive className="size-4" />
                  Upload from computer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="image/*,video/*,.txt,.md,.js,.ts,.tsx,.py,.docx,.pdf,.pptx"
            onChange={(e) => handleLocalFiles(e.target.files)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {!hideModelSelector && (
            <div className="relative model-selector">
              <button
                onClick={() => setModelDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition"
              >
                <span className="max-w-[120px] truncate">{currentModelLabel}</span>
                <ChevronDown className="size-3 opacity-40" />
              </button>
              <AnimatePresence>
                {modelDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute bottom-full right-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-xl z-[70] p-1.5"
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
                            <span>{model.label}</span>
                            {selectedModel === model.id && <span className="text-[var(--accent)]">●</span>}
                          </button>
                        ))}
                      </div>
                    )))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {setSearchEnabled && (
            <button
              onClick={() => setSearchEnabled((prev) => !prev)}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${
                searchEnabled
                  ? "bg-[var(--accent)]/12 border border-[var(--accent)]/25 text-[var(--accent)]"
                  : "text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] border border-transparent"
              }`}
            >
              <Globe className="size-3.5" />
              Web
            </button>
          )}

          {isLoading ? (
            <button
              onClick={onStop}
              className="h-6 w-6 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)]/90 flex items-center justify-center shadow transition-colors"
              aria-label="Stop generating"
            >
              <div className="w-2 h-2 rounded-sm bg-white" />
            </button>
          ) : (
            <button
              onClick={handleButtonClick}
              disabled={isLoading}
              className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                hasText
                  ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 shadow-sm"
                  : "bg-transparent text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)]"
              }`}
            >
              {hasText ? (
                <SendHorizontal className="size-3" />
              ) : (
                <div className="flex items-center justify-center h-3 w-3">
                  <AnimatedAudioLines isActive={isRecording} />
                </div>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}