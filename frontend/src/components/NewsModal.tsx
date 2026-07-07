// src/components/NewsModal.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, ExternalLink, RefreshCw, Clock, BookOpen } from "lucide-react";
import { BACKEND_URL } from "../lib/config";
import { createClient } from "../lib/client";
import { MessageRenderer } from "./MessageRenderer";
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
if (!_supabase) _supabase = createClient();
return _supabase;
}

type NewsItem = {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
  source: string;
};

type NewsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onReadArticle?: (url: string) => void;
};

// —— Palette: Refined Vermillion × Ink × Paper ———————————————————
const P = {
  bg: "#181715",
  bgPanel: "#1f1e1b",
  bgCard: "#252320",
  bgCardHover: "#2a2825",
  verm: "#cc785c",
  vermDim: "#a9583e",
  vermGlow: "rgba(204,120,92,0.12)",
  vermBorder: "rgba(204,120,92,0.25)",
  gold: "#e8a55a",
  paper: "#faf9f5",
  paperFaint: "rgba(250,249,245,0.15)",
  ink: "rgba(250,249,245,0.92)",
  inkMid: "rgba(250,249,245,0.6)",
  inkFaint: "rgba(250,249,245,0.35)",
  inkGhost: "rgba(250,249,245,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderFaint: "rgba(255,255,255,0.04)",
};

const CATEGORIES = [
  { label: "All", en: "All", query: "latest breaking world news" },
  { label: "World", en: "World", query: "world news international" },
  { label: "Tech", en: "Tech", query: "technology AI news" },
  { label: "Business", en: "Business", query: "business economy finance news" },
  { label: "Science", en: "Science", query: "science research discovery" },
  { label: "Politics", en: "Politics", query: "politics government news" },
];

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min`;
}

// —— Minimal SVG Icons ——————————————————————————————————————————
const ToriiMark = ({ size = 20, color = P.verm }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 6.5 Q12 4 22 6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="1.5" y1="6.5" x2="1.5" y2="8.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="22.5" y1="6.5" x2="22.5" y2="8.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="4" y1="10.5" x2="20" y2="10.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="7" y1="8.5" x2="7" y2="23" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="17" y1="8.5" x2="17" y2="23" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SearchIcon = ({ size = 16, color = P.inkFaint }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.5" cy="8.5" r="5.5" stroke={color} strokeWidth="1.5" />
    <line x1="12.5" y1="12.5" x2="17" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// —— Particle System ————————————————————————————————————————————
type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  color: string;
};

const PARTICLE_COUNT = 18;
const PARTICLE_COLORS = [
  P.verm,
  P.gold,
  P.paper,
  P.inkFaint,
  "rgba(196,80,42,0.4)",
  "rgba(212,148,71,0.35)",
];

function generateParticles(): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 1,
      opacity: Math.random() * 0.35 + 0.08,
      duration: Math.random() * 18 + 14,
      delay: Math.random() * 10,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]!,
    });
  }
  return particles;
}

const Particle = ({ particle }: { particle: Particle }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      left: `${particle.x}%`,
      top: `${particle.y}%`,
      width: particle.size,
      height: particle.size,
      background: particle.color,
      opacity: particle.opacity,
      filter: `blur(${particle.size > 2 ? 0.5 : 0}px)`,
    }}
    animate={{
      y: [0, -120, -240],
      x: [0, Math.random() * 40 - 20, Math.random() * 60 - 30],
      opacity: [particle.opacity, particle.opacity * 1.4, 0],
    }}
    transition={{
      duration: particle.duration,
      delay: particle.delay,
      repeat: Infinity,
      ease: "linear",
    }}
  />
);

function ParticleField() {
  const [particles] = useState<Particle[]>(generateParticles);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
      {particles.map((p) => (
        <Particle key={p.id} particle={p} />
      ))}
    </div>
  );
}

// —— News Peek Panel ———————————————————————————————————————————
function NewsPeekPanel({ url, onClose }: { url: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const blobUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    setBlobUrl(null);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const load = async () => {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        const token = session?.access_token;
        const res = await fetch(
          `${BACKEND_URL}/proxy?url=${encodeURIComponent(url)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!res.ok) throw new Error(`Proxy returned HTTP ${res.status}`);
        const html = await res.text();
        if (cancelled) return;
        const blob = new Blob([html], { type: "text/html; charset=utf-8" });
        const objUrl = URL.createObjectURL(blob);
        blobUrlRef.current = objUrl;
        setBlobUrl(objUrl);
      } catch (err: any) {
        console.error("[PeekPanel] load failed:", err?.message ?? err);
        if (!cancelled) setState("error");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [url]);

  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleIframeLoad = () => {
    if (blobUrl) setState("ready");
  };

  return (
    <motion.div className="absolute inset-0 z-40 flex flex-col" initial={{ x: "100%", opacity: 0.9 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32 }} style={{ background: P.bg }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${P.border}`, background: `${P.bgPanel}f5` }}>
        <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={onClose} className="flex items-center gap-2 rounded-lg font-semibold" style={{ fontSize: 12, color: P.inkMid, background: P.inkGhost, border: `1px solid ${P.borderFaint}`, padding: "6px 12px" }}>
          ← Back
        </motion.button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="truncate" style={{ fontSize: 12, color: P.inkFaint }}>
            {(() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })()}
          </span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg font-semibold" style={{ fontSize: 12, color: P.verm, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, padding: "6px 12px", textDecoration: "none" }}>
          Open <ExternalLink size={12} />
        </a>
      </div>
      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {state === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" style={{ background: P.bg }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${P.border}`, borderTopColor: P.verm }} />
            <span style={{ fontSize: 12, color: P.inkFaint }}>Loading article…</span>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" style={{ background: P.bg }}>
            <ToriiMark size={36} color={P.vermDim} />
            <p className="text-center" style={{ fontSize: 13, color: P.inkFaint, maxWidth: 280 }}> Preview unavailable for this article. </p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold rounded-lg px-4 py-2" style={{ fontSize: 12, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.verm, textDecoration: "none" }}>
              Open in new tab
            </a>
          </div>
        )}
        <iframe key={blobUrl ?? "empty"} src={blobUrl ?? "about:blank"} className="w-full h-full border-none" title="Article preview" onLoad={handleIframeLoad} style={{ background: "#fff", opacity: state === "ready" ? 1 : 0, transition: "opacity 0.3s ease" }} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" />
      </div>
    </motion.div>
  );
}

// —— Main Component —————————————————————————————————————————————
const AUTO_REFRESH_MS = 90_000;
const SEARCH_DEBOUNCE_MS = 500;

export function NewsModal({ isOpen, onClose }: NewsModalProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI summary
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);

  const fetchNews = useCallback(async (categoryQuery?: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setFetchError("Not authenticated. Please sign in.");
        return;
      }
      const cat = categoryQuery ?? "";
      const url = `${BACKEND_URL}/news${cat ? `?category=${encodeURIComponent(cat)}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch news (${res.status})`);
      const data = await res.json();
      const articles: NewsItem[] = Array.isArray(data) ? data : (data.news ?? data.articles ?? data.results ?? data.data ?? []);
      setNews(articles);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Error fetching news:", err);
      setFetchError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, []);

  const activeCategoryRef = useRef(activeCategory);
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);

  const executeSearch = useCallback(async (query: string) => {
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    setSearching(true);
    setSearchError(null);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSearchError("Not authenticated. Please sign in.");
        return;
      }
      const res = await fetch(
        `${BACKEND_URL}/news/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctrl.signal }
      );
      if (!res.ok) {
        setSearchError(`Search failed (${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();
      const articles: NewsItem[] = Array.isArray(data) ? data : (data.news ?? data.articles ?? data.results ?? []);
      setNews(articles);
      setLastRefreshed(new Date());
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[Search] error:", err);
      setSearchError("Search failed. Check your connection.");
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSearchError(null);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      searchAbortRef.current?.abort();
      setSearching(false);
      const cat = CATEGORIES.find(c => c.en === activeCategoryRef.current)?.query;
      fetchNews(cat);
      return;
    }
    if (value.trim().length < 2) return;
    searchDebounceRef.current = setTimeout(() => {
      executeSearch(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }, [fetchNews, executeSearch]);

  const handleSearchSubmit = useCallback(() => {
    const query = search.trim();
    if (query.length < 2) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    executeSearch(query);
  }, [search, executeSearch]);

  const openArticleSummary = useCallback(async (article: NewsItem) => {
    summaryAbortRef.current?.abort();
    const ctrl = new AbortController();
    summaryAbortRef.current = ctrl;
    setSelectedArticle(article);
    setSummary("");
    setSummaryError(null);
    setSummaryLoading(true);
    setSummaryStreaming(false);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`${BACKEND_URL}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: article.url, title: article.title, content: article.content }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      if (!res.body) throw new Error("No response body");
      setSummaryLoading(false);
      setSummaryStreaming(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const idx = buffer.indexOf("\n\n");
          if (idx === -1) break;
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!event.trim()) continue;
          const dataLines: string[] = [];
          for (const line of event.split("\n")) {
            if (line.startsWith("data: ")) dataLines.push(line.slice(6));
          }
          const payload = dataLines.join("\n");
          if (!payload) continue;
          if (payload === "[DONE]") break outer;
          setSummary(prev => prev + payload);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[Summary]", err);
      setSummaryError(err?.message ?? "Could not generate summary.");
    } finally {
      setSummaryLoading(false);
      setSummaryStreaming(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (search.trim()) return;
    const cat = CATEGORIES.find(c => c.en === activeCategory)?.query;
    fetchNews(cat);
    if (activeCategory === "All") {
      setTimeout(() => searchRef.current?.focus(), 300);
    }
  }, [isOpen, activeCategory, fetchNews]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => {
      if (search.trim()) return;
      const cat = CATEGORIES.find(c => c.en === activeCategory)?.query;
      fetchNews(cat);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [isOpen, activeCategory, search, fetchNews]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedArticle) {
          summaryAbortRef.current?.abort();
          setSelectedArticle(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const filteredNews = news;
  const featured = filteredNews[0] ?? null;
  const gridItems = filteredNews.slice(1);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[200] flex flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" style={{ background: P.bg }}>
          {/* Particle background */}
          <ParticleField />

          {/* —— Header —————————————————————————————— */}
          <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05, type: "spring", stiffness: 300, damping: 28 }} className="relative z-10 shrink-0 flex items-center gap-4 px-5 py-3" style={{ background: `${P.bgPanel}fa`, borderBottom: `1px solid ${P.border}`, backdropFilter: "blur(16px)" }}>
            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center justify-center" style={{ width: 36, height: 36, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, borderRadius: 8 }}>
                <ToriiMark size={18} color={P.verm} />
              </div>
              <div>
                <h1 className="font-bold tracking-tight" style={{ fontSize: 14, color: P.paper, fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif" }}> News </h1>
                <p className="uppercase tracking-widest" style={{ fontSize: 9, color: P.inkFaint, fontWeight: 600 }}> Live Feed </p>
              </div>
            </div>
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all" style={{ background: P.inkGhost, border: `1px solid ${P.borderFaint}` }}>
                <SearchIcon size={14} color={searching ? P.verm : P.inkFaint} />
                <input ref={searchRef} type="text" placeholder="Search headlines…" value={search} onChange={e => handleSearchChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSearchSubmit(); }} className="flex-1 bg-transparent outline-none min-w-0" style={{ fontSize: 13, color: P.ink, caretColor: P.verm, fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }} />
                {searching && (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} style={{ width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${P.border}`, borderTopColor: P.verm }} />
                )}
                {search && !searching && (
                  <button onClick={() => handleSearchChange("")} className="rounded p-0.5 transition-colors" style={{ color: P.inkMid }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {lastRefreshed && (
                <span className="hidden sm:flex items-center gap-1.5" style={{ fontSize: 11, color: P.inkFaint }}>
                  <Clock size={12} />
                  {timeAgo(lastRefreshed.toISOString())}
                </span>
              )}
              <button onClick={() => { handleSearchChange(""); }} disabled={loading || searching} className="flex items-center gap-1.5 rounded-lg transition-all disabled:opacity-40" style={{ background: P.inkGhost, border: `1px solid ${P.borderFaint}`, padding: "6px 10px", color: P.inkMid }}>
                <RefreshCw size={13} style={{ animation: loading || searching ? "spin 1s linear infinite" : "none" }} />
                <span className="hidden sm:inline" style={{ fontSize: 11, fontWeight: 500 }}>Refresh</span>
              </button>
              <button onClick={onClose} className="flex items-center gap-1.5 rounded-lg transition-all" style={{ background: `${P.verm}15`, border: `1px solid ${P.vermBorder}`, padding: "6px 10px", color: P.verm }}>
                <X size={14} />
                <span className="hidden sm:inline" style={{ fontSize: 11, fontWeight: 600 }}>Close</span>
              </button>
            </div>
          </motion.header>

          {/* —— Category Tabs ——————————————————————— */}
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="relative z-10 shrink-0 flex items-center gap-1 px-5 py-2 overflow-x-auto" style={{ background: `${P.bg}ee`, borderBottom: `1px solid ${P.borderFaint}` }}>
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.en;
              return (
                <button key={cat.en} onClick={() => setActiveCategory(cat.en)} className="shrink-0 rounded-md font-medium transition-all duration-200" style={{ padding: "6px 14px", fontSize: 12, background: isActive ? P.verm : P.inkGhost, border: `1px solid ${isActive ? P.vermBorder : P.borderFaint}`, color: isActive ? "#fff" : P.inkMid, fontWeight: isActive ? 600 : 500 }}>
                  {cat.label}
                </button>
              );
            })}
          </motion.div>

          {/* —— Main Content ——————————————————————— */}
          <div className="relative z-10 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {/* Loading */}
              {loading && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full gap-5">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${P.border}`, borderTopColor: P.verm }} />
                  <p style={{ fontSize: 13, color: P.inkFaint }}>Loading stories…</p>
                </motion.div>
              )}
              {/* Error */}
              {!loading && fetchError && (
                <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full gap-4">
                  <ToriiMark size={40} color={P.vermDim} />
                  <div className="text-center">
                    <p className="font-bold" style={{ fontSize: 14, color: P.verm }}>Error</p>
                    <p className="mt-1" style={{ fontSize: 12, color: P.inkFaint }}>{fetchError}</p>
                    <button onClick={() => fetchNews(CATEGORIES.find(c => c.en === activeCategory)?.query)} className="mt-3 font-semibold rounded-lg px-4 py-2" style={{ fontSize: 12, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.verm }}>
                      Retry
                    </button>
                  </div>
                </motion.div>
              )}
              {/* Search error */}
              {searchError && !loading && (
                <motion.div key="search-error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-lg" style={{ fontSize: 12, color: P.verm, background: P.vermGlow, border: `1px solid ${P.vermBorder}` }}>
                  <span>⚠ </span> {searchError}
                </motion.div>
              )}
              {/* Empty */}
              {!loading && !searching && !fetchError && filteredNews.length === 0 && (
                <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full gap-3">
                  <p className="font-bold" style={{ fontSize: 28, color: P.verm, opacity: 0.5 }}>—</p>
                  <p className="font-medium uppercase tracking-widest" style={{ fontSize: 11, color: P.inkFaint }}> No results </p>
                </motion.div>
              )}
              {/* Content */}
              {!loading && filteredNews.length > 0 && (
                <motion.div key={search.trim() && !searching ? `search-${search}` : `cat-${activeCategory}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: `${P.border} transparent` }}>
                  <div className="max-w-5xl mx-auto px-5 py-5">
                    {/* Featured */}
                    {featured && (
                      <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} onClick={() => openArticleSummary(featured)} className="mb-6 p-5 rounded-xl cursor-pointer group" style={{ background: P.bgCard, border: `1px solid ${P.borderFaint}`, transition: "all 0.25s ease" }} onMouseEnter={e => { const el = e.currentTarget; el.style.background = P.bgCardHover; el.style.borderColor = P.vermBorder; el.style.transform = "translateY(-2px)"; el.style.boxShadow = `0 8px 30px rgba(196,80,42,0.1)`; }} onMouseLeave={e => { const el = e.currentTarget; el.style.background = P.bgCard; el.style.borderColor = P.borderFaint; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="font-bold px-2 py-0.5 rounded" style={{ fontSize: 10, letterSpacing: "0.06em", background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.gold }}> {featured.source} </span>
                          <span style={{ fontSize: 11, color: P.inkFaint }}> {timeAgo(featured.publishedDate)} · {readingTime(featured.content)} </span>
                        </div>
                        <h2 className="font-bold leading-snug mb-3 transition-colors duration-200" style={{ fontSize: 20, color: P.paper, lineHeight: 1.45, fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif" }}> {featured.title} </h2>
                        <p className="leading-relaxed mb-4" style={{ fontSize: 13, color: P.inkMid, lineHeight: 1.75 }}> {featured.content.slice(0, 320)}{featured.content.length > 320 ? "…" : ""} </p>
                        <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 12, color: P.verm }}>
                          <BookOpen size={14} /> Read article
                        </div>
                      </motion.article>
                    )}
                    {/* Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(featured ? gridItems : filteredNews).map((item, i) => {
                        const isHov = hoveredIndex === i;
                        return (
                          <motion.article key={item.url} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 + 0.1 }} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} onClick={() => openArticleSummary(item)} className="flex flex-col rounded-lg cursor-pointer" style={{ background: isHov ? P.bgCardHover : P.bgCard, border: `1px solid ${isHov ? P.vermBorder : P.borderFaint}`, transform: isHov ? "translateY(-2px)" : "translateY(0)", transition: "all 0.2s ease", boxShadow: isHov ? `0 6px 20px rgba(196,80,42,0.08)` : "none" }}>
                            <div className="p-4 flex flex-col flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold px-1.5 py-0.5 rounded" style={{ fontSize: 9, letterSpacing: "0.05em", background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.gold }}> {item.source} </span>
                                <span style={{ fontSize: 10, color: P.inkFaint }}> {timeAgo(item.publishedDate)} </span>
                              </div>
                              <h3 className="font-semibold leading-snug mb-2 transition-colors duration-200" style={{ fontSize: 13, color: isHov ? P.verm : P.ink, lineHeight: 1.5 }}> {item.title} </h3>
                              <p className="leading-relaxed flex-1" style={{ fontSize: 11, color: P.inkFaint, lineHeight: 1.7 }}> {item.content} </p>
                              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${P.borderFaint}` }}>
                                <span className="font-medium" style={{ fontSize: 10, color: isHov ? P.verm : P.inkFaint }}> {readingTime(item.content)} </span>
                                <div className="flex items-center justify-center rounded-md transition-all" style={{ width: 22, height: 22, background: isHov ? P.verm : P.inkGhost }}>
                                  <ExternalLink size={10} color={isHov ? P.bg : P.inkFaint} />
                                </div>
                              </div>
                            </div>
                          </motion.article>
                        );
                      })}
                    </div>
                    <div style={{ height: 24 }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* —— AI Summary Panel ——————————————————— */}
          <AnimatePresence>
            {selectedArticle && (
              <motion.div className="absolute inset-0 z-30 flex flex-col" initial={{ x: "100%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32 }} style={{ background: P.bg }}>
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${P.border}`, background: `${P.bgPanel}fa` }}>
                  <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={() => { summaryAbortRef.current?.abort(); setSelectedArticle(null); }} className="flex items-center gap-2 rounded-lg font-semibold" style={{ fontSize: 12, color: P.inkMid, background: P.inkGhost, border: `1px solid ${P.borderFaint}`, padding: "6px 12px" }}>
                    ← Back
                  </motion.button>
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <span className="font-bold tracking-wide" style={{ fontSize: 12, color: P.verm, fontFamily: "'Shippori Mincho', serif" }}> AI Summary </span>
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setPeekUrl(selectedArticle.url)} className="flex items-center gap-2 rounded-lg font-semibold" style={{ fontSize: 12, color: P.verm, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, padding: "6px 12px" }}>
                    Open <ExternalLink size={12} />
                  </motion.button>
                </div>
                {/* Article meta */}
                <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="font-bold px-2 py-0.5 rounded" style={{ fontSize: 10, letterSpacing: "0.05em", background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.gold }}> {selectedArticle.source} </span>
                    <span style={{ fontSize: 11, color: P.inkFaint }}> {timeAgo(selectedArticle.publishedDate)} · {readingTime(selectedArticle.content)} </span>
                  </div>
                  <h2 className="font-bold leading-snug" style={{ fontSize: 17, color: P.paper, lineHeight: 1.5, fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif" }}> {selectedArticle.title} </h2>
                </div>
                {/* Summary body */}
                <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin", scrollbarColor: `${P.border} transparent` }}>
                  <div className="flex items-center gap-2.5 mb-5">
                    <div style={{ width: 3, height: 14, borderRadius: 2, background: `linear-gradient(180deg, ${P.verm}, ${P.gold})` }} />
                    <span className="font-bold tracking-widest uppercase" style={{ fontSize: 10, color: P.verm }}> Summary </span>
                  </div>
                  {/* Loading skeleton */}
                  {summaryLoading && (
                    <div className="flex flex-col gap-3">
                      {[85, 92, 78, 95, 70, 88, 65].map((w, i) => (
                        <motion.div key={i} style={{ height: 10, borderRadius: 5, width: `${w}%`, background: `linear-gradient(90deg, ${P.inkGhost} 25%, ${P.paperFaint} 50%, ${P.inkGhost} 75%)`, backgroundSize: "200% 100%" }} animate={{ backgroundPosition: ["200% 0", "-200% 0"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: i * 0.06 }} />
                      ))}
                      <div className="flex items-center gap-2 mt-3">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${P.border}`, borderTopColor: P.verm }} />
                        <span style={{ fontSize: 11, color: P.vermDim }}>Generating summary…</span>
                      </div>
                    </div>
                  )}
                  {/* Error */}
                  {summaryError && !summaryLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                      <ToriiMark size={36} color={P.vermDim} />
                      <p className="text-center max-w-xs" style={{ fontSize: 12, color: P.inkFaint }}>{summaryError}</p>
                      <button onClick={() => openArticleSummary(selectedArticle)} className="font-semibold rounded-lg px-4 py-2" style={{ fontSize: 11, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.verm }}>
                        Retry
                      </button>
                    </div>
                  )}
                  {/* Streaming text */}
                  {!summaryLoading && !summaryError && (summary || summaryStreaming) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <div className="mb-5" style={{ height: 1, background: `linear-gradient(90deg, ${P.vermBorder}, transparent)` }} />
                      <MessageRenderer content={summary} onCitationClick={() => {}} sources={[]} />
                    </motion.div>
                  )}
                </div>
                {/* Peek Panel */}
                <AnimatePresence>
                  {peekUrl && <NewsPeekPanel url={peekUrl} onClose={() => setPeekUrl(null)} />}
                </AnimatePresence>
                {/* Footer CTA */}
                <div className="px-5 py-3.5 shrink-0" style={{ borderTop: `1px solid ${P.borderFaint}`, background: `${P.bgPanel}f2` }}>
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} onClick={() => setPeekUrl(selectedArticle.url)} className="w-full flex items-center justify-center gap-2 font-semibold rounded-lg py-2.5" style={{ fontSize: 12, background: `linear-gradient(135deg, ${P.vermDim}, ${P.verm})`, color: "#fff", border: `1px solid ${P.vermBorder}` }}>
                    <BookOpen size={14} /> Read Full Article <ExternalLink size={12} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* —— Footer ————————————————————————————— */}
          <motion.footer initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="relative z-10 flex items-center justify-between px-5 py-2 shrink-0" style={{ background: `${P.bgPanel}f2`, borderTop: `1px solid ${P.border}` }}>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full" style={{ width: 6, height: 6, background: P.verm, boxShadow: `0 0 5px ${P.verm}` }} />
              <span className="font-semibold uppercase tracking-widest" style={{ fontSize: 9, color: P.vermDim }}> Live </span>
              <span className="hidden sm:inline" style={{ fontSize: 10, color: P.inkFaint }}> {search.trim() ? "Search" : "AI Feed"} </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 10, color: P.inkFaint }}> {filteredNews.length} articles </span>
              {lastRefreshed && (
                <span className="hidden sm:inline" style={{ fontSize: 10, color: P.inkFaint }}> Updated {timeAgo(lastRefreshed.toISOString())} </span>
              )}
            </div>
          </motion.footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
