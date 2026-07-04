const DB_NAME = "flux-offline-queue";
const STORE_NAME = "pending-messages";
const DB_VERSION = 1;

interface PendingMessage {
  id: string;
  conversationId: string | null;
  content: string;
  model: string;
  files: { name: string; content: string; type?: string }[];
  fileContent?: string;
  timestamp: number;
}

function openDB(): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      resolve(tx.objectStore(STORE_NAME));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function queueMessage(msg: PendingMessage): Promise<void> {
  const store = await openDB();
  return new Promise((resolve, reject) => {
    const req = store.add(msg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedMessages(): Promise<PendingMessage[]> {
  const store = await openDB();
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedMessage(id: string): Promise<void> {
  const store = await openDB();
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueue(): Promise<void> {
  const store = await openDB();
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueLength(): Promise<number> {
  const store = await openDB();
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
