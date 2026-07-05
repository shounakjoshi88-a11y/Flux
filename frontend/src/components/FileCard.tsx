import { useState, useRef, useEffect } from "react";

type FileCardProps = {
  filename: string;
  base64?: string;
  mime?: string;
  downloadUrl?: string;
};

const FILE_CATEGORIES: Record<string, string> = {
  pdf: "Document",
  docx: "Document",
  doc: "Document",
  xlsx: "Spreadsheet",
  xls: "Spreadsheet",
  pptx: "Presentation",
  ppt: "Presentation",
  txt: "Document",
  md: "Document",
  csv: "Data",
  tsv: "Data",
  json: "Code",
  xml: "Code",
  html: "Code",
  css: "Code",
  js: "Code",
  ts: "Code",
  py: "Code",
  rs: "Code",
  go: "Code",
  java: "Code",
  cpp: "Code",
  c: "Code",
  h: "Code",
  zip: "Archive",
  tar: "Archive",
  gz: "Archive",
  rar: "Archive",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  gif: "Image",
  webp: "Image",
  svg: "Image",
};

const FILE_ICON_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOC",
  doc: "DOC",
  xlsx: "XLS",
  xls: "XLS",
  pptx: "PPT",
  ppt: "PPT",
  txt: "TXT",
  md: "MD",
  csv: "CSV",
  tsv: "TSV",
  json: "{ }",
  xml: "</>",
  html: "</>",
  css: "#",
  js: "JS",
  ts: "TS",
  py: "PY",
  rs: "RS",
  go: "GO",
  java: "JAVA",
  cpp: "CPP",
  c: "C",
  h: "H",
  zip: "ZIP",
  tar: "TAR",
  gz: "GZ",
  rar: "RAR",
  png: "IMG",
  jpg: "IMG",
  jpeg: "IMG",
  gif: "GIF",
  webp: "WEBP",
  svg: "SVG",
};

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function FileCard({ filename, base64, mime, downloadUrl }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const ext = getExtension(filename);
  const category = FILE_CATEGORIES[ext] || "File";
  const iconLabel = FILE_ICON_LABELS[ext] || ext.toUpperCase() || "FILE";

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (base64) {
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
      } else if (downloadUrl) {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-[#1c1c1c] px-5 py-4 w-full max-w-2xl">
      <div className="flex items-center gap-[18px] min-w-0">
        <div
          className="flex flex-shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-white/25 bg-[#242424]"
          style={{ width: 46, height: 58, transform: "rotate(-8deg)" }}
        >
          <span
            className="font-mono text-white/50"
            style={{ fontSize: 13, transform: "rotate(8deg)" }}
          >
            {iconLabel}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-white">
            {filename}
          </p>
          <p className="mt-[3px] text-[13px] text-white/45">
            {category} · {ext.toUpperCase() || "FILE"}
          </p>
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={(!base64 && !downloadUrl) || downloading}
        className="flex-shrink-0 rounded-[10px] border border-white/15 bg-transparent px-[18px] py-[9px] text-sm font-medium text-white transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {downloading ? (
          <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          "Download"
        )}
      </button>
    </div>
  );
}
