import { STORES } from './dbConfig';
import { countStore, openLiorDb } from './rawStore';

const LEGACY_DB_NAME = 'TulikaVault_v11';
const LEGACY_MIGRATION_FLAG = 'lior_legacy_migrated_v2';

const remapLegacyKey = (key: unknown): unknown => {
  if (typeof key === 'string' && key.startsWith('tulika_')) {
    return 'lior_' + key.slice('tulika_'.length);
  }
  return key;
};

export const migrateLegacyLocalStorage = () => {
  if (localStorage.getItem(LEGACY_MIGRATION_FLAG) === 'done') return;
  try {
    const oldKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tulika_')) oldKeys.push(key);
    }
    for (const oldKey of oldKeys) {
      const newKey = 'lior_' + oldKey.slice('tulika_'.length);
      if (localStorage.getItem(newKey) !== null) continue;
      const value = localStorage.getItem(oldKey);
      if (value !== null) localStorage.setItem(newKey, value);
    }
  } catch (error) {
    console.warn('[migration] localStorage copy failed:', error);
  }
};

const openDbVersionless = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const readFromLegacyVault = (mediaId: string): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.open(LEGACY_DB_NAME);
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.IMAGES)) {
          db.close();
          resolve(null);
          return;
        }
        try {
          const getReq = db.transaction(STORES.IMAGES, 'readonly').objectStore(STORES.IMAGES).get(mediaId);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result ?? null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });

const copyAllEntries = (
  oldDb: IDBDatabase,
  newDb: IDBDatabase,
  storeName: string,
  remapKeys: boolean,
): Promise<number> =>
  new Promise((resolve, reject) => {
    if (!oldDb.objectStoreNames.contains(storeName)) return resolve(0);
    if (!newDb.objectStoreNames.contains(storeName)) return resolve(0);
    const readTx = oldDb.transaction(storeName, 'readonly');
    const writeTx = newDb.transaction(storeName, 'readwrite');
    const writeStore = writeTx.objectStore(storeName);
    const cursorReq = readTx.objectStore(storeName).openCursor();
    let count = 0;

    cursorReq.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return;
      const targetKey = remapKeys ? remapLegacyKey(cursor.key) : cursor.key;
      writeStore.put(cursor.value, targetKey as IDBValidKey);
      count++;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
    writeTx.oncomplete = () => resolve(count);
    writeTx.onerror = () => reject(writeTx.error);
  });

const remapInPlaceLiorMetadata = async (): Promise<number> => {
  try {
    const db = await openLiorDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORES.DATA, 'readwrite');
      const store = tx.objectStore(STORES.DATA);
      const cursorReq = store.openCursor();
      let remapped = 0;

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) return;
        const key = cursor.key;
        if (typeof key === 'string' && key.startsWith('tulika_')) {
          const newKey = 'lior_' + key.slice('tulika_'.length);
          const value = cursor.value;
          store.get(newKey).onsuccess = (getEvent) => {
            const existing = (getEvent.target as IDBRequest).result;
            if (existing == null) {
              store.put(value, newKey);
              remapped++;
            }
            cursor.delete();
            cursor.continue();
          };
        } else {
          cursor.continue();
        }
      };

      cursorReq.onerror = () => resolve(remapped);
      tx.oncomplete = () => {
        db.close();
        resolve(remapped);
      };
      tx.onerror = () => {
        db.close();
        resolve(remapped);
      };
    });
  } catch {
    return 0;
  }
};

export const migrateLegacyIndexedDB = async (): Promise<void> => {
  if (localStorage.getItem(LEGACY_MIGRATION_FLAG) === 'done') return;

  let oldDb: IDBDatabase | null = null;
  let newDb: IDBDatabase | null = null;

  try {
    const remapped = await remapInPlaceLiorMetadata();
    if (remapped > 0) {
      console.info(`[migration] remapped ${remapped} orphaned tulika_* keys in LiorVault_v11`);
    }

    const enumerate = (indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    }).databases;
    if (enumerate) {
      const list = await enumerate.call(indexedDB).catch(() => []);
      const hasLegacy = list.some((entry) => entry.name === LEGACY_DB_NAME);
      if (!hasLegacy) {
        localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
        return;
      }
    }

    oldDb = await openDbVersionless(LEGACY_DB_NAME);
    const storeNames = Array.from(oldDb.objectStoreNames);
    if (storeNames.length === 0) {
      localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
      return;
    }

    newDb = await openLiorDb();

    for (const storeName of [STORES.DATA, STORES.IMAGES]) {
      if (!oldDb.objectStoreNames.contains(storeName)) continue;
      if (storeName === STORES.IMAGES) {
        const existing = await countStore(newDb, storeName);
        if (existing > 0) continue;
      }
      const copied = await copyAllEntries(oldDb, newDb, storeName, storeName === STORES.DATA);
      if (copied > 0) {
        console.info(
          `[migration] copied ${copied} entries from ${LEGACY_DB_NAME}/${storeName}${storeName === STORES.DATA ? ' (remapped)' : ''}`,
        );
      }
    }

    localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
  } catch (error) {
    console.warn('[migration] IndexedDB copy failed:', error);
  } finally {
    oldDb?.close();
    newDb?.close();
  }
};

