import { SegmentedLRUCache } from './segmented-lru-cache';
import { packForStorage, unpackFromStorage } from './compression';
import { computeStorageBudget, requestPersistence, type StorageBudget } from './storage-budget';
import { cacheMetrics } from './cache-metrics';
import type { Message, ConversationListItem } from '@/types';

const DB_NAME = 'flux-cache';
const DB_VERSION = 2;

interface StoredMessage {
  id: string | number;
  conversationId: string;
  role: string;
  content: string | Uint8Array;
  contentCompressed: boolean;
  createdAt: string;
  sources?: any;
  followUps?: string[];
  generatedFiles?: any[];
  parts?: any[];
}

interface StoredConversation {
  id: string;
  title: string | null;
  slug: string;
  lastMessageAt: string | null;
  cachedAt: number;
  lastAccess: number;
  segment: 'probationary' | 'protected';
}

function stripBlobs(msg: Message): Partial<StoredMessage> {
  return {
    sources: msg.sources,
    followUps: msg.followUps,
    generatedFiles: msg.generatedFiles?.map((f) => ({
      filename: f.filename,
      mime: f.mime,
      _stripped: true,
    })),
    parts: msg.parts?.map((p) => {
      if (p.type === 'image' || p.type === 'file') {
        return { ...p, base64: undefined, url: undefined };
      }
      return p;
    }),
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains('messages')) db.deleteObjectStore('messages');
      if (db.objectStoreNames.contains('conversations')) db.deleteObjectStore('conversations');
      if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta');

      const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
      convStore.createIndex('lastAccess', 'lastAccess', { unique: false });

      const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
      msgStore.createIndex('conversationId', 'conversationId', { unique: false });

      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class ConversationCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private budget: StorageBudget | null = null;
  private slru: SegmentedLRUCache<string, number> | null = null;
  private ready = false;
  private readyResolve: (() => void) | null = null;
  readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = new Promise((resolve) => { this.readyResolve = resolve; });
    this.init();
  }

  private async init() {
    try {
      this.budget = await computeStorageBudget();
      this.slru = new SegmentedLRUCache<string, number>(
        this.budget.conversationBytes,
        30,
        0.7,
      );
      this.dbPromise = openDB();
      await this.dbPromise;
      await this.restoreSlruState();
      this.ready = true;
      this.readyResolve?.();

      setTimeout(() => requestPersistence().catch(() => {}), 10_000);
    } catch (e) {
      console.warn('[ConversationCache] Init failed, running without cache:', e);
      this.ready = true;
      this.readyResolve?.();
    }
  }

  private async restoreSlruState() {
    if (!this.slru) return;
    try {
      const db = await this.dbPromise!;
      const tx = db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const convs = await new Promise<StoredConversation[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const c of convs) {
        this.slru.set(c.id, Date.now(), 100);
      }
    } catch {
    }
  }

  async getConversations(): Promise<ConversationListItem[] | null> {
    await this.readyPromise;
    if (!this.dbPromise || !this.slru) return null;

    try {
      const db = await this.dbPromise;
      const tx = db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const convs = await new Promise<StoredConversation[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!convs.length) return null;

      const sorted = convs.sort((a, b) => (b.lastAccess ?? 0) - (a.lastAccess ?? 0));
      const result = sorted.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        lastMessageAt: c.lastMessageAt,
      }));

      for (const c of sorted) {
        this.slru.get(c.id);
      }

      cacheMetrics.recordHit();
      return result;
    } catch {
      cacheMetrics.recordMiss();
      return null;
    }
  }

  async putConversations(list: ConversationListItem[]) {
    await this.readyPromise;
    if (!this.dbPromise || !this.slru || !this.budget) return;

    try {
      const db = await this.dbPromise;
      const tx = db.transaction('conversations', 'readwrite');
      const store = tx.objectStore('conversations');

      const now = Date.now();
      for (const c of list) {
        const entrySize = 200 + (c.title?.length ?? 0);
        this.slru.set(c.id, now, entrySize);

        store.put({
          id: c.id,
          title: c.title,
          slug: c.slug,
          lastMessageAt: c.lastMessageAt,
          cachedAt: now,
          lastAccess: now,
          segment: 'probationary',
        } as StoredConversation);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[ConversationCache] putConversations failed:', e);
    }
  }

  async getMessages(conversationId: string): Promise<Message[] | null> {
    await this.readyPromise;
    if (!this.dbPromise || !this.slru) return null;

    try {
      const db = await this.dbPromise;
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('conversationId');

      const stored = await new Promise<StoredMessage[]>((resolve, reject) => {
        const req = index.getAll(conversationId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!stored.length) {
        cacheMetrics.recordMiss();
        return null;
      }

      stored.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const messages: Message[] = await Promise.all(
        stored.map(async (s) => {
          const content = await unpackFromStorage({
            data: s.content,
            compressed: s.contentCompressed,
          });
          return {
            id: s.id,
            role: s.role as 'User' | 'Assistant',
            content,
            createdAt: s.createdAt,
            sources: s.sources,
            followUps: s.followUps,
            generatedFiles: s.generatedFiles,
            parts: s.parts,
          } as Message;
        }),
      );

      this.slru.get(conversationId);
      cacheMetrics.recordHit();
      return messages;
    } catch {
      cacheMetrics.recordMiss();
      return null;
    }
  }

  async putMessages(conversationId: string, messages: Message[]) {
    await this.readyPromise;
    if (!this.dbPromise || !this.slru || !this.budget) return;

    try {
      const last50 = messages.slice(-50);
      const unpacked: StoredMessage[] = await Promise.all(
        last50.map(async (msg) => {
          const packed = await packForStorage(msg.content);
          const meta = stripBlobs(msg);
          return {
            id: msg.id,
            conversationId,
            role: msg.role,
            content: packed.data,
            contentCompressed: packed.compressed,
            createdAt: msg.createdAt,
            ...meta,
          } as StoredMessage;
        }),
      );

      const entrySize = unpacked.reduce((sum, m) => {
        const contentSize = typeof m.content === 'string' ? m.content.length : m.content.byteLength;
        return sum + contentSize + 200;
      }, 0);

      if (!this.slru.set(conversationId, Date.now(), entrySize)) {
        return;
      }

      const db = await this.dbPromise;
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');

      const existingReq = store.index('conversationId').getAll(conversationId);
      const existing = await new Promise<StoredMessage[]>((resolve, reject) => {
        existingReq.onsuccess = () => resolve(existingReq.result);
        existingReq.onerror = () => reject(existingReq.error);
      });

      for (const old of existing) {
        store.delete(old.id);
      }

      for (const msg of unpacked) {
        store.put(msg);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const rawBytes = unpacked.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
      const compressedBytes = unpacked.reduce((s, m) => s + (m.contentCompressed && m.content instanceof Uint8Array ? m.content.byteLength : (typeof m.content === 'string' ? m.content.length : 0)), 0);
      cacheMetrics.recordCompression(rawBytes, compressedBytes);
    } catch (e) {
      console.warn('[ConversationCache] putMessages failed:', e);
    }
  }

  async removeConversation(conversationId: string) {
    await this.readyPromise;
    if (!this.dbPromise || !this.slru) return;

    this.slru.delete(conversationId);

    try {
      const db = await this.dbPromise;
      const tx = db.transaction(['messages', 'conversations'], 'readwrite');
      const msgStore = tx.objectStore('messages');
      const convStore = tx.objectStore('conversations');

      const msgIndex = msgStore.index('conversationId');
      const stored = await new Promise<StoredMessage[]>((resolve, reject) => {
        const req = msgIndex.getAll(conversationId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      for (const msg of stored) {
        msgStore.delete(msg.id);
      }
      convStore.delete(conversationId);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      cacheMetrics.recordEviction();
    } catch (e) {
      console.warn('[ConversationCache] removeConversation failed:', e);
    }
  }

  async clear() {
    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      const tx = db.transaction(['messages', 'conversations', 'meta'], 'readwrite');
      tx.objectStore('messages').clear();
      tx.objectStore('conversations').clear();
      tx.objectStore('meta').clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
    }
    this.slru?.clear();
  }
}

export const conversationCache = new ConversationCache();
