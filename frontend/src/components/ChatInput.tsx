// src/components/ChatInput.tsx
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe,
  SendHorizontal,
  X,
  Plus,
  Image,
  Camera,
  FileText,
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
  isMobile?: boolean;
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

const ANIMATED_AUDIO_DURATIONS = [0.45, 0.5, 0.55, 0.5, 0.45];
const ANIMATED_AUDIO_DELAYS = [0, 0.1, 0.2, 0.1, 0];

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
}: ChatInputProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isComposing = useRef(false);
  const hasText = query.trim().length > 0;

  const pickGallery = () => { galleryRef.current?.click(); setAttachMenuOpen(false); };
  const pickCamera = () => { cameraRef.current?.click(); setAttachMenuOpen(false); };
  const pickFiles = () => { filesRef.current?.click(); setAttachMenuOpen(false); };

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

  return (
    <div
      className={`
        w-full rounded-2xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-sm relative transition-colors z-10
        ${compact ? "rounded-none border-x-0" : "max-w-[740px]"}
      `}
    >
      {/* ─── IMAGE PREVIEW LIGHTBOX ─── */}
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
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

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
              return isImage ? (
                <div
                  key={file.name + idx}
                  className="relative size-20 group"
                >
                  <img
                    src={file.content}
                    alt={file.name}
                    className="size-20 object-cover rounded-lg cursor-pointer"
                    onClick={() => setPreviewImage(file.content)}
                  />
                  <button
                    onClick={() => setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  >
                    <X className="size-3" />
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
      <div className="px-4 pt-[10px] pb-0">
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
          className="w-full min-h-[28px] max-h-[200px] overflow-y-auto custom-scrollbar text-[14px] text-[var(--text-primary)] leading-relaxed font-sans outline-none [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-[var(--text-secondary)]/70 [&:empty:before]:text-[13px] [&:empty:before]:pointer-events-none [&_p]:my-0 [&_pre]:my-1 [&_pre]:bg-[var(--code-bg)] [&_pre]:rounded-lg [&_pre]:p-2 [&_code]:text-[var(--inline-code-text)] [&_code]:bg-[var(--inline-code-bg)]"
        />
      </div>

      {/* ─── BOTTOM CONTROLS ─── */}
      <div className="flex items-center justify-between px-3 pb-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAttachMenuOpen(!attachMenuOpen)}
            className="w-8 h-8 shrink-0 rounded-full bg-black/30 text-white hover:bg-black/50 flex items-center justify-center transition"
            style={{ minWidth: '32px', minHeight: '32px', padding: 0, border: 'none', outline: 'none' }}
            title="Attach files"
          >
            <Plus className="size-4 shrink-0" />
          </button>

          {/* Desktop: small popup card above the button */}
          <AnimatePresence>
            {attachMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
                className="absolute bottom-full left-0 mb-2 glass-panel rounded-xl shadow-xl z-50 overflow-hidden p-2 hidden md:flex will-change-transform"
              >
                <div className="flex gap-2">
                  <button onClick={pickGallery} className="flex flex-col items-center gap-1.5 w-20 py-3 px-2 rounded-lg text-[var(--text-primary)] hover:bg-white/[0.08] transition">
                    <div className="size-9 rounded-full bg-[var(--accent)]/15 flex items-center justify-center"><Image className="size-4 text-[var(--accent)]" /></div>
                    <span className="text-[11px] font-medium">Image</span>
                  </button>
                  <button onClick={pickCamera} className="flex flex-col items-center gap-1.5 w-20 py-3 px-2 rounded-lg text-[var(--text-primary)] hover:bg-white/[0.08] transition">
                    <div className="size-9 rounded-full bg-[var(--accent)]/15 flex items-center justify-center"><Camera className="size-4 text-[var(--accent)]" /></div>
                    <span className="text-[11px] font-medium">Camera</span>
                  </button>
                  <button onClick={pickFiles} className="flex flex-col items-center gap-1.5 w-20 py-3 px-2 rounded-lg text-[var(--text-primary)] hover:bg-white/[0.08] transition">
                    <div className="size-9 rounded-full bg-[var(--accent)]/15 flex items-center justify-center"><FileText className="size-4 text-[var(--accent)]" /></div>
                    <span className="text-[11px] font-medium">Files</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile: full bottom drawer */}
          <AnimatePresence>
            {attachMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[9999] md:hidden"
                onClick={() => setAttachMenuOpen(false)}
              >
                <div className="absolute inset-0 bg-black" />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.8 }}
                  onClick={(e) => e.stopPropagation()}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 80) setAttachMenuOpen(false);
                  }}
                  className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[var(--bg-primary)] border-t border-[var(--surface-border)] pt-2 pb-[calc(1rem+var(--sab,0px))] px-2"
                >
                  <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/30 mx-auto mb-2" />
                  <button onClick={pickGallery} className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-[var(--text-primary)] hover:bg-white/[0.06] transition active:scale-[0.98]">
                    <div className="size-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center"><Image className="size-5 text-blue-400" /></div>
                    <div className="flex-1 text-left"><div className="text-sm font-medium">Image</div><div className="text-[11px] text-[var(--text-secondary)]/70">From gallery</div></div>
                  </button>
                  <button onClick={pickCamera} className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-[var(--text-primary)] hover:bg-white/[0.06] transition active:scale-[0.98]">
                    <div className="size-10 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 flex items-center justify-center"><Camera className="size-5 text-green-400" /></div>
                    <div className="flex-1 text-left"><div className="text-sm font-medium">Camera</div><div className="text-[11px] text-[var(--text-secondary)]/70">Take a photo</div></div>
                  </button>
                  <button onClick={pickFiles} className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-[var(--text-primary)] hover:bg-white/[0.06] transition active:scale-[0.98]">
                    <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center"><FileText className="size-5 text-amber-400" /></div>
                    <div className="flex-1 text-left"><div className="text-sm font-medium">Files</div><div className="text-[11px] text-[var(--text-secondary)]/70">Documents & more</div></div>
                  </button>
                  <button onClick={() => setAttachMenuOpen(false)} className="w-full mt-1 py-3 rounded-xl text-sm font-medium text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition active:scale-[0.98]">
                    Cancel
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Three separate hidden file inputs — one per action */}
          <input ref={galleryRef} type="file" className="hidden" multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => handleLocalFiles(e.target.files)} />
          <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => handleLocalFiles(e.target.files)} />
          <input ref={filesRef} type="file" className="hidden" multiple accept="image/*,video/*,.txt,.md,.docx,.doc,.pdf,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.c,.h,.cpp,.hpp,.cc,.cxx,.rs,.go,.java,.kt,.swift,.js,.jsx,.ts,.tsx,.py,.rb,.php,.css,.scss,.less,.html,.htm,.xml,.json,.yaml,.yml,.toml,.ini,.cfg,.conf,.sh,.bash,.zsh,.ps1,.bat,.cmd,.sql,.svg,.webp" onChange={(e) => handleLocalFiles(e.target.files)} />

          {/* Model selector on left side */}
          {!hideModelSelector && (
            <div className="relative model-selector bg-black/30 rounded-full px-1.5 h-8 flex items-center">
              <button
                onClick={() => setModelDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white transition whitespace-nowrap"
              >
                <span>{currentModelLabel}</span>
              </button>
              <AnimatePresence>
                {modelDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
                    className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] shadow-xl z-[70] p-1.5 custom-scrollbar will-change-transform"
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
        </div>

        <div className="flex items-center gap-1.5">
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
              className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center shadow-sm transition-colors"
              aria-label="Stop generating"
            >
              <div className="w-2.5 h-2.5 rounded-sm bg-white/80" />
            </button>
          ) : (
            <button
              onClick={handleButtonClick}
              disabled={isLoading}
              className="w-8 h-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center shadow-sm transition-all hover:bg-white/90 active:scale-95"
              style={{ minWidth: '32px', minHeight: '32px', padding: 0, border: 'none', outline: 'none' }}
            >
              {hasText ? (
                <SendHorizontal className="size-4 shrink-0" />
              ) : (
                <div className="flex items-center justify-center h-4 w-4 shrink-0">
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
