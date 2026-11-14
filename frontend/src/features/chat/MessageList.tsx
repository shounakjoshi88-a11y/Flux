// src/components/MessageList.tsx
import { useRef, useEffect, useCallback, useLayoutEffect, forwardRef, useImperativeHandle } from "react";
import { MessageItem } from "./MessageItem";
import { SourceCard } from "../content/SourceCard";
import { getDomain } from "../../lib/chat-utils";
import { calculateReputationScore } from "../../utils/ReputationScore";
import type { Message, Source } from "../../types";

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
  onRetry?: (prompt?: string) => void;
  onEdit?: (messageId: string | number, newContent: string) => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  showPromptHistory: boolean;
  onJumpToPrompt: (messageId: string | number) => void;
  conversationId?: string;
  onDelete?: (messageId: string | number) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  activeGenerationStatus?: { subtype: string; message: string } | null;
  onPreview?: (data: {
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md';
    base64?: string;
    html?: string;
    filename: string
  }) => void;
  onHtmlPreview?: (html: string) => void;
  onVisibleRangeChange?: (range: { startIndex: number; endIndex: number }) => void;
};



// ─── Main component ────────────────────────────────────────
/**
 * Imperative handle so the dashboard can jump the scroll container to a
 * message (the prompt-history card's click-to-scroll). All items are
 * rendered in the DOM, so this is a plain scrollIntoView.
 */
export type MessageListHandle = {
  jumpToMessage: (messageId: string | number) => void;
};

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList({
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
  onDelete,
  onFileDelete,
  onEdit,
  activeGenerationStatus,
  onPreview,
  onHtmlPreview,
  conversationId,
  onVisibleRangeChange,
}: MessageListProps,
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const messagesRef = useRef(messages);
  const itemElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const visibleRangeRef = useRef({ startIndex: 0, endIndex: 0 });

  // Report which messages overlap the viewport (for the prompt-history card).
  const reportVisibleRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let start = -1;
    let end = -1;
    for (const [index, node] of itemElsRef.current) {
      const r = node.getBoundingClientRect();
      if (r.bottom > rect.top && r.top < rect.bottom) {
        if (start === -1 || index < start) start = index;
        if (index > end) end = index;
      }
    }
    if (start === -1) {
      start = Math.min(visibleRangeRef.current.startIndex, Math.max(0, messages.length - 1));
      end = start;
    }
    const prev = visibleRangeRef.current;
    if (start !== prev.startIndex || end !== prev.endIndex) {
      visibleRangeRef.current = { startIndex: start, endIndex: end };
      onVisibleRangeChange?.({ startIndex: start, endIndex: end });
    }
  }, [messages.length, onVisibleRangeChange]);

  // Click-to-scroll for the prompt-history card.
  useImperativeHandle(ref, () => ({
    jumpToMessage: (messageId: string | number) => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(String(messageId))}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  useEffect(() => {
    (window as any).__flux_messages = messages;
    return () => { (window as any).__flux_messages = null; };
  }, [messages]);

  // Auto-scroll when new messages arrive OR streaming content updates
  useEffect(() => {
    const lenChanged = messages.length !== prevLenRef.current;
    const lastMsgChanged = messages.length > 0 &&
      messagesRef.current[messagesRef.current.length - 1] !== messages[messages.length - 1];

    if (atBottomRef.current && (lenChanged || lastMsgChanged)) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    prevLenRef.current = messages.length;
    messagesRef.current = messages;
  }, [messages]);

  // Report the visible range after items mount/resize/stream.
  useLayoutEffect(() => {
    reportVisibleRange();
  }, [messages, reportVisibleRange]);

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
      <div className="flex-1 overflow-y-auto px-6 pt-6 custom-scrollbar" style={{ minHeight: 0 }}>
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
                    const { score } = calculateReputationScore(source.url);
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
      <div className="flex-1 overflow-y-auto px-6 pt-6 custom-scrollbar" style={{ minHeight: 0 }}>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Images</h2>
        {activeImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images found for this query.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeImages.map((url, idx) => (
              <img key={idx} src={url} alt="" loading="lazy" className="rounded-lg object-cover aspect-square" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Answer tab ───────────────────────────────────────────
  // Plain scrolling list — every message renders in the DOM, so streaming
  // output paints token-by-token immediately with no virtualizer to fight.
  // Offscreen items use content-visibility so layout/paint stay cheap.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    reportVisibleRange();
  }, [reportVisibleRange]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 relative overflow-y-auto custom-scrollbar"
      style={{ minHeight: 0 }}
    >
      {messages.map((message, index) => {
        let retryPrompt: string | undefined;
        if (message.role === "Assistant") {
          for (let j = index - 1; j >= 0; j--) {
            const prev = messages[j];
            if (prev && prev.role === "User") {
              retryPrompt = prev.content;
              break;
            }
          }
        }
        return (
          <div
            key={message.id}
            data-message-id={message.id}
            data-message-index={index}
            ref={(node) => {
              if (node) itemElsRef.current.set(index, node);
              else itemElsRef.current.delete(index);
            }}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
          >
            <div className="mx-auto max-w-[768px] px-5 animate-in fade-in duration-500">
              <MessageItem
                message={message}
                sources={
                  message.sources && message.sources.length > 0
                    ? message.sources
                    : String(message.id).startsWith("temp-") ? activeSources : []
                }
                onCitationClick={(citationIndex) => setActiveCitationIndex(citationIndex)}
                onFollowUpClick={onFollowUpClick}
                onRetry={() => onRetry?.(retryPrompt)}
                onEdit={onEdit}
                onSourceClick={setPeekUrl}
                onFileClick={onFileClick}
                onPreview={onPreview}
                onFileDelete={onFileDelete}
                onDelete={onDelete}
                activeGenerationStatus={activeGenerationStatus}
                onHtmlPreview={onHtmlPreview}
                conversationId={conversationId}
              />
            </div>
          </div>
        );
      })}
      {/* Spacer so the last message sits above the fixed input (like the old Footer) */}
      <div className="w-full shrink-0" style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 50vh)" }} />
    </div>
  );
});