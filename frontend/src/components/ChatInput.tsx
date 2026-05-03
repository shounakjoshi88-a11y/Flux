// ChatInput.tsx
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Compass,
  FileText,
  FileCode,
  FileJson,
  HardDrive,
  Mic,
  MicOff,
  Paperclip,
  SendHorizontal,
  Shield,
  Square,
  X,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import type { AttachedFile } from "@/types";

// ── TYPES ─────────────────────────────────────
interface ModelOption {
  id: string;
  label: string;
}

interface ModelCategory {
  category: string;
  models: ModelOption[];
}

export type ChatInputProps = {
  query: string;
  setQuery: (value: string) => void;
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
  setModelDropdownOpen: (open: boolean) => void;
  handleAttachFiles: (files: FileList | null) => Promise<void>;
  onStop?: () => void;
  safetyEnabled: boolean;
  setSafetyEnabled: (val: boolean) => void;
  // New optional props
  compact?: boolean;
  toolsSlot?: React.ReactNode; // space for Tools button / canvas pill
};

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

/** Returns a Lucide icon component based on file extension */
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "py":
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "java":
    case "cpp":
    case "c":
    case "go":
    case "rs":
    case "rb":
    case "swift":
    case "kt":
      return <FileCode className="size-4" />;
    case "json":
      return <FileJson className="size-4" />;
    default:
      return <FileText className="size-4" />;
  }
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
  safetyEnabled,
  setSafetyEnabled,
  compact = false,
  toolsSlot,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null);

  // ── Auto‑resize textarea ───────────────────────
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [query]);

  const handleLocalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await handleAttachFiles(files);
    setAttachMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setQuery((prev) => (prev + ' ' + transcript).trim());
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className={`w-full input-container rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#191a1a]/90 pointer-events-auto ${compact ? "max-w-full rounded-none" : "max-w-3xl"}`}>
      {/* Multi‑file chips */}
      <AnimatePresence>
        {attachedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex flex-wrap items-center gap-2 px-4 pt-3"
          >
            {attachedFiles.map((file, idx) => (
              <div
                key={file.name + idx}
                className="flex items-center gap-2 bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 rounded-xl px-3 py-1.5 text-sm"
              >
                <div className="text-blue-600 dark:text-blue-400">
                  {getFileIcon(file.name)}
                </div>
                <span className="truncate max-w-[150px] font-medium text-foreground/80">
                  {file.name}
                </span>
                <button
                  onClick={() =>
                    setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))
                  }
                  className="ml-1 p-0.5 rounded-full hover:bg-blue-500/20 dark:hover:bg-blue-400/20 text-muted-foreground hover:text-foreground transition"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Hide attach & mic in compact mode */}
        {!compact && (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachMenuOpen(!attachMenuOpen)}
                className="attach-label"
              >
                <Paperclip className="size-5" />
              </button>
              <AnimatePresence>
                {attachMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute bottom-full left-0 mb-2 w-44 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-lg z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        fileInputRef.current?.click();
                        setAttachMenuOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-white/5 transition text-foreground"
                    >
                      <HardDrive className="size-4" />
                      Upload from computer
                    </button>
                    <button
                      disabled
                      className="flex items-center gap-3 w-full px-3 py-2 text-xs text-muted-foreground opacity-50 cursor-not-allowed"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" />
                        <path d="M12 16v-8M12 8l-4 4M12 8l4 4" />
                      </svg>
                      Google Drive (soon)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={(e) => handleLocalFiles(e.target.files)}
              />
            </div>

            {/* Mic button */}
            <button
              type="button"
              onClick={toggleRecording}
              className={`attach-label ${isRecording ? "text-red-500" : ""}`}
              title={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          </>
        )}

        <Textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholderText}
          className="flex-1 min-h-[44px] resize-none border-none bg-transparent px-2 py-2.5 text-[15px] focus-visible:ring-0 shadow-none overflow-hidden"
          rows={1}
        />

        {/* Stop button while loading, otherwise Send */}
        {isLoading ? (
          <Button
            onClick={onStop}
            className="mb-1 size-9 rounded-full bg-red-500 hover:bg-red-600 text-white transition"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            onClick={() => onSend()}
            disabled={isLoading || !query.trim()}
            className="mb-1 size-9 rounded-full bg-black dark:bg-[#343536] text-white hover:opacity-80 transition"
          >
            <SendHorizontal className="size-4" />
          </Button>
        )}
      </div>

      {/* Bottom bar: tools slot + model selector + safety toggle */}
      <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Tools slot – rendered by parent */}
          {toolsSlot}

          {!compact && (
            <>
              <div className="relative model-selector">
                <button
                  onClick={() => setModelDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Compass className="size-3.5" />
                  <span>{currentModelLabel}</span>
                  <ChevronDown className="size-3" />
                </button>

                <AnimatePresence>
                  {modelDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      className="absolute bottom-full left-0 mb-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-lg z-50 p-1"
                    >
                      {models.map((group) => (
                        <div key={group.category} className="mb-1 last:mb-0">
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none">
                            {group.category}
                          </div>
                          {group.models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model.id);
                                setModelDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-xs rounded-lg transition flex items-center justify-between ${
                                selectedModel === model.id
                                  ? "text-[#40E0FF] bg-blue-50 dark:bg-blue-900/20"
                                  : "text-foreground hover:bg-gray-100 dark:hover:bg-white/5"
                              }`}
                            >
                              <span>{model.label}</span>
                              {selectedModel === model.id && (
                                <span className="text-[#40E0FF] text-[10px]">●</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Safety toggle */}
              <button
                onClick={() => setSafetyEnabled(!safetyEnabled)}
                className={`flex items-center gap-1 text-xs transition ${
                  safetyEnabled ? "text-green-500" : "text-muted-foreground"
                }`}
                title={safetyEnabled ? "Safety filter on" : "Raw mode (no filter)"}
              >
                <Shield className="size-3.5" />
                {safetyEnabled ? "Safe" : "Raw"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}