import { openDB, type IDBPDatabase } from "idb";
// Browser-only key/value store on IndexedDB (large capacity), used for the till's
// offline catalog and sale queue. Falls back to localStorage when IndexedDB is unavailable.

const DB_NAME = "tilla-pos";
const STORE = "kv";
let dbPromise: Promise<IDBPDatabase | null> | null = null;

function openDb(): Promise<IDBPDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise = openDB(DB_NAME, 1, { upgrade(db) { if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); } }).catch(() => null);
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  return db.get(STORE, key) as Promise<T | undefined>;
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
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all([...entries.map(([key, value]) => tx.store.put(value, key)), tx.done]);
}

export async function idbDelete(key: string) {
  const db = await openDb();
  if (!db) { localStorage.removeItem(key); return; }
  await db.delete(STORE, key);
}

/** Prefix-scoped records avoid rewriting an entire audit queue for each action. */
export async function idbEntries<T>(prefix: string): Promise<[string, T][]> {
  const db = await openDb();
  if (!db) return Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => [k, JSON.parse(localStorage.getItem(k) ?? "null") as T]);
  const tx = db.transaction(STORE, "readonly");
  const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
  const keys = await tx.store.getAllKeys(range);
  const values = await tx.store.getAll(range);
  await tx.done;
  return keys.map((key, index) => [String(key), values[index] as T]);
}
