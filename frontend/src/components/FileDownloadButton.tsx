// src/components/FileDownloadButton.tsx
import { useState, useEffect, useRef } from "react";
import { FileDown, Presentation, FileText, FileType, Loader2, Trash2, Table as TableIcon } from "lucide-react";
import mammoth from "mammoth";

type FileData = {
  base64: string;
  filename: string;
  mime: string;
  slides?: { title: string; content: string }[];
  sections?: { heading: string; body: string }[];
  pages?: { text: string }[];
};

type FileDownloadButtonProps = {
  file: FileData;
  onDownload?: () => void;
  onPreview?: (data: { 
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; 
    base64?: string; 
    html?: string; 
    filename: string 
  }) => void;
  className?: string;
  onDelete?: () => void;
};

export function FileDownloadButton({ file, onDownload, onPreview, className = "", onDelete }: FileDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine file type from extension or mime
  const ext = file.filename.split(".").pop()?.toLowerCase() || "";
  const isPptx = ext === "pptx" || file.mime.includes("presentation");
  const isDocx = ext === "docx" || file.mime.includes("wordprocessing") || file.mime.includes("word");
  const isPdf = ext === "pdf" || file.mime === "application/pdf";
  const isXlsx = ext === "xlsx" || file.mime.includes("spreadsheet") || ext === "csv" || ext === "tsv";
  const isMd = ext === "md" || file.mime.includes("markdown");

  // Icon selection
  const Icon = isPptx ? Presentation : isDocx ? FileText : isPdf ? FileType : isXlsx ? TableIcon : isMd ? FileText : FileDown;
  const iconColor = isPptx ? "text-orange-400" : isDocx ? "text-blue-400" : isPdf ? "text-red-400" : isXlsx ? "text-emerald-400" : isMd ? "text-indigo-400" : "text-muted-foreground";

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Download the file
  const handleDownload = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    onDownload?.();

    try {
      // Convert base64 to blob
      const byteChars = atob(file.base64);
      const byteNums = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteNums], { type: file.mime });

      // Create object URL and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up after 30 seconds
      timeoutRef.current = setTimeout(() => {
        URL.revokeObjectURL(url);
        timeoutRef.current = null;
      }, 30000);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download file. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Unified Preview Logic
  const handlePreview = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onPreview) return;
    
    if (isPdf) {
      onPreview({ type: 'pdf', base64: file.base64, filename: file.filename });
    } else if (isPptx) {
      onPreview({ type: 'pptx', base64: file.base64, filename: file.filename });
    } else if (isXlsx) {
      onPreview({ type: 'xlsx', base64: file.base64, filename: file.filename });
    } else if (isMd) {
      onPreview({ type: 'md', base64: file.base64, filename: file.filename });
    } else if (isDocx) {
      setIsPreparingPreview(true);
      try {
        const bytes = atob(file.base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const result = await mammoth.convertToHtml({ arrayBuffer: arr.buffer });
        onPreview({ type: 'docx', html: result.value, filename: file.filename });
      } catch (err) {
        console.error("DOCX preview failed:", err);
        handleDownload();
      } finally {
        setIsPreparingPreview(false);
      }
    }
  };

  // Logic for the whole card click
  const handleCardClick = () => {
    if ((isPdf || isDocx || isPptx) && onPreview) {
      handlePreview();
    } else {
      handleDownload();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`flex flex-col gap-2 p-3 rounded-xl border border-[var(--surface-border)] bg-[var(--user-msg-bg)] hover:bg-[var(--surface-bg)] transition-all cursor-pointer group/card ${className}`}
    >
      {/* File info row */}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-white/5 ${iconColor} group-hover/card:bg-white/10 transition-colors relative`}>
          {isPreparingPreview ? (
            <Loader2 className="size-5 animate-spin text-foreground/40" />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate text-foreground">{file.filename}</p>
            {(isPdf || isDocx || isXlsx || isMd) && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-zinc-500/10 border border-zinc-500/20 text-[9px] text-zinc-400 font-bold uppercase tracking-tighter group-hover/card:text-[var(--accent)] group-hover/card:border-[var(--accent)]/30 transition-colors">
                App Preview
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isPptx ? "PowerPoint" : isDocx ? "Word Document" : isPdf ? "PDF Document" : isXlsx ? "Spreadsheet" : isMd ? "Markdown Note" : "File"}
            {file.slides && ` • ${file.slides.length} slides`}
            {file.sections && ` • ${file.sections.length} sections`}
            {file.pages && ` • ${file.pages.length} pages`}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Delete button (only on hover) */}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 text-red-400 opacity-0 group-hover/card:opacity-100 transition-all duration-200"
              title="Delete file"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          
          {/* Download button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            disabled={isDownloading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-medium transition-colors ${
              isDownloading ? "opacity-50 cursor-not-allowed" : "hover:text-white"
            }`}
            aria-label="Download file"
            title="Download to computer"
          >
            {isDownloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Content preview for PPTX files (optional) */}
      {isPptx && file.slides && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              Show slide preview
            </summary>
            <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
              {file.slides.map((slide, idx) => (
                <div key={idx} className="p-2 rounded bg-white/5 border border-white/5">
                  <p className="font-medium text-foreground/90">Slide {idx + 1}: {slide.title}</p>
                  <p className="whitespace-pre-wrap text-foreground/70">{slide.content}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}