import { MessageSquare, X } from "lucide-react";
import type { ConversationListItem } from "../../types";
import { SidebarThread } from "./SidebarThread";

interface MobileConversationListProps {
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

export function MobileConversationList({
  conversations,
  activeConversationId,
  onSelectThread,
  onDeleteThread,
  onNewChat,
  onClose,
}: MobileConversationListProps) {
  const sorted = [...conversations].sort((a, b) => {
    const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tB - tA;
  });

  return (
    <div className="fixed inset-0 z-40 bg-sidebar flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border shrink-0">
        <h2 className="text-sm font-semibold text-sidebar-foreground">History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-35">
            <MessageSquare className="size-8 mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-wider">No chats yet</p>
          </div>
        ) : (
          sorted.map((conv) => (
            <SidebarThread
              key={conv.id}
              id={conv.id}
              title={conv.title ?? "Untitled conversation"}
              isActive={activeConversationId === conv.id}
              onClick={() => { onSelectThread(conv.id); onClose(); }}
              onDelete={() => onDeleteThread(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}