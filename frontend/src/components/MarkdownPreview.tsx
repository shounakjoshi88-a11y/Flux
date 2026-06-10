// src/components/MarkdownPreview.tsx
import React from "react";
import ReactMarkdown from "react-markdown";
import { FileText, Download, X } from "lucide-react";

interface MarkdownPreviewProps {
  base64: string;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
}

export function MarkdownPreview({ base64, filename, onClose, onDownload }: MarkdownPreviewProps) {
  const content = React.useMemo(() => {
    try {
      return atob(base64);
    } catch (err) {
      return "Failed to decode markdown content.";
    }
  }, [base64]);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#0d0d0d] h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <FileText className="size-4 text-blue-500" />
          </div>
          <span className="text-sm font-medium text-foreground truncate">{filename}</span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onDownload} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all">
            <Download className="size-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: "none" }}>
        <article className="prose dark:prose-invert prose-sm max-w-none prose-pre:bg-black/5 dark:prose-pre:bg-white/5 prose-pre:border prose-pre:border-black/10 dark:prose-pre:border-white/10 prose-headings:font-bold prose-a:text-blue-500">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
