// src/components/MessageList.tsx
import { useRef, useEffect, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageItem } from "./MessageItem";
import { SourceCard } from "./SourceCard";
import { StatusMessage } from "./StatusMessage";
import { FileDownloadButton } from "./FileDownloadButton";
import { getDomain } from "@/lib/chat-utils";
import { calculateTrustScore } from "@/utils/TrustScore";
import type { Message, Source } from "@/types";

// ─── Helper: extract streaming answer ─────────────────────
// This function is ONLY used for live streaming display.
// The backend now buffers until <ANSWER> before sending, so
// thought content should never arrive on the stream. This is a
// safety net for any edge cases.
function extractStreamingAnswer(raw: string): string {
  if (!raw) return "";

  // Strip any thought blocks that somehow leaked through
  let clean = raw
    .replace(/<(?:THOUGHT|thought|think|THINK)>[\s\S]*?<\/(?:THOUGHT|thought|think|THINK)>/gi, "")
    .replace(/<(?:TOOLS|tools)>[\s\S]*?<\/(?:TOOLS|tools)>/gi, "")
    .replace(/<(?:THOUGHT|thought|think|THINK)>[\s\S]*/gi, "") // unclosed tag
    .replace(/<(?:TOOLS|tools)>[\s\S]*/gi, "")                 // unclosed tools
    .trimStart();

  // If the backend somehow sent <ANSWER> tags, extract between them
  const answerStart = raw.indexOf("<ANSWER>");
  if (answerStart !== -1) {
    const answerEnd = raw.indexOf("</ANSWER>");
    const start = answerStart + 8;
    const end = answerEnd !== -1 ? answerEnd : raw.length;
    return raw.slice(start, end).trimStart();
  }

  return clean;
}

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
  statusMessages?: any[];
  thoughtProcessHistory?: any[];
  onFileClick?: (file: { name: string; content: string }) => void;
  showPromptHistory: boolean;
  onJumpToPrompt: (messageId: string | number) => void;
  conversationId?: string;
  thoughtProcessesMap?: Record<string, any[]>;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  activeGenerationStatus?: { subtype: string; message: string } | null;
  onPreview?: (data: {
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md';
    base64?: string;
    html?: string;
    filename: string
  }) => void;
};

// ─── Streaming message wrapper ─────────────────────────────
function StreamingMessageWrapper({
  message,
  sources,
  onCitationClick,
  onFollowUpClick,
  onRetry,
  onSourceClick,
  onFileClick,
  onFileDelete,
  activeGenerationStatus,
  onPreview,
}: {
  message: Message;
  isStreaming: boolean;
  sources: Source[];
  onCitationClick: (i: number) => void;
  onFollowUpClick: (q: string) => void;
  onRetry?: () => void;
  onSourceClick: (url: string) => void;
  onFileClick?: (f: { name: string; content: string }) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  activeGenerationStatus?: { subtype: string; message: string } | null;
  onPreview?: (data: {
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md';
    base64?: string;
    html?: string;
    filename: string
  }) => void;
}) {
  const extracted = extractStreamingAnswer(message.content);
  const content = extracted !== "" ? extracted : message.content;

  return (
    <>
      <MessageItem
        message={{ ...message, content }}
        sources={sources}
        onCitationClick={onCitationClick}
        onFollowUpClick={onFollowUpClick}
        onRetry={onRetry}
        onSourceClick={onSourceClick}
        onFileClick={onFileClick}
        onPreview={onPreview}
        onFileDelete={onFileDelete}
        activeGenerationStatus={activeGenerationStatus}
      />
    </>
  );
}

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

// ─── Thought clock icon ────────────────────────────────────
const ThoughtClockIcon = ({ cls = "" }: { cls?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" className={`size-5 shrink-0 ${cls}`}>
    <circle cx="10" cy="10" r="7.5" />
    <polyline points="10,5.5 10,10.5 13.5,13" />
    <circle cx="10" cy="10" r=".8" fill="currentColor" strokeWidth="0" />
  </svg>
);

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
  statusMessages = [],
  thoughtProcessHistory = [],
  onFileClick,
  showPromptHistory,
  onJumpToPrompt,
  thoughtProcessesMap = {},
  onFileDelete,
  activeGenerationStatus,
  onPreview,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const prevMessagesLenRef = useRef(messages.length);
  const [forceScrollKey, setForceScrollKey] = useState(0);

  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

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
  }, [messages, isLoading, statusMessages, thoughtProcessHistory, forceScrollKey]);

  const toggleThought = useCallback((key: string | number) => {
    setExpandedThoughts(prev => ({
      ...prev,
      [String(key)]: !prev[String(key)],
    }));
  }, []);

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
  const lastAssistantIndex = messages
    .map((m, i) => (m.role === "Assistant" ? i : -1))
    .filter(i => i !== -1)
    .pop() ?? -1;

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
          {messages.map((message, index) => {
            const isLastAssistant = index === lastAssistantIndex;

            const storedThought = thoughtProcessesMap[String(message.id)];
            const hasStoredThought = storedThought && storedThought.length > 0;

            // ── Separate status messages from thought content ──
            // Status messages (searching, reading, skill, file, weather...) render INLINE.
            // Thought content renders inside the collapsible panel only.
            const msgTP = (message as any).thoughtProcess as any[] | undefined;
            const msgStatuses = msgTP?.filter((t: any) => t.type === "status") ?? [];
            const msgThoughts = msgTP?.filter((t: any) => t.type === "thought") ?? [];
            // Last message gets live status/thought from streaming state (or restored from DB).
            // Older messages get status/thought from their own thoughtProcess field.
            const liveStatuses = isLastAssistant ? statusMessages : msgStatuses;
            const liveThoughts = isLastAssistant
              ? thoughtProcessHistory.filter((s: any) => s.type === "thought")
              : msgThoughts;
            const hasLiveData = (liveStatuses.length > 0 || liveThoughts.length > 0);

            const hasGeneratedFiles = !!((message as any).generatedFiles?.length);

            const isImagePhase =
              isLastAssistant &&
              isLoading &&
              (activeGenerationStatus?.subtype === "image_generating" ||
               activeGenerationStatus?.subtype === "image_enhancing");

            // Stored thought: don't show when live data is present or for image/file messages
            const showStoredThought = hasStoredThought && !hasLiveData && !hasGeneratedFiles;

            // Thought collapsible: shows thought steps for any message that has them
            const showLiveThought = liveThoughts.length > 0 && !isImagePhase && !hasGeneratedFiles;

            const contentToShow = isLastAssistant && isLoading && message.role === "Assistant"
              ? extractStreamingAnswer(message.content)
              : message.content;

            const shouldShowMessageItem =
              message.role === "User" ||
              contentToShow.trim() !== "" ||
              !!message.error ||
              isImagePhase ||
              hasGeneratedFiles;

            return (
              <div key={index} data-message-id={message.id}>

                {/* ─────────────────────────────────────────────────────────────────
                    INLINE STATUS MESSAGES
                    These appear directly in the chat flow — always visible while
                    loading, like tool-use annotations in Claude. They are NOT hidden
                    inside the collapsible thought panel.
                    Rendered for any message that has status data (live streaming
                    or restored from DB thoughtProcess).
                ───────────────────────────────────────────────────────────────── */}
                {liveStatuses.length > 0 && !isImagePhase && !hasGeneratedFiles && (
                  <div className="mx-auto max-w-[700px] mb-1">
                    {liveStatuses.map((status: any, idx: number) => {
                      const isLastStatus = idx === liveStatuses.length - 1;
                      return (
                        <StatusMessage
                          key={`live-status-${idx}-${status.subtype}`}
                          status={status}
                          isFirst={idx === 0}
                          isLast={isLastStatus && !isLoading}
                          isActive={isLastStatus && isLoading}
                          showRail={true}
                          onSourceClick={setPeekUrl}
                        />
                      );
                    })}
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────────────────
                    THOUGHT BOX (collapsible)
                    Shows thought reasoning steps for any message that has them.
                    Status messages are rendered separately above.
                ───────────────────────────────────────────────────────────────── */}
                {showLiveThought && (
                  <div className="mx-auto max-w-[700px] mb-3">
                    <button
                      onClick={() => toggleThought(`${message.id}-live`)}
                      className="flex items-center gap-2 text-[15px] font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
                    >
                      <ThoughtClockIcon cls="text-zinc-400" />
                      <span>
                        Thinking for {(() => {
                          const unique = liveThoughts.reduce((acc: any[], t: any) => {
                            if (!acc.some((e: any) => e.content === t.content)) acc.push(t);
                            return acc;
                          }, []);
                          return unique.length;
                        })()} steps
                      </span>
                      <motion.div
                        animate={{ rotate: expandedThoughts[`${message.id}-live`] !== false ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="size-4 text-zinc-500" />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {expandedThoughts[`${message.id}-live`] !== false && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2">
                            {liveThoughts.map((thought: any, idx: number) => {
                              const isLastThought = idx === liveThoughts.length - 1;
                              return (
                                <StatusMessage
                                  key={`live-thought-${idx}`}
                                  status={{
                                    type: "thought",
                                    subtype: "thought",
                                    message: "Thinking…",
                                    content: thought.content ?? "",
                                  }}
                                  isFirst={idx === 0}
                                  isLast={isLastThought && !isLoading}
                                  isActive={isLastThought && isLoading}
                                  showRail={true}
                                />
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* ─── STORED THOUGHT BOX ── */}
                {showStoredThought && (
                  <div className="mx-auto max-w-[700px] mb-3">
                    <button
                      onClick={() => toggleThought(message.id)}
                      className="flex items-center gap-2 text-[15px] font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
                    >
                      <ThoughtClockIcon cls="text-zinc-400" />
                      <span>Thought for {storedThought!.length} steps</span>
                      <motion.div
                        animate={{ rotate: expandedThoughts[String(message.id)] !== false ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="size-4 text-zinc-500" />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {expandedThoughts[String(message.id)] !== false && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2">
                            {storedThought!.map((step: any, idx: number) => {
                              const isLastStep = idx === storedThought!.length - 1;
                              if (step.type === "status") {
                                return (
                                  <StatusMessage
                                    key={idx}
                                    status={step}
                                    isFirst={idx === 0}
                                    isLast={isLastStep}
                                    onSourceClick={setPeekUrl}
                                  />
                                );
                              } else if (step.type === "thought") {
                                return (
                                  <StatusMessage
                                    key={idx}
                                    status={{
                                      type: "thought",
                                      subtype: "thought",
                                      message: "Thought",
                                      content: step.content ?? "",
                                    }}
                                    isFirst={idx === 0}
                                    isLast={isLastStep}
                                    isActive={false}
                                    onSourceClick={setPeekUrl}
                                  />
                                );
                              }
                              return null;
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* ── MESSAGE ITEM ── */}
                {shouldShowMessageItem && (
                  <div className="mx-auto max-w-[700px] animate-in fade-in duration-500">
                    <StreamingMessageWrapper
                      message={message}
                      isStreaming={isLastAssistant && isLoading && message.role === "Assistant"}
                      sources={
                        message.sources && message.sources.length > 0
                          ? message.sources
                          : activeSources
                      }
                      onCitationClick={(index) => setActiveCitationIndex(index)}
                      onFollowUpClick={onFollowUpClick}
                      onRetry={onRetry}
                      onSourceClick={setPeekUrl}
                      onFileClick={onFileClick}
                      onPreview={onPreview}
                      onFileDelete={onFileDelete}
                      activeGenerationStatus={
                        isLastAssistant && isLoading
                          ? activeGenerationStatus
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── THREE‑DOT LOADER — shows only before any status or thought arrives ─── */}
      {isLoading && statusMessages.length === 0 && thoughtProcessHistory.length === 0 && (
        <div className="mx-auto max-w-[700px] mt-4 pl-2">
          <ThreeDotsLoader />
        </div>
      )}
    </div>
  );
}