// src/components/ArtifactsModal.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  FileText,
  Presentation,
  FileType,
  Download,
  ExternalLink,
  Loader2,
  Inbox,
  ArrowUpRight,
  File,
  Table,
} from "lucide-react";
import { BACKEND_URL } from "@/lib/config";
import { createClient } from "@/lib/client";
import mammoth from "mammoth";

const supabase = createClient();

// ─── Module-level cache ───────────────────────────────────────
// Persists across modal opens/closes and even component remounts.
type ArtifactsCache = {
  artifacts: Artifact[];
  hasMore: boolean;
  page: number;
  ts: number;
};
let _cache: ArtifactsCache | null = null;
const CACHE_TTL_MS = 60_000; // treat cache as fresh for 60 s

// Cached session token so we don't call getSession() on every fetch
let _tokenCache: { token: string; exp: number } | null = null;
async function getCachedToken(): Promise<string | null> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.exp > now + 5_000) return _tokenCache.token;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  // Supabase JWTs expire in 1 h; refresh 2 min before expiry
  const exp = session.expires_at ? session.expires_at * 1000 : now + 3600_000;
  _tokenCache = { token: session.access_token, exp };
  return session.access_token;
}

// Exported so Sidebar can kick off a prefetch on hover
export async function prefetchArtifacts(backendUrl: string) {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return; // already fresh
  try {
    const token = await getCachedToken();
    if (!token) return;
    const res = await fetch(`${backendUrl}/artifacts?page=1&limit=24`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });
    if (!res.ok) return;
    const data = await res.json();
    const artifacts: Artifact[] = data.artifacts || [];
    _cache = { artifacts, hasMore: data.pagination?.hasMore ?? false, page: 1, ts: Date.now() };
  } catch { /* silently ignore */ }
}

type Artifact = {
  id: string;
  filename?: string;
  name?: string;
  mime: string;
  base64?: string;
  thumbnail?: string;
  type: "uploaded" | "generated";
  placeholder?: boolean;
  conversationId: string;
  conversationTitle: string;
  createdAt: string;
  messageId: string | number;
  index: number;
  slides?: any[];
  sections?: any[];
  pages?: any[];
};

type ArtifactsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onPreview: (data: { 
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; 
    base64?: string; 
    html?: string; 
    filename: string 
  }) => void;
};

function getFileConfig(art: Artifact) {
  const filename = art.filename || art.name || "";
  const ext = filename.split(".").pop()?.toLowerCase();
  const isPdf   = ext === "pdf"  || art.mime === "application/pdf";
  const isPptx  = ext === "pptx" || art.mime.includes("presentation");
  const isDocx  = ext === "docx" || art.mime.includes("word");
  const isXlsx  = ext === "xlsx" || art.mime.includes("spreadsheet") || ext === "csv" || ext === "tsv";
  const isMd    = ext === "md"   || art.mime.includes("markdown");
  const isTxt   = ext === "txt"  || art.mime.includes("text");
  const isImage = art.mime.startsWith("image/");

  if (isPptx) return { Icon: Presentation, label: "PPTX", color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", isPdf: false, isPptx: true, isDocx: false, isXlsx: false, isMd: false, isImage: false };
  if (isDocx) return { Icon: FileText,     label: "DOCX", color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   isPdf: false, isPptx: false, isDocx: true, isXlsx: false, isMd: false, isImage: false };
  if (isXlsx) return { Icon: Table,        label: ext?.toUpperCase() || "XLSX", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", isPdf: false, isPptx: false, isDocx: false, isXlsx: true, isMd: false, isImage: false };
  if (isMd)   return { Icon: FileText,     label: "MD",   color: "text-indigo-400", bg: "bg-indigo-400/10", border: "border-indigo-400/20", isPdf: false, isPptx: false, isDocx: false, isXlsx: false, isMd: true, isImage: false };
  if (isPdf)  return { Icon: FileType,     label: "PDF",  color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    isPdf: true,  isPptx: false, isDocx: false, isXlsx: false, isMd: false, isImage: false };
  if (isTxt)  return { Icon: File,         label: "TXT",  color: "text-zinc-400",   bg: "bg-zinc-400/10",   border: "border-zinc-400/20",   isPdf: false, isPptx: false, isDocx: false, isXlsx: false, isMd: false, isImage: false };
  if (isImage) return { Icon: FileType,    label: "IMG",  color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  isPdf: false, isPptx: false, isDocx: false, isXlsx: false, isMd: false, isImage: true };
  return       { Icon: FileType, label: ext?.toUpperCase() || "FILE", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20", isPdf: false, isPptx: false, isDocx: false, isXlsx: false, isMd: false, isImage: false };
}

function ArtifactCard({
  art, index, onDownload, onPreview, onSelectConversation, onClose,
}: {
  art: Artifact; index: number;
  onDownload: (a: Artifact) => Promise<void>;
  onPreview: (a: Artifact) => Promise<void>;
  onSelectConversation: (id: string) => void;
  onClose: () => void;
}) {
  const filename = art.filename || art.name || "Untitled";
  const { Icon, color, bg, border, isPdf, isPptx, isDocx, isXlsx, isMd, isImage } = getFileConfig(art);
  const date = new Date(art.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const [opLoading, setOpLoading] = useState(false);

  const handleAction = async (fn: (a: Artifact) => Promise<void>) => {
    setOpLoading(true);
    try { await fn(art); }
    finally { setOpLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.025, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -1, transition: { duration: 0.12 } }}
      className="group flex flex-col bg-[var(--surface-bg)] hover:bg-[var(--surface-bg)]/80 border border-[var(--surface-border)] hover:border-[var(--accent)]/30 rounded-xl p-3.5 transition-colors duration-150 relative overflow-hidden"
    >
      {/* Visual Preview for Images */}
      {isImage && (art.thumbnail || art.base64) && (
        <div className="absolute inset-0 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity pointer-events-none">
          <img 
            src={art.base64 ? `data:${art.mime};base64,${art.base64}` : `data:image/jpeg;base64,${art.thumbnail}`} 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Icon + badge row */}
      <div className="flex items-center justify-between mb-2.5 relative z-10">
        <div className={`p-1.5 rounded-lg ${bg} border ${border}`}>
          <Icon className={`size-3.5 ${color}`} />
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${bg} ${color} uppercase tracking-wide`}>
          {art.type === "uploaded" ? "Upload" : "AI"}
        </span>
      </div>

      {/* Filename */}
      <p className="text-xs font-semibold text-[var(--text-primary)] truncate mb-0.5 relative z-10" title={filename}>
        {filename}
      </p>

      {/* Conversation link */}
      <button
        onClick={() => { onSelectConversation(art.conversationId); onClose(); }}
        className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]/60 hover:text-[var(--text-secondary)] transition-colors mb-2.5 truncate group/link w-full text-left relative z-10"
      >
        <span className="truncate">{art.conversationTitle}</span>
        <ArrowUpRight className="size-2.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
      </button>

      {/* Date + actions */}
      <div className="flex items-center gap-1.5 mt-auto relative z-10">
        <span className="text-[10px] text-[var(--text-muted)]/40 mr-auto">{date}</span>

        {isPdf || isDocx || isPptx || isXlsx || isMd ? (
          <button
            onClick={() => handleAction(onPreview)}
            disabled={opLoading}
            className="text-[10px] font-medium px-2 py-1 rounded-lg bg-[var(--surface-bg)] hover:bg-[var(--surface-bg)]/80 border border-[var(--surface-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5"
          >
            {opLoading && <Loader2 className="size-2.5 animate-spin" />}
            Preview
          </button>
        ) : (
          <button
            onClick={() => handleAction(onDownload)}
            disabled={opLoading}
            className="text-[10px] font-medium px-2 py-1 rounded-lg bg-[var(--surface-bg)] hover:bg-[var(--surface-bg)]/80 border border-[var(--surface-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5"
          >
            {opLoading && <Loader2 className="size-2.5 animate-spin" />}
            Download
          </button>
        )}

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => handleAction(onDownload)}
          disabled={opLoading}
          title="Download"
          className="p-1 rounded-lg bg-[var(--surface-bg)] hover:bg-[var(--surface-bg)]/80 border border-[var(--surface-border)] text-[var(--text-muted)]/50 hover:text-[var(--text-primary)]/70 transition-all"
        >
          <Download className="size-3" />
        </motion.button>
      </div>
    </motion.div>
  );
}

export function ArtifactsModal({ isOpen, onClose, onSelectConversation, onPreview }: ArtifactsModalProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => _cache?.artifacts ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(() => _cache?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => _cache?.hasMore ?? false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "uploaded" | "generated">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchArtifacts = useCallback(async (pageNum: number, isInitial = false, silent = false) => {
    if (!silent) {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
    }

    try {
      const token = await getCachedToken();
      if (!token) return;
      
      const res = await fetch(`${BACKEND_URL}/artifacts?page=${pageNum}&limit=24`, { 
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch");
      
      const data = await res.json();
      const newItems: Artifact[] = data.artifacts || [];
      const newHasMore = data.pagination?.hasMore ?? false;
      
      // Update module-level cache (only for page-1 loads)
      if (pageNum === 1) {
        _cache = { artifacts: newItems, hasMore: newHasMore, page: 1, ts: Date.now() };
      }

      setArtifacts(prev => isInitial ? newItems : [...prev, ...newItems]);
      setHasMore(newHasMore);
      setPage(pageNum);
    } catch (err) {
      console.error("Error fetching artifacts:", err);
    } finally {
      if (!silent) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const isFresh = _cache && Date.now() - _cache.ts < CACHE_TTL_MS;
      if (isFresh) {
        // Instantly populate from cache, then silently refresh in background
        setArtifacts(_cache!.artifacts);
        setHasMore(_cache!.hasMore);
        setPage(_cache!.page);
        fetchArtifacts(1, true, true); // silent background refresh
      } else {
        fetchArtifacts(1, true); // normal load with spinner (cold open)
      }
      setTimeout(() => searchRef.current?.focus(), 150);
    } else {
      // Keep artifacts in state for instant next open — just reset UI state
      setSearch("");
      setFilter("all");
    }
  }, [isOpen, fetchArtifacts]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchArtifacts(page + 1);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((art) => {
      const name = (art.filename || art.name || "").toLowerCase();
      const title = art.conversationTitle.toLowerCase();
      const q = search.toLowerCase();
      return (name.includes(q) || title.includes(q)) && (filter === "all" || art.type === filter);
    });
  }, [artifacts, search, filter]);

  const ensureBase64 = async (art: Artifact): Promise<string> => {
    if (art.base64) return art.base64;
    
    const token = await getCachedToken();
    if (!token) throw new Error("Not authenticated");

    const assetType = art.type === "uploaded" ? "upload" : "generated";
    const res = await fetch(`${BACKEND_URL}/api/assets/${art.messageId}/${assetType}/${art.index}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });
    if (!res.ok) throw new Error("Failed to fetch asset data");
    const data = await res.json();
    if (!data.base64) throw new Error("No data returned");
    
    // Cache it locally so we don't fetch twice
    art.base64 = data.base64;
    return data.base64;
  };

  const handleDownload = async (art: Artifact) => {
    try {
      const b64 = await ensureBase64(art);
      const filename = art.filename || art.name || "file";
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: art.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) { console.error("Download failed:", err); }
  };

  const handlePreviewAction = async (art: Artifact) => {
    const filename = art.filename || art.name || "file";
    const ext = filename.split(".").pop()?.toLowerCase();
    
    try {
      const b64 = await ensureBase64(art);

      if (ext === "pdf" || art.mime === "application/pdf") {
        onPreview({ type: 'pdf', base64: b64, filename });
      } else if (ext === "pptx" || art.mime.includes("presentation")) {
        onPreview({ type: 'pptx', base64: b64, filename });
      } else if (ext === "xlsx" || art.mime.includes("spreadsheet") || ext === "csv" || ext === "tsv") {
        onPreview({ type: 'xlsx', base64: b64, filename });
      } else if (ext === "md" || art.mime.includes("markdown")) {
        onPreview({ type: 'md', base64: b64, filename });
      } else if (ext === "docx" || art.mime.includes("word")) {
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const result = await mammoth.convertToHtml({ arrayBuffer: arr.buffer });
        onPreview({ type: 'docx', html: result.value, filename });
      } else {
        handleDownload(art);
      }
    } catch (err) {
      console.error("Preview failed:", err);
    }
  };

  const FILTERS = [
    { key: "all",       label: "All",       count: artifacts.length },
    { key: "uploaded",  label: "Uploaded",  count: artifacts.filter(a => a.type === "uploaded").length },
    { key: "generated", label: "Generated", count: artifacts.filter(a => a.type === "generated").length },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-5xl max-h-[82vh] flex flex-col bg-[var(--bg-primary)] backdrop-blur-2xl border border-[var(--surface-border)] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--surface-border)] shrink-0">
              <div className="flex items-center gap-2 flex-1 bg-[var(--bg-secondary)] border border-[var(--surface-border)] rounded-lg px-3 py-2 focus-within:border-[var(--accent)]/40 transition-colors">
                <Search className="size-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search files and conversations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 min-w-0"
                />
                <AnimatePresence>
                  {search && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.1 }}
                      onClick={() => setSearch("")}
                      className="p-0.5 rounded hover:bg-[var(--surface-bg)] transition-colors"
                    >
                      <X className="size-3 text-[var(--text-muted)]/60" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Filter pills — Claude-style segmented control */}
              <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] border border-[var(--surface-border)] rounded-lg p-0.5 shrink-0">
                {FILTERS.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`relative px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                      filter === key ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {filter === key && (
                      <motion.div
                        layoutId="filter-pill"
                        className="absolute inset-0 bg-[var(--surface-card)] rounded-md shadow-sm"
                        transition={{ type: "spring", stiffness: 450, damping: 38 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1">
                      {label}
                      <span className={`text-[10px] tabular-nums ${filter === key ? "text-[var(--text-muted)]" : "text-[var(--text-muted)]/40"}`}>
                        {count}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all shrink-0"
              >
                <X className="size-4" />
              </motion.button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
              <AnimatePresence mode="wait">
                {loading && filteredArtifacts.length === 0 ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="flex flex-col bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-xl p-3.5 gap-2.5 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="size-7 rounded-lg bg-[var(--surface-border)]" />
                          <div className="w-10 h-3.5 rounded-full bg-[var(--surface-border)]/60" />
                        </div>
                        <div className="w-3/4 h-3 rounded bg-[var(--surface-border)]" />
                        <div className="w-full h-2.5 rounded bg-[var(--surface-border)]/60" />
                        <div className="flex items-center gap-1.5 mt-auto pt-1">
                          <div className="w-8 h-2.5 rounded bg-[var(--surface-border)]/40" />
                          <div className="ml-auto w-12 h-5 rounded-lg bg-[var(--surface-border)]/60" />
                          <div className="size-5 rounded-lg bg-[var(--surface-border)]/60" />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                ) : !loading && filteredArtifacts.length === 0 ? (
                  <motion.div key="empty" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-48 gap-2">
                    <div className="p-3 rounded-xl bg-[var(--surface-bg)]">
                      <Inbox className="size-6 text-[var(--text-muted)]/30" />
                    </div>
                    <p className="text-sm text-[var(--text-muted)]/50">
                      {search ? `No files matching "${search}"` : "No files yet"}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`grid-${filter}-${search}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="flex flex-col gap-6"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                      {filteredArtifacts.map((art, i) => (
                        <ArtifactCard
                          key={art.id} art={art} index={i}
                          onDownload={handleDownload}
                          onPreview={handlePreviewAction}
                          onSelectConversation={onSelectConversation}
                          onClose={onClose}
                        />
                      ))}
                    </div>

                    {hasMore && (
                      <div className="flex justify-center pb-8">
                        <button
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="px-6 py-2 rounded-xl bg-[var(--surface-bg)] hover:bg-[var(--surface-bg)]/80 border border-[var(--surface-border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2"
                        >
                          {loadingMore ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              Loading more...
                            </>
                          ) : (
                            "Load More"
                          )}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-[var(--surface-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]/50">
                  <span className="size-1.5 rounded-full bg-emerald-400/80 inline-block" />
                  {artifacts.filter(a => a.type === "uploaded").length} uploaded
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]/50">
                  <span className="size-1.5 rounded-full bg-violet-400/80 inline-block" />
                  {artifacts.filter(a => a.type === "generated").length} generated
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]/40">
                {filteredArtifacts.length} file{filteredArtifacts.length !== 1 ? "s" : ""}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}