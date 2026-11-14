/**
 * The stored-memory row shape used by the memory manager.
 *
 * Extracted from `features/settings/Settings.tsx`.
 */
export type MemoryItem = {
  id: string;
  category: string;
  fact: string;
  importance: number;
  source_conversation_id?: string;
  created_at: string;
};
