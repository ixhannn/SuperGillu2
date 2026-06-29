import { DB_NAME, DB_VERSION, STORES } from './dbConfig';

let dbPromise: Promise<IDBDatabase> | null = null;

const REQUIRED_STORES = Object.values(STORES);

const createMissingStores = (db: IDBDatabase) => {
  if (!db.objectStoreNames.contains(STORES.DATA)) db.createObjectStore(STORES.DATA);
  if (!db.objectStoreNames.contains(STORES.IMAGES)) db.createObjectStore(STORES.IMAGES);
};

const hasRequiredStores = (db: IDBDatabase) => (
  REQUIRED_STORES.every((store) => db.objectStoreNames.contains(store))
);

const openDbAtVersion = (version: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      createMissingStores(db);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });

export const openLiorDb = async (): Promise<IDBDatabase> => {
  const db = await openDbAtVersion(DB_VERSION);
  if (hasRequiredStores(db)) return db;

  const nextVersion = db.version + 1;
  db.close();
  const repairedDb = await openDbAtVersion(nextVersion);
  if (hasRequiredStores(repairedDb)) return repairedDb;

  repairedDb.close();
  throw new Error('IndexedDB repair failed: required stores are missing');
};

export const countStore = (db: IDBDatabase, storeName: string): Promise<number> =>
  new Promise((resolve) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve(0);
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });

export const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = openLiorDb().catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
};

const getStoreReadyDb = async (store: string) => {
  const db = await getDB();
  if (db.objectStoreNames.contains(store)) return db;

  db.close();
  dbPromise = null;
  const repaired = await getDB();
  if (!repaired.objectStoreNames.contains(store)) {
    throw new Error(`IndexedDB store missing after repair: ${store}`);
  }
  return repaired;
};

export const writeRaw = async <T = unknown>(store: string, key: string, val: T) => {
  const db = await getStoreReadyDb(store);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
};

export const readRaw = async <T = unknown>(store: string, key: string): Promise<T | undefined> => {
  const db = await getStoreReadyDb(store);
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
};

export const deleteRaw = async (store: string, key: string) => {
  const db = await getStoreReadyDb(store);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
};

/**
 * Destroy the entire IndexedDB database (all stores, all keys). Used by
 * irreversible account deletion to leave no local trace of the deleted account's
 * memories / media. Closes the cached connection first so the deleteDatabase
 * request is not blocked by an open handle. Best-effort: resolves even if the
 * delete is blocked or errors, so a half-deleted account can never wedge the
 * post-deletion local wipe + reload.
 */
export const destroyDatabase = async (): Promise<void> => {
  // Drop the cached open handle so deleteDatabase isn't blocked.
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore — we're tearing everything down anyway.
    }
    dbPromise = null;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = finish;
      req.onerror = finish;
      // If another tab/connection holds the DB open the delete is blocked; the
      // store rows are still unreachable to this signed-out client, so don't hang.
      req.onblocked = finish;
    } catch {
      finish();
    }
  });
};
