// src/components/MessageList.tsx
import { useRef, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { MessageItem } from "./MessageItem";
import { SourceCard } from "./SourceCard";
import { getDomain } from "@/lib/chat-utils";
import { calculateTrustScore } from "@/utils/TrustScore";
import type { Message, Source } from "@/types";

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
  statusMessages?: string[];
  onFileClick?: (file: { name: string; content: string }) => void;
  onCanvasReopen?: (message: Message) => void;   // new prop
};

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
  statusMessages,
  onFileClick,
  onCanvasReopen,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, statusMessages]);

  // ── LINKS TAB (unchanged) ──
  if (activeTab === "links") {
    const sourceGroups: { prompt: string; sources: Source[] }[] = [];
    let currentPrompt = "Assistant response";
    for (const msg of messages) {
      if (msg.role === "User") {
        currentPrompt = msg.content;
      } else if (msg.role === "Assistant") {
        const msgSources = ((msg as any).sources ?? []) as Source[];
        if (msgSources.length > 0) {
          sourceGroups.push({ prompt: currentPrompt, sources: msgSources });
        }
      }
    }

    return (
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-64">
        <h2 className="text-lg font-semibold tracking-tight mb-4 text-center">
          Sources per prompt
        </h2>
        {sourceGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">
            No sources found in this conversation.
          </p>
        ) : (
          <div className="space-y-6">
            {sourceGroups.map((group, gi) => (
              <div key={gi}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 line-clamp-1">
                  {group.prompt.length > 80
                    ? group.prompt.slice(0, 80) + "…"
                    : group.prompt}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.sources.map((source) => {
                    const { score } = calculateTrustScore(source.url);
                    const badgeColor =
                      score >= 90
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

  // ── IMAGES TAB (unchanged) ──
  if (activeTab === "images") {
    return (
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-64">
        <h2 className="text-lg font-semibold tracking-tight mb-4">Images</h2>
        {activeImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images found for this query.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeImages.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt=""
                className="rounded-lg object-cover aspect-square"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── ANSWER TAB ──
  return (
    <div
      ref={scrollContainerRef}
      onScroll={(e) => {
        const target = e.currentTarget;
        const currentTop = target.scrollTop;
        const isScrollingUp = currentTop < lastScrollTopRef.current;
        const nearBottom =
          target.scrollHeight - (target.scrollTop + target.clientHeight) < 80;
        if (isScrollingUp && !nearBottom) autoScrollEnabledRef.current = false;
        if (nearBottom) autoScrollEnabledRef.current = true;
        lastScrollTopRef.current = currentTop;
      }}
      className="flex-1 overflow-y-auto px-6 pt-6 pb-64"
    >
      {messages.length > 0 && (
        <div className="space-y-0.2">
          {messages.map((message, index) => {
            const isStreaming = (message as any).id === -1;
            const showStatusHere =
              isLoading &&
              statusMessages &&
              statusMessages.length > 0 &&
              isStreaming &&
              (index === 0 || (messages[index - 1] as any).id !== -1);

            return (
              <div key={message.id}>
                {showStatusHere && (
                  <div className="mx-auto max-w-[760px] mb-4 space-y-1 text-sm text-muted-foreground animate-in fade-in slide-in-from-top-2 duration-300">
                    {statusMessages!.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <LoaderCircle className="size-3.5 animate-spin" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mx-auto max-w-[760px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <MessageItem
                    message={message}
                    onCitationClick={(index) => setActiveCitationIndex(index)}
                    onFollowUpClick={onFollowUpClick}
                    onRetry={onRetry}
                    onSourceClick={setPeekUrl}
                    onFileClick={onFileClick}
                    onCanvasReopen={onCanvasReopen}   // pass down
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (!statusMessages || statusMessages.length === 0) && (
        <div className="loading-skeleton mx-auto max-w-[760px] mt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Connecting...
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-24 animate-pulse rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5" />
            <div className="skeleton-line w-full" />
            <div className="skeleton-line w-11/12" />
            <div className="skeleton-line w-10/12" />
          </div>
        </div>
      )}
    </div>
  );
}