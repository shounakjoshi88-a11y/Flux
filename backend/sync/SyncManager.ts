import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SyncEvent } from './types';
import { createSupabaseClient } from '../db/supabase';


const CHANNEL_CLEANUP_MS = 5 * 60 * 1000;
const SUBSCRIBE_TIMEOUT_MS = 5000;

export class SyncManager {
  private channels = new Map<string, { channel: RealtimeChannel; lastUsed: number }>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private supabase: ReturnType<typeof createSupabaseClient>;

  constructor() {
    this.supabase = createSupabaseClient();
  }

  async broadcast(userId: string, event: SyncEvent): Promise<void> {
    if (!userId) return;

    const entry = this.getOrCreateChannel(userId);
    try {
      await entry.channel.send({
        type: 'broadcast',
        event: 'sync',
        payload: event,
      });
      entry.lastUsed = Date.now();
      this.scheduleCleanup(userId);
    } catch (e) {
      console.error(`[SyncManager] Broadcast error for user ${userId}:`, (e as Error)?.message || e);
      this.channels.delete(userId);
    }
  }

  private getOrCreateChannel(userId: string) {
    const existing = this.channels.get(userId);
    if (existing) return existing;

    const channelName = `sync:${userId}`;
    const channel = this.supabase.channel(channelName);

    let subscribed = false;
    let subscribeResolve: (() => void) | null = null;
    const subscribePromise = new Promise<void>((resolve, reject) => {
      subscribeResolve = resolve;
      const timeout = setTimeout(() => {
        if (!subscribed) {
          channel.unsubscribe();
          reject(new Error('subscribe_timeout'));
        }
      }, SUBSCRIBE_TIMEOUT_MS);

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(status));
        }
      });
    });

    const entry = { channel, lastUsed: Date.now() };
    this.channels.set(userId, entry);

    subscribePromise.catch((e) => {
      console.error(`[SyncManager] Subscribe failed for ${channelName}:`, e?.message || e);
      this.channels.delete(userId);
    });

    return entry;
  }

  private scheduleCleanup(userId: string) {
    const existing = this.cleanupTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const entry = this.channels.get(userId);
      if (entry && Date.now() - entry.lastUsed > CHANNEL_CLEANUP_MS) {
        this.supabase.removeChannel(entry.channel);
        this.channels.delete(userId);
        this.cleanupTimers.delete(userId);
      }
    }, CHANNEL_CLEANUP_MS);

    this.cleanupTimers.set(userId, timer);
  }

  removeChannel(userId: string) {
    const entry = this.channels.get(userId);
    if (entry) {
      this.supabase.removeChannel(entry.channel);
      this.channels.delete(userId);
    }
    const timer = this.cleanupTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(userId);
    }
  }

  cleanupAll() {
    for (const [userId] of this.channels) {
      this.removeChannel(userId);
    }
  }
}

export const syncManager = new SyncManager();
