// src/components/CanvasView.tsx
import { useState, useEffect, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Code2,
  Eye,
  Copy,
  Check,
} from "lucide-react";
import { ChatInput } from "./ChatInput";
import type { ChatInputProps } from "./ChatInput";

type CanvasViewProps = {
  initialCode: string;
  onCodeChange: (code: string) => void;
  onClose: () => void;
  chatProps: ChatInputProps & { compact?: boolean };
  versionIndex?: number;
  versionCount?: number;
  onVersionBack?: () => void;
  onVersionForward?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

export function CanvasView({
  initialCode,
  onCodeChange,
  onClose,
  chatProps,
  versionIndex = 0,
  versionCount = 1,
  onVersionBack,
  onVersionForward,
  canUndo = false,
  canRedo = false,
}: CanvasViewProps) {
  const [code, setCode] = useState(initialCode);
  const [previewCode, setPreviewCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external code changes
  useEffect(() => {
    setCode(initialCode);
    setPreviewCode(initialCode);
  }, [initialCode]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewCode(newCode);
      onCodeChange(newCode);
    }, 300);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b] font-sans">
      {/* ══════ HEADER ══════ */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] bg-black/40 backdrop-blur-xl shrink-0 select-none">
        <div className="flex items-center gap-6">
          {/* Brand + Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
              <Pencil className="size-4.5 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">Canvas</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                  BETA
                </span>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">
                Live HTML, CSS & JavaScript Playground
              </p>
            </div>
          </div>

          {/* Versioning controls */}
          {versionCount > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] backdrop-blur-md">
              <button
                onClick={onVersionBack}
                disabled={!canUndo}
                className="p-1 rounded hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous version"
              >
                <ChevronLeft className="size-4 text-white/70" />
              </button>
              <span className="text-xs font-semibold text-white/80 tabular-nums tracking-wider">
                {versionIndex + 1} / {versionCount}
              </span>
              <button
                onClick={onVersionForward}
                disabled={!canRedo}
                className="p-1 rounded hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next version"
              >
                <ChevronRight className="size-4 text-white/70" />
              </button>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/70 hover:text-white transition"
            title="Copy entire code"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span>{copied ? "Copied" : "Copy code"}</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition text-white/50 hover:text-white"
            title="Close Canvas"
          >
            <X className="size-4.5" />
          </button>
        </div>
      </header>

      {/* ══════ WORKSPACE = EDITOR + DIVIDER + PREVIEW ══════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ---- CODE EDITOR PANEL ---- */}
        <div className="w-[38%] flex flex-col bg-[#0c0c10] border-r border-white/[0.05] shadow-inner">
          {/* Editor header */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.05] bg-white/[0.01]">
            <div className="flex items-center gap-2 text-white/50">
              <Code2 className="size-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-widest">Editor</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/30">
              <span>HTML</span>
            </div>
          </div>

          {/* Code textarea */}
          <div className="flex-1 relative">
            {/* Optional: line numbers gutter effect (purely visual) */}
            <div className="absolute left-0 top-0 bottom-0 w-[3.5rem] bg-white/[0.01] border-r border-white/[0.03] flex flex-col items-end pr-3 pt-5 text-[12px] font-mono text-white/15 leading-relaxed select-none pointer-events-none">
              {Array.from({ length: code.split("\n").length }).map((_, i) => (
                <span key={i} className="block h-[23.5px]">
                  {i + 1}
                </span>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={code}
              onChange={handleCodeChange}
              className="w-full h-full resize-none bg-transparent text-green-400 font-mono text-sm p-5 pl-[5rem] focus:outline-none placeholder:text-white/15 leading-relaxed selection:bg-green-500/20"
              placeholder={`<!-- Write your HTML, CSS & JavaScript here -->\n\n<h1>Hello, Flux Canvas!</h1>`}
              spellCheck={false}
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                caretColor: "#22c55e",
                lineHeight: "1.75rem",
              }}
            />
          </div>

          {/* Compact chat input */}
          <div className="border-t border-white/[0.05] bg-black/20 px-4 py-3">
            <ChatInput {...chatProps} compact />
          </div>
        </div>

        {/* ---- VISUAL DIVIDER ---- */}
        <div className="relative flex items-center justify-center w-[14px] bg-[#09090b] group">
          <div className="absolute inset-y-6 w-px bg-white/[0.04] group-hover:bg-blue-500/20 transition-colors" />
          <div className="absolute w-[3px] h-12 rounded-full bg-white/[0.03] group-hover:bg-blue-500/10 transition-colors" />
        </div>

        {/* ---- LIVE PREVIEW PANEL ---- */}
        <div className="flex-1 flex flex-col bg-[#0c0c10]">
          {/* Preview header */}
          <div className="flex items-center gap-2 px-5 py-2 border-b border-white/[0.05] bg-white/[0.01] text-white/50">
            <Eye className="size-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-widest">Live Preview</span>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 p-4 bg-[#0a0a0f] overflow-hidden">
            <div className="w-full h-full rounded-xl border border-white/[0.08] bg-white overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/[0.02]">
              <iframe
                srcDoc={previewCode}
                sandbox="allow-scripts allow-same-origin"
                className="w-full h-full border-0"
                title="Canvas Preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}