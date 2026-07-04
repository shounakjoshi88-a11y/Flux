export interface StorageBudget {
  totalBytes: number;
  conversationBytes: number;
  offlineQueueBytes: number;
  metaBytes: number;
}

const HARD_CEILING = 30 * 1024 * 1024;
const HARD_FLOOR = 5 * 1024 * 1024;
const QUOTA_FRACTION = 0.05;

export async function computeStorageBudget(): Promise<StorageBudget> {
  let available = HARD_CEILING;

  if (navigator.storage?.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota && usage !== undefined) {
        const free = quota - usage;
        available = Math.min(HARD_CEILING, Math.max(HARD_FLOOR, Math.floor(free * QUOTA_FRACTION)));
      }
    } catch {
    }
  }

  return {
    totalBytes: available,
    conversationBytes: Math.floor(available * 0.83),
    offlineQueueBytes: Math.floor(available * 0.06),
    metaBytes: Math.floor(available * 0.11),
  };
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return navigator.storage.persist();
  } catch {
    return false;
  }
}
