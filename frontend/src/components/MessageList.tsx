import { useRef, useEffect, useState, useCallback, memo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { MessageItem } from "./MessageItem";
import { SourceCard } from "./SourceCard";
import { getDomain } from "../lib/chat-utils";
import { calculateReputationScore } from "../utils/ReputationScore";
import type { Message, Source } from "../types";

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
};

function ThreeDotsLoader() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-zinc-500 animate-bounce"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

const MessageEntry = memo(function MessageEntry({
  message,
  index,
  messagesLen,
  onCitationClick,
  onFollowUpClick,
  onRetry,
  onEdit,
  onSourceClick,
  onFileClick,
  onPreview,
  onFileDelete,
  onDelete,
  activeGenerationStatus,
  onHtmlPreview,
  conversationId,
}: {
  message: Message;
  index: number;
  messagesLen: number;
  onCitationClick: (index: number) => void;
  onFollowUpClick: (query: string) => void;
  onRetry?: (prompt?: string) => void;
  onEdit?: (messageId: string | number, newContent: string) => void;
  onSourceClick?: (url: string | null) => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  onPreview?: (data: any) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  onDelete?: (messageId: string | number) => void;
  activeGenerationStatus?: any;
  onHtmlPreview?: (html: string) => void;
  conversationId?: string | null;
}) {
  let retryPrompt: string | undefined;
  if (message.role === "Assistant") {
    for (let j = index - 1; j >= 0; j--) {
      const prev = (window as any).__flux_messages?.[j];
      if (prev && prev.role === "User") {
        retryPrompt = prev.content;
        break;
      }
    }
  }

  return (
    <div className="mx-auto max-w-[700px] px-5">
      <MessageItem
        message={message}
        sources={[]}
        onCitationClick={onCitationClick}
        onFollowUpClick={onFollowUpClick}
        onRetry={() => onRetry?.(retryPrompt)}
        onEdit={onEdit}
        onSourceClick={onSourceClick}
        onFileClick={onFileClick}
        onPreview={onPreview}
        onFileDelete={onFileDelete}
        onDelete={onDelete}
        activeGenerationStatus={activeGenerationStatus}
        onHtmlPreview={onHtmlPreview}
        conversationId={conversationId}
      />
    </div>
  );
});

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
  onDelete,
  onFileDelete,
  onEdit,
  activeGenerationStatus,
  onPreview,
  onHtmlPreview,
  conversationId,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(messages.length);

  // Expose messages for retryPrompt lookup in MessageEntry
  useEffect(() => {
    (window as any).__flux_messages = messages;
    return () => { (window as any).__flux_messages = null; };
  }, [messages]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevLenRef.current && atBottomRef.current) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: "end", behavior: "auto" });
      }, 50);
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
  }, []);

  const itemContent = useCallback((index: number) => {
    const message = messages[index];
    if (!message) return null;
    return (
      <MessageEntry
        message={message}
        index={index}
        messagesLen={messages.length}
        onCitationClick={(i) => setActiveCitationIndex(i)}
        onFollowUpClick={onFollowUpClick}
        onRetry={onRetry}
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
    );
  }, [messages, onFollowUpClick, onRetry, onEdit, setPeekUrl, onFileClick, onPreview, onFileDelete, onDelete, activeGenerationStatus, onHtmlPreview, conversationId]);

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
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 custom-scrollbar" style={{ minHeight: 0 }}>
        <h2 className="text-base md:text-lg font-semibold tracking-tight mb-3 md:mb-4 text-center">Sources per prompt</h2>
        {sourceGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">No sources found in this conversation.</p>
        ) : (
          <div className="space-y-4 md:space-y-6">
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

  if (activeTab === "images") {
    return (
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 custom-scrollbar" style={{ minHeight: 0 }}>
        <h2 className="text-base md:text-lg font-semibold tracking-tight mb-3 md:mb-4">Images</h2>
        {activeImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images found for this query.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
            {activeImages.map((url, idx) => (
              <img key={idx} src={url} alt="" className="rounded-lg object-cover aspect-square" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative" style={{ minHeight: 0 }}>
      <Virtuoso
        ref={virtuosoRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ minHeight: 0 }}
        data={messages}
        itemContent={itemContent}
        followOutput={false}
        atBottomStateChange={handleAtBottomChange}
        components={{
          Header: () => (
            <>
              {/* Floating transparent header spacer */}
              <div
                className="w-full shrink-0"
                style={{ height: "calc(env(safe-area-inset-top, 0px) + 52px)" }}
              />
              {messages.length === 0 && isLoading && (
                <div className="mx-auto max-w-[700px] mt-4 pl-2 px-5">
                  <ThreeDotsLoader />
                </div>
              )}
            </>
          ),
          EmptyPlaceholder: () => null,
        }}
        increaseViewportBy={{ top: 200, bottom: 200 }}
      />
    </div>
  );
}
