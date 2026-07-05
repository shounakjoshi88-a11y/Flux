import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileType, FileImage, Check } from "lucide-react";

type FileCardProps = {
  filename: string;
  base64?: string;
  mime?: string;
};

const FILE_ICONS: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  txt: "text",
  md: "text",
  csv: "table",
  tsv: "table",
  json: "code",
  xml: "code",
  html: "code",
  css: "code",
  js: "code",
  ts: "code",
  py: "code",
  rs: "code",
  go: "code",
  java: "code",
  cpp: "code",
  c: "code",
  h: "code",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  rar: "archive",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
};

const FILE_COLORS: Record<string, string> = {
  pdf: "#ef4444",
  docx: "#3b82f6",
  xlsx: "#22c55e",
  pptx: "#f97316",
  text: "#a78bfa",
  table: "#14b8a6",
  code: "#6366f1",
  archive: "#f59e0b",
  image: "#ec4899",
};

function getFileType(ext: string): string {
  return FILE_ICONS[ext.toLowerCase()] || "file";
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function formatSize(base64?: string): string {
  if (!base64) return "";
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ filename, base64, mime }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const ext = getExtension(filename);
  const type = getFileType(ext);
  const color = FILE_COLORS[type] || "#888";
  const size = formatSize(base64);

  const handleDownload = async () => {
    if (!base64 || downloading) return;
    setDownloading(true);
    try {
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      timeoutRef.current = setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-bg)]/50 hover:bg-[var(--surface-bg)] transition-all duration-200">
      <div
        className="flex items-center justify-center size-10 rounded-lg shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        {type === "image" ? (
          <FileImage className="size-5" style={{ color }} />
        ) : type === "code" || type === "text" ? (
          <FileText className="size-5" style={{ color }} />
        ) : (
          <FileType className="size-5" style={{ color }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{filename}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {type.toUpperCase()}
          {size ? ` · ${size}` : ""}
        </p>
      </div>

      <button
        onClick={handleDownload}
        disabled={!base64 || downloading}
        className="flex items-center justify-center size-9 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Download"
      >
        {downloading ? (
          <div className="size-4 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
        ) : (
          <Download className="size-4 text-muted-foreground/70 group-hover:text-[var(--accent)] transition-colors" />
        )}
      </button>
    </div>
  );
}
