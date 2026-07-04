import { useEffect, useRef, useCallback } from "react";
import { createClient } from "../lib/client";

const supabase = createClient();

export interface SyncEventData {
  type: "conversation_created" | "conversation_deleted" | "message_created" | "message_deleted" | "settings_updated";
  id?: string;
  conversationId?: string;
  messageId?: string | number;
  settings?: Record<string, unknown>;
}

interface UseSyncOptions {
  onConversationCreated?: () => void;
  onConversationDeleted?: (id: string) => void;
  onMessageCreated?: (conversationId: string, messageId: string) => void;
  onMessageDeleted?: (conversationId: string, messageId: number) => void;
  onSettingsUpdated?: (settings: Record<string, unknown>) => void;
}

export function useSync(options: UseSyncOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setupChannel = useCallback(async (): Promise<(() => void) | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;

    const channel = supabase.channel(`sync:${user.id}`);

    return new Promise((resolve) => {
      channel.on(
        "broadcast",
        { event: "sync" },
        (payload: { payload: SyncEventData }) => {
          const event = payload.payload;
          const opts = optionsRef.current;
          switch (event.type) {
            case "conversation_created":
              opts.onConversationCreated?.();
              break;
            case "conversation_deleted":
              if (event.id) opts.onConversationDeleted?.(event.id);
              break;
            case "message_created":
              if (event.conversationId && event.messageId)
                opts.onMessageCreated?.(event.conversationId, String(event.messageId));
              break;
            case "message_deleted":
              if (event.conversationId && event.messageId != null)
                opts.onMessageDeleted?.(event.conversationId, Number(event.messageId));
              break;
            case "settings_updated":
              if (event.settings) opts.onSettingsUpdated?.(event.settings);
              break;
          }
        }
      );

      let subscribed = false;
      const timeout = setTimeout(() => {
        if (!subscribed) {
          channel.unsubscribe();
          resolve(null);
        }
      }, 8000);

      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          clearTimeout(timeout);
          resolve(() => {
            supabase.removeChannel(channel);
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          resolve(null);
        }
      });
    });
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let authUnsubscribe: (() => void) | null = null;

    const start = async () => {
      if (!mounted) return;
      if (cleanup) { cleanup(); cleanup = null; }

      const unsub = await setupChannel();
      if (!mounted) {
        if (unsub) unsub();
        return;
      }
      if (unsub) {
        cleanup = unsub;
      }
    };

    start();

    const onAuthChange = async (event: string) => {
      if (event === "SIGNED_IN") {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        start();
      } else if (event === "SIGNED_OUT") {
        if (cleanup) { cleanup(); cleanup = null; }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(onAuthChange);
    authUnsubscribe = subscription?.unsubscribe ?? null;

    const handleOnline = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      retryTimer = setTimeout(start, 1000);
    };

    const handleOffline = () => {
      if (cleanup) { cleanup(); cleanup = null; }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      if (cleanup) cleanup();
      if (retryTimer) clearTimeout(retryTimer);
      if (authUnsubscribe) authUnsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setupChannel]);
}
