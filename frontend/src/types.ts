// src/types.ts
export type Source = { url: string };

export type ConversationListItem = {
  id: string;
  title: string | null;
  slug: string;
  lastMessageAt: string | null;
  matchType?: 'title' | 'content' | 'file';
  snippet?: string;
  messageId?: number;
};

export type GeneratedFile = {
  base64: string;
  filename: string;
  mime: string;
  slides?: { title: string; content: string }[];
  sections?: { heading: string; body: string }[];
  pages?: { text: string }[];
  rows?: any[][];
  md?: string;
};

export type Message = {
  id: string | number;
  role: "User" | "Assistant";
  content: string;
  createdAt: string;
  sources?: Source[];
  followUps?: string[];
  generatedFiles?: GeneratedFile[];
  fileAttachment?: { name: string; content?: string; type?: string }[];
  error?: boolean;
  errorMessage?: string;
  thoughtProcess?: any[]; // For persistence
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
  type?: string; // MIME type
};
