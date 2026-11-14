/**
 * Conversation actions extracted from `pages/Dashboard.tsx`:
 *
 * - Rename flow: the inline rename input in the thread header and in the
 *   sidebar thread kebab menu both funnel into `handleRenameOpen`. Passing
 *   an id renames that thread; passing none renames the active one. The
 *   submit path PATCHes `/conversations/:id` and updates the local list
 *   (and the tab `<title>` when the active thread is renamed).
 * - Delete flow: `deleteConversation` DELETEs `/conversations/:id` and
 *   raises a transient undo toast. If the active thread is deleted the
 *   caller-defined `createNewThread()` is invoked to reset the workspace.
 *   The undo button restores the conversation optimistically into the list
 *   (there is no server-side "undelete"; a refresh reconciles).
 * - Toast lifetime: the undo toast auto-dismisses after `TOAST_DURATION`.
 *
 * Usage:
 *   const convActions = useConversationActions({
 *     user, conversations, setConversations,
 *     activeConversationId, createNewThread,
 *     getAccessToken, loadConversations,
 *   });
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { BACKEND_URL } from "../lib/config";
import { conversationCache } from "../lib/conversation-cache";
import { slugifyFriendly } from "../utils/slugify";
import type { ConversationListItem } from "../types";

/** How long the "conversation deleted" undo toast stays on screen. */
const TOAST_DURATION = 3_500;

export type UseConversationActionsParams = {
  user: User | null;
  conversations: ConversationListItem[];
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  activeConversationId: string | null;
  /** Reset the workspace to a fresh chat (defined by the page). */
  createNewThread: () => void;
  getAccessToken: () => Promise<string>;
  loadConversations: (forceRefresh?: boolean) => Promise<void> | void;
  /** Close the header thread menu (sidebar kebab has no menu to close). */
  closeThreadMenu?: () => void;
};

export type DeleteToastState = { conversationId: string; title: string } | null;

export function useConversationActions({
  user,
  conversations,
  setConversations,
  activeConversationId,
  createNewThread,
  getAccessToken,
  loadConversations,
  closeThreadMenu,
}: UseConversationActionsParams) {
  // ─── Rename state ─────────────────────────────────────────
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  /** Which conversation the open rename input targets (header menu = active thread). */
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the rename input when it opens
  useEffect(() => {
    if (isRenaming) setTimeout(() => renameInputRef.current?.select(), 50);
  }, [isRenaming]);

  const handleRenameOpen = useCallback((id?: string) => {
    const target = id ?? activeConversationId;
    if (!target) return;
    const conv = conversations.find((c) => c.id === target);
    setRenameValue(conv?.title || "");
    setRenameTargetId(target);
    closeThreadMenu?.();
    setIsRenaming(true);
  }, [conversations, activeConversationId, closeThreadMenu]);

  const handleRenameSubmit = useCallback(async () => {
    const targetId = renameTargetId ?? activeConversationId;
    if (!targetId || !renameValue.trim()) { setIsRenaming(false); return; }
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/conversations/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (res.ok) {
        const { conversation: updated } = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, title: updated.title, slug: updated.slug } : c)));
        if (targetId === activeConversationId) document.title = `${updated.title} - Flux`;
      }
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setIsRenaming(false);
  }, [renameTargetId, activeConversationId, renameValue, getAccessToken, setConversations]);

  const cancelRename = useCallback(() => setIsRenaming(false), []);

  // ─── Delete + undo toast ──────────────────────────────────
  const [toast, setToast] = useState<DeleteToastState>(null);

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!user) return;
      const token = await getAccessToken();
      if (!token) {
        console.warn("Cannot delete conversation: no access token");
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/conversations/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("Delete failed with status", res.status, body);
          throw new Error("Delete failed");
        }
        const conv = conversations.find((c) => c.id === id);
        const title = conv?.title ?? "Untitled conversation";
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) createNewThread();
        setToast({ conversationId: id, title });
        conversationCache.removeConversation(id).catch(() => {});
        loadConversations();
      } catch (err) {
        console.error("Deletion error:", err);
      }
    },
    [user, getAccessToken, conversations, activeConversationId, createNewThread, loadConversations, setConversations],
  );

  const undoDelete = useCallback(() => {
    if (!toast) return;
    setConversations((prev) => [
      {
        id: toast.conversationId,
        title: toast.title,
        slug: toast.title ? slugifyFriendly(toast.title) : `restored-${Date.now()}`,
        lastMessageAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setToast(null);
  }, [toast, setConversations]);

  // Auto-dismiss the undo toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toast]);

  return {
    // rename
    isRenaming,
    renameValue,
    setRenameValue,
    renameInputRef,
    handleRenameOpen,
    handleRenameSubmit,
    cancelRename,
    // delete
    deleteConversation,
    toast,
    undoDelete,
    dismissToast: () => setToast(null),
  };
}
