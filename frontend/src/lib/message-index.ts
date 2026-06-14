// O(1) message index — inspired by AionUi's WeakMap-based message indices
// Avoids O(n) array scanning for streaming updates

import type { Message } from "@/types";

export interface MessageIndex {
  msgIdIndex: Map<string | number, number>;
  tempIdIndex: Map<string, number>;
}

export function createMessageIndex(messages: Message[]): MessageIndex {
  const msgIdIndex = new Map<string | number, number>();
  const tempIdIndex = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m) {
      msgIdIndex.set(m.id, i);
      if (typeof m.id === "string" && m.id.startsWith("temp-")) {
        tempIdIndex.set(m.id, i);
      }
    }
  }
  return { msgIdIndex, tempIdIndex };
}

export function updateMessageIndex(
  index: MessageIndex,
  id: string | number,
  newIndex: number,
  isTemp: boolean
): void {
  index.msgIdIndex.set(id, newIndex);
  if (isTemp && typeof id === "string") {
    index.tempIdIndex.set(id, newIndex);
  }
}

export function findMessageIndex(
  index: MessageIndex,
  id: string | number
): number | undefined {
  return index.msgIdIndex.get(id) ?? index.tempIdIndex.get(id as string);
}

export function appendToIndex(
  index: MessageIndex,
  msg: Message,
  idx: number
): void {
  index.msgIdIndex.set(msg.id, idx);
  if (typeof msg.id === "string" && msg.id.startsWith("temp-")) {
    index.tempIdIndex.set(msg.id, idx);
  }
}

export function composeMessageWithIndex(
  message: Message,
  list: Message[],
  index: MessageIndex
): Message[] {
  const key = typeof message.id === "string" && message.id.startsWith("temp-")
    ? message.id
    : message.id;
  const existingIdx = index.msgIdIndex.get(key) ?? index.tempIdIndex.get(key as string);

  if (existingIdx !== undefined && existingIdx >= 0 && existingIdx < list.length) {
    const next = list.slice();
    next[existingIdx] = message;
    return next;
  }

  // Append
  const pos = list.length;
  index.msgIdIndex.set(message.id, pos);
  if (typeof message.id === "string" && message.id.startsWith("temp-")) {
    index.tempIdIndex.set(message.id, pos);
  }
  return [...list, message];
}
