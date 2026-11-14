/**
 * Conversation lifecycle: list, open, prefetch, load.
 *
 * Owns the entire "which conversations exist and how do we open them"
 * concern extracted from `pages/Dashboard.tsx`:
 *
 * - Seeding the sidebar from `localStorage` so the UI renders instantly on
 *   reload, then refreshing from the backend (debounced - a burst of
 *   `loadConversations()` calls within one second produces a single fetch).
 * - A three-tier read path for thread content: in-memory Map (45 s TTL) ->
 *   IndexedDB cache (`conversationCache`) -> network POST
 *   `/conversation/:id` (which also bumps recency server-side).
 * - Prefetch-on-hover: the same fetch is issued warm-up style when the
 *   user hovers a sidebar row; failures are silent, the open path will
 *   simply fall through to the network.
 * - The `flux-active-conversation` persistence pair and the
 *   `<title>` upkeep the dashboard needs.
 *
 * Transport-agnostic: it deals with `setMessages`/`setActiveSources` only,
 * never with SSE/WS specifics. The active-id ref is returned because the
 * sync layer and the stream callbacks both write it.
 *
 * Usage:
 *   const conv = useConversations({
 *     user, navigate, getAccessToken,
 *     setMessages, setActiveSources,
 *     setActiveCitationIndex, setActiveTab, setActiveImages,
 *     createNewThread,
 *   });
 *   conv.loadConversations(); conv.openConversation(id);
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { BACKEND_URL } from "../lib/config";
import { conversationCache } from "../lib/conversation-cache";
import { enrichConversationMessages, type ConvCacheEntry } from "../utils/enrichMessages";
import type { ConversationListItem, ConversationDetail, Message, Source } from "../types";

export type UseConversationsParams = {
  user: User | null;
  navigate: NavigateFunction;
  getAccessToken: () => Promise<string>;
  /** Replace the visible message list (transport-agnostic). */
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setActiveSources: (sources: Source[]) => void;
  /** Reset the citation highlight when a different thread opens. */
  setActiveCitationIndex: (index: number | null) => void;
  setActiveTab: (tab: "answer" | "links" | "images") => void;
  setActiveImages: (urls: string[]) => void;
  /** Clear the composer/chat for a fresh thread (defined by the page). */
  createNewThread: () => void;
  /** Adaptive-quality cache strategy; only 'cache-first' serves the sidebar from IndexedDB. */
  cachePreference?: string;
};

/** How long a thread stays "fresh" in the in-memory cache before a background refresh. */
const CONV_CACHE_TTL = 45_000; // 45 s
/** Debounce window for refreshing the conversation list. */
const LOAD_DEBOUNCE_MS = 1_000;

export function useConversations({
  user,
  navigate,
  getAccessToken,
  setMessages,
  setActiveSources,
  setActiveCitationIndex,
  setActiveTab,
  setActiveImages,
  createNewThread,
  cachePreference,
}: UseConversationsParams) {
  // ─── Seed from localStorage for instant sidebar render ───
  const [conversations, setConversations] = useState<ConversationListItem[]>(() => {
    try {
      const saved = localStorage.getItem("flux-conversations");
      return saved ? (JSON.parse(saved) as ConversationListItem[]) : [];
    } catch {
      return [];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const isInitialMountRef = useRef(true);

  // ─── Thread-content cache (avoids re-fetching recently opened threads) ───
  const conversationCacheRef = useRef<Map<string, ConvCacheEntry>>(new Map());

  // Keep the tab title in sync with the open conversation.
  useEffect(() => {
    if (activeConversationId) {
      const conv = conversations.find((c) => c.id === activeConversationId);
      document.title = conv?.title ? `${conv.title} - Flux` : "Flux";
    } else {
      document.title = "New Chat - Flux";
    }
  }, [activeConversationId, conversations]);

  // Persist the active id so a reload can restore the open thread.
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (activeConversationId) {
      localStorage.setItem("flux-active-conversation", activeConversationId);
    } else {
      localStorage.removeItem("flux-active-conversation");
    }
  }, [activeConversationId]);

  // ─── Debounced list refresh ───────────────────────────────────────────
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadConversations = useCallback(
    async (forceRefresh?: boolean) => {
      if (!user) return;

      // Debounce: cancel the pending call; fire 1 s after the last request
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      loadTimerRef.current = setTimeout(async () => {
        // Cache-first: the IndexedDB copy is good enough for the sidebar
        if (!forceRefresh && cachePreference === "cache-first") {
          const cached = await conversationCache.getConversations();
          if (cached && cached.length > 0) {
            setConversations(cached);
            try { localStorage.setItem("flux-conversations", JSON.stringify(cached)); } catch {}
            return;
          }
        }

        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`${BACKEND_URL}/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: ConversationListItem[] };
        const list = data.conversations ?? [];
        setConversations(list);
        try { localStorage.setItem("flux-conversations", JSON.stringify(list)); } catch {}
        conversationCache.putConversations(list).catch(() => {});
      }, LOAD_DEBOUNCE_MS);
    },
    [user, getAccessToken, cachePreference],
  );

  // Load the list as soon as we know who the user is.
  useEffect(() => {
    if (user) loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ─── Server-side search (for the sidebar search modal) ────────────────
  const searchConversations = useCallback(
    async (query: string) => {
      const token = await getAccessToken();
      if (!token) return [];
      const res = await fetch(`${BACKEND_URL}/conversations/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.conversations as ConversationListItem[];
    },
    [getAccessToken],
  );

  // ─── Open a thread: memory cache → IndexedDB → network ────────────────
  const openConversation = useCallback(
    async (id: string) => {
      // ── 0. Update active state immediately so the sidebar highlights at once ──
      setActiveConversationId(id);
      setActiveCitationIndex(null);
      setActiveTab("answer");
      setActiveImages([]);
      const conv = conversations.find((c) => c.id === id);
      if (conv?.slug) {
        navigate(`/c/${conv.slug}`, { replace: true });
      }

      // ── 1. Serve instantly from the in-memory cache if still fresh ──
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) {
        setMessages(cached.enriched);
        const last = [...cached.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
        return;
      }

      // ── 2. Try IndexedDB (instant for repeat visits on slow connections) ──
      const cachedMessages = await conversationCache.getMessages(id);
      if (cachedMessages && cachedMessages.length > 0) {
        const entry = enrichConversationMessages(cachedMessages);
        conversationCacheRef.current.set(id, entry);
        if (activeConversationIdRef.current === id) {
          setMessages(entry.enriched);
          const last = [...entry.enriched].reverse().find((m) => m.role === "Assistant");
          setActiveSources(last?.sources ?? []);
        }
      } else {
        setMessages([]);
      }

      // ── 3. Always fetch the network copy in the background (freshest data) ──
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          console.warn("Conversation not found, removing from local state");
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (activeConversationIdRef.current === id) createNewThread();
          return;
        }
        return;
      }
      const data = (await res.json()) as { conversation: ConversationDetail };
      if (!data?.conversation?.messages) {
        console.warn("Conversation data is empty or malformed", data);
        return;
      }

      // Update the URL with the real slug from the server
      if (data.conversation.slug && activeConversationIdRef.current === id) {
        navigate(`/c/${data.conversation.slug}`, { replace: true });
      }

      const entry = enrichConversationMessages(data.conversation.messages);

      // ── 4. Store in both caches ──
      conversationCacheRef.current.set(id, entry);
      conversationCache.putMessages(id, data.conversation.messages).catch(() => {});

      // Only apply if the user hasn't navigated away while we were fetching
      if (activeConversationIdRef.current === id) {
        setMessages(entry.enriched);
        const last = [...entry.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
      }
    },
    // conversations is read at the top (for the slug shortcut); list identity
    // changes are fine - worst case we miss the shortcut and do the fetch anyway.
    [conversations, navigate, getAccessToken, setMessages, setActiveSources,
     setActiveCitationIndex, setActiveTab, setActiveImages, createNewThread],
  );

  // ─── Warm the cache on sidebar hover (best-effort) ────────────────────
  const prefetchConversation = useCallback(
    async (id: string) => {
      // Skip if already cached and fresh
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) return;
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { conversation: ConversationDetail };
        if (!data?.conversation?.messages) return;
        const entry = enrichConversationMessages(data.conversation.messages);
        conversationCacheRef.current.set(id, entry);
      } catch {
        // silent - prefetch is best-effort
      }
    },
    [getAccessToken],
  );

  return useMemo(
    () => ({
      conversations,
      setConversations,
      activeConversationId,
      setActiveConversationId,
      activeConversationIdRef,
      conversationCacheRef,
      conversationCacheTtl: CONV_CACHE_TTL,
      loadConversations,
      searchConversations,
      openConversation,
      prefetchConversation,
    }),
    [
      conversations,
      activeConversationId,
      loadConversations,
      searchConversations,
      openConversation,
      prefetchConversation,
    ],
  );
}
