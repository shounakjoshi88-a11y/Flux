// src/types.ts
export type Source = { url: string };

export type ConversationListItem = {
  id: string;
  title: string | null;
  slug: string;
  lastMessageAt: string | null;
};

export type Message = {
  id: number;
  role: "User" | "Assistant";
  content: string;
  createdAt: string;
  sources?: Source[];
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  slug: string;
  messages: Message[];
};

export type AttachedFile = {
  name: string;
  content: string;
};