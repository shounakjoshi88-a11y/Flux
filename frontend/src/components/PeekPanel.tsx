// src/components/PeekPanel.tsx
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, AlertTriangle, Globe, FileType, FileText, Table } from "lucide-react";
import { useState, useEffect } from "react";
import { PptxPreview } from "./PptxPreview";
import { XlsxPreview } from "./XlsxPreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";

type PeekPanelProps = {
  url: string | null;
  onClose: () => void;
  // Optional PDF data
  pdfData?: {
    base64: string;
    filename: string;
  } | null;
  // Optional DOCX data (mammoth converted HTML)
  docxData?: {
    html: string;
    filename: string;
  } | null;
  // Optional PPTX data
  pptxData?: {
    base64: string;
    filename: string;
  } | null;
  // Optional XLSX/CSV/TSV data
  xlsxData?: {
    base64: string;
    filename: string;
  } | null;
  // Optional Markdown data
  mdData?: {
    base64: string;
    filename: string;
  } | null;
};

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function PeekPanel({ url, onClose, pdfData, docxData, pptxData, xlsxData, mdData }: PeekPanelProps) {
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // Proxied HTML for regular web URLs (avoids X-Frame-Options / CSP blocks)
  const [proxiedHtml, setProxiedHtml] = useState<string | null>(null);
  const [isProxying, setIsProxying] = useState(false);

  // Determine what to display
  const isPdf = !!pdfData;
  const isDocx = !!docxData;
  const isPptx = !!pptxData;
  const isXlsx = !!xlsxData;
  const isMd = !!mdData;

  const displayTitle = pdfData?.filename || 
                       docxData?.filename || 
                       pptxData?.filename || 
                       xlsxData?.filename || 
                       mdData?.filename || 
                       (url ? extractDomain(url) : "");

  const displayUrl = pdfData?.filename || 
                     docxData?.filename || 
                     pptxData?.filename || 
                     xlsxData?.filename || 
                     mdData?.filename || 
                     url;

  // ── PDF: build blob URL ──────────────────────────────────
  useEffect(() => {
    if (!pdfData?.base64) { setBlobUrl(null); return; }
    setIframeError(false);
    setIframeLoading(true);
    try {
      const byteChars = atob(pdfData.base64);
      const byteNums = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteNums], { type: "application/pdf" });
      const u = URL.createObjectURL(blob);
      setBlobUrl(u);
      return () => URL.revokeObjectURL(u);
    } catch (e) {
      console.error("Failed to create PDF blob:", e);
      setIframeError(true);
    }
  }, [pdfData]);

  // ── Web URL: fetch through authenticated proxy ───────────
  useEffect(() => {
    if (!url || isPdf || isDocx || isPptx || isXlsx || isMd) {
      setProxiedHtml(null);
      return;
    }
    let cancelled = false;
    setIframeError(false);
    setIframeLoading(true);
    setProxiedHtml(null);
    setIsProxying(true);

    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const resp = await fetch(
          `${BACKEND_URL}/proxy?url=${encodeURIComponent(url)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!resp.ok) throw new Error(`Proxy returned ${resp.status}`);
        const html = await resp.text();
        if (!cancelled) {
          setProxiedHtml(html);
          setIsProxying(false);
        }
      } catch (e) {
        console.error("[PeekPanel] proxy fetch error:", e);
        if (!cancelled) {
          setIframeError(true);
          setIsProxying(false);
          setIframeLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, isPdf, isDocx, isPptx, isXlsx, isMd]);

  // Shimmer animation for loading state
  const shimmerClasses =
    "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent";

  // Unified Render logic for custom formats (PPTX, XLSX, MD)
  if (pptxData || xlsxData || mdData) {
    return (
      <AnimatePresence>
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%", opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[600px] z-[110] shadow-2xl flex flex-col overflow-hidden"
          >
            {pptxData && (
              <PptxPreview 
                base64={pptxData.base64} 
                filename={pptxData.filename} 
                onClose={onClose} 
                onDownload={() => {
                  const link = document.createElement("a");
                  link.href = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${pptxData.base64}`;
                  link.download = pptxData.filename;
                  link.click();
                }}
              />
            )}
            {xlsxData && (
              <XlsxPreview 
                base64={xlsxData.base64} 
                filename={xlsxData.filename} 
                onClose={onClose} 
                onDownload={() => {
                  const link = document.createElement("a");
                  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${xlsxData.base64}`;
                  link.download = xlsxData.filename;
                  link.click();
                }}
              />
            )}
            {mdData && (
              <MarkdownPreview 
                base64={mdData.base64} 
                filename={mdData.filename} 
                onClose={onClose} 
                onDownload={() => {
                  const link = document.createElement("a");
                  link.href = `data:text/markdown;base64,${mdData.base64}`;
                  link.download = mdData.filename;
                  link.click();
                }}
              />
            )}
          </motion.div>
        </>
      </AnimatePresence>
    );
  }

  // Build the iframe src / srcDoc for standard formats (PDF, URL, DOCX)
  const iframeSrc = isPdf ? blobUrl : null;
  // Web URLs → use proxied HTML as srcDoc to avoid X-Frame-Options / CSP blocks
  const webSrcDoc = (!isPdf && !isDocx && proxiedHtml) ? proxiedHtml : null;
  
  // Build docx source if needed
  const docxHtml = isDocx ? `
    <html>
      <head>
        <style>
          body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #1a1a1a; background: #fff; }
          h1,h2,h3 { font-weight: 600; } table { border-collapse: collapse; width: 100%; }
          td,th { border: 1px solid #ddd; padding: 8px 12px; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>${docxData?.html}</body>
    </html>
  ` : "";

  return (
    <AnimatePresence>
      {(url || pdfData || docxData) && (
        <>
          {/* Backdrop (Higher z-index to stay above ArtifactsModal but below panel) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[105] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel (Highest z-index) */}
          <motion.div
            initial={{ x: "100%", opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-[#0d0d0d] border-l border-black/5 dark:border-white/5 z-[110] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 shrink-0 bg-white/80 dark:bg-[#0d0d0d]/80 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                {/* Icon: PDF, DOCX or Globe */}
                <div className={`p-1.5 rounded-xl bg-gradient-to-br ${isPdf ? 'from-red-500/10 to-pink-500/10' : isDocx ? 'from-blue-500/10 to-indigo-500/10' : 'from-indigo-500/10 to-purple-500/10'} ring-1 ring-black/5 dark:ring-white/10`}>
                  {isPdf ? (
                    <FileType className="size-4 text-red-500/80" />
                  ) : isDocx ? (
                    <FileText className="size-4 text-blue-500/80" />
                  ) : (
                    <Globe className="size-4 text-indigo-500/80" />
                  )}
                </div>
                <div className="truncate">
                  <p className="text-sm font-semibold truncate text-foreground leading-tight">
                    {displayTitle}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {isPdf ? "PDF Document" : isDocx ? "Word Document" : displayUrl}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-3">
                {(!isPdf && !isDocx) && (
                  <a
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
                {isDocx && (
                  <button
                    onClick={() => {
                      const win = window.open("", "_blank");
                      if (win) { win.document.write(docxHtml); win.document.close(); }
                    }}
                    className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                  >
                    <ExternalLink className="size-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 relative bg-[#fcfcfc] dark:bg-[#0a0a0a]">
              {/* Loading shimmer — shown while proxying OR while iframe loads */}
              {(iframeLoading || isProxying) && !iframeError && (
                <div className="absolute inset-0 z-10 overflow-hidden bg-inherit">
                  <div className="flex flex-col gap-4 p-6">
                    <div className={`relative h-4 w-3/4 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                    <div className={`relative h-4 w-1/2 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                    <div className={`relative h-4 w-5/6 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                    <div className={`relative h-4 w-2/3 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                    <div className={`relative h-32 w-full rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 mt-2 ${shimmerClasses}`} />
                    <div className={`relative h-4 w-3/5 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                    <div className={`relative h-4 w-4/5 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 ${shimmerClasses}`} />
                  </div>
                </div>
              )}

              {/* Iframe */}
              {!iframeError && (iframeSrc || webSrcDoc || isDocx) ? (
                <iframe
                  key={iframeSrc ?? (webSrcDoc ? "proxy" : "docx")}
                  src={iframeSrc ?? undefined}
                  srcDoc={webSrcDoc ?? (isDocx ? docxHtml : undefined)}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  title={
                    isPdf ? `Preview of ${pdfData?.filename}` :
                    isDocx ? `Preview of ${docxData?.filename}` :
                    `Preview of ${displayTitle}`
                  }
                  onLoad={() => setIframeLoading(false)}
                  onError={() => {
                    setIframeError(true);
                    setIframeLoading(false);
                  }}
                />
              ) : (
                /* Error fallback */
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
                  <div className="p-4 rounded-full bg-amber-500/10 ring-1 ring-amber-500/20">
                    <AlertTriangle className="size-8 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {isPdf ? "Failed to load PDF" : "Can't preview this page"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {isPdf
                        ? "The PDF may be corrupted or unsupported."
                        : "This site may block embedding or have a restrictive content security policy."}
                    </p>
                  </div>
                  {!isPdf && url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-black rounded-full px-5 py-2.5 hover:opacity-90 transition-opacity shadow-sm"
                    >
                      Open in new tab
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}