// Browser-only key/value store on IndexedDB (large capacity), used for the till's
// offline catalog and sale queue. Falls back to localStorage when IndexedDB is unavailable.

const DB_NAME = "tilla-pos";
const STORE = "kv";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  return idbSetMany([[key, value]]);
}

/** Commit the receipt and queued sale together before a cashier is told it succeeded. */
export async function idbSetMany(entries: [string, unknown][]): Promise<void> {
  const db = await openDb();
  if (!db) {
    // A single envelope avoids a partially saved multi-key fallback.
    if (entries.length > 1) throw new Error("Offline storage unavailable. Enable browser storage before selling offline.");
    for (const [key, value] of entries) localStorage.setItem(key, JSON.stringify(value));
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      for (const [key, value] of entries) tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}
