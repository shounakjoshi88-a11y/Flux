// src/components/MessageList.tsx
import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageItem } from "./MessageItem";
import { SourceCard } from "./SourceCard";
import { getDomain } from "@/lib/chat-utils";
import { calculateTrustScore } from "@/utils/TrustScore";
import type { Message, Source } from "@/types";

// ─── Props ──────────────────────────────────────────────────
type MessageListProps = {
  messages: Message[];
  activeTab: "answer" | "links" | "images";
  activeSources: Source[];
  activeImages: string[];
  isLoading: boolean;
  activeCitationIndex: number | null;
  setActiveCitationIndex: (index: number | null) => void;
  onFollowUpClick: (query: string) => void;
  setPeekUrl: (url: string | null) => void;
  onRetry?: () => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  showPromptHistory: boolean;
  onJumpToPrompt: (messageId: string | number) => void;
  conversationId?: string;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  activeGenerationStatus?: { subtype: string; message: string } | null;
  onPreview?: (data: {
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md';
    base64?: string;
    html?: string;
    filename: string
  }) => void;
};

// ─── Three dots loader ──────────────────────────────────────
function ThreeDotsLoader() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-zinc-500"
          animate={{
            y: [0, -6, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────
export function MessageList({
  messages,
  activeTab,
  activeSources,
  activeImages,
  isLoading,
  activeCitationIndex,
  setActiveCitationIndex,
  onFollowUpClick,
  setPeekUrl,
  onRetry,
  onFileClick,
  showPromptHistory,
  onJumpToPrompt,
  onFileDelete,
  activeGenerationStatus,
  onPreview,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const prevMessagesLenRef = useRef(messages.length);
  const [forceScrollKey, setForceScrollKey] = useState(0);

  // Force auto-scroll when a new message is added (user sent a prompt / conversation loaded)
  useEffect(() => {
    if (messages.length > prevMessagesLenRef.current) {
      autoScrollEnabledRef.current = true;
      setForceScrollKey(k => k + 1);
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, forceScrollKey]);

  // ─── Links tab ────────────────────────────────────────────
  if (activeTab === "links") {
    const sourceGroups: { prompt: string; sources: Source[] }[] = [];
    let currentPrompt = "Assistant response";
    for (const msg of messages) {
      if (msg.role === "User") {
        currentPrompt = msg.content;
      } else if (msg.role === "Assistant") {
        const msgSources = msg.sources ?? [];
        if (msgSources.length > 0) {
          sourceGroups.push({ prompt: currentPrompt, sources: msgSources });
        }
      }
    }
    return (
      <div className="flex-1 overflow-y-auto px-6 pt-6 custom-scrollbar">
        <h2 className="text-lg font-semibold tracking-tight mb-4 text-center">Sources per prompt</h2>
        {sourceGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">No sources found in this conversation.</p>
        ) : (
          <div className="space-y-6">
            {sourceGroups.map((group, gi) => (
              <div key={gi}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 line-clamp-1">
                  {group.prompt.length > 80 ? group.prompt.slice(0, 80) + "…" : group.prompt}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.sources.map((source) => {
                    const { score } = calculateTrustScore(source.url);
                    const badgeColor = score >= 90
                      ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/35"
                      : score >= 70
                      ? "text-blue-400 bg-blue-400/10 border-blue-400/35"
                      : score >= 50
                      ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/35"
                      : "text-red-400 bg-red-400/10 border-red-400/35";
                    return (
                      <SourceCard
                        key={source.url + gi}
                        url={source.url}
                        domain={getDomain(source.url)}
                        trustScore={score}
                        badgeColor={badgeColor}
                        onClick={() => setPeekUrl(source.url)}
                        onOpenExternal={() => window.open(source.url, "_blank")}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Images tab ───────────────────────────────────────────
  if (activeTab === "images") {
    return (
      <div className="flex-1 overflow-y-auto px-6 pt-6 custom-scrollbar">
        <h2 className="text-lg font-semibold tracking-tight mb-4">Images</h2>
        {activeImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images found for this query.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeImages.map((url, idx) => (
              <img key={idx} src={url} alt="" className="rounded-lg object-cover aspect-square" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Answer tab ───────────────────────────────────────────
  return (
    <div
      ref={scrollContainerRef}
      onScroll={(e) => {
        const target = e.currentTarget;
        const currentTop = target.scrollTop;
        const isScrollingUp = currentTop < lastScrollTopRef.current;
        const nearBottom = target.scrollHeight - (target.scrollTop + target.clientHeight) < 80;
        if (isScrollingUp && !nearBottom) autoScrollEnabledRef.current = false;
        if (nearBottom) autoScrollEnabledRef.current = true;
        lastScrollTopRef.current = currentTop;
      }}
      className="flex-1 overflow-y-auto px-6 pt-6 pb-72 relative custom-scrollbar"
    >
      {messages.length > 0 && (
        <div className="space-y-0.2">
          {messages.map((message, index) => (
            <div key={index} data-message-id={message.id}>
              <div className="mx-auto max-w-[700px] animate-in fade-in duration-500">
                <MessageItem
                  message={message}
                  sources={
                    message.sources && message.sources.length > 0
                      ? message.sources
                      : String(message.id).startsWith("temp-") ? activeSources : []
                  }
                  onCitationClick={(index) => setActiveCitationIndex(index)}
                  onFollowUpClick={onFollowUpClick}
                  onRetry={onRetry}
                  onSourceClick={setPeekUrl}
                  onFileClick={onFileClick}
                  onPreview={onPreview}
                  onFileDelete={onFileDelete}
                  activeGenerationStatus={activeGenerationStatus}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── THREE‑DOT LOADER — shows only before any parts arrive ─── */}
      {isLoading && !messages.some(m => m.parts && m.parts.length > 0) && (
        <div className="mx-auto max-w-[700px] mt-4 pl-2">
          <ThreeDotsLoader />
        </div>
      )}
    </div>
  );
}