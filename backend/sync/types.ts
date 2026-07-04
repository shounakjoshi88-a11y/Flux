export type SyncEvent =
  | { type: 'conversation_created' }
  | { type: 'conversation_deleted'; id: string }
  | { type: 'message_created'; conversationId: string; messageId: string }
  | { type: 'message_deleted'; conversationId: string; messageId: number }
  | { type: 'settings_updated'; settings: Record<string, unknown> };
