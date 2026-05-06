import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dbConfigSource = readFileSync(new URL('../services/storage/dbConfig.ts', import.meta.url), 'utf8');
const rawStoreSource = readFileSync(new URL('../services/storage/rawStore.ts', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const dbConsumerFiles = [
  '../services/partnerIntelligence.ts',
  '../services/relationshipSignals.ts',
  '../services/relationshipModel.ts',
  '../services/insightEngine.ts',
  '../services/weeklyRecap.ts',
  '../services/videoMoments.ts',
  '../services/mediaMigration.ts',
];

assert.match(
  dbConfigSource,
  /export const DB_VERSION = 2;/,
  'Expected IndexedDB version bump so existing broken v1 databases receive an upgrade pass.',
);

assert.match(
  rawStoreSource,
  /const REQUIRED_STORES = Object\.values\(STORES\);[\s\S]*const createMissingStores = \(db: IDBDatabase\) => \{/,
  'Expected rawStore to centralize required IndexedDB store creation.',
);

assert.match(
  rawStoreSource,
  /if \(hasRequiredStores\(db\)\) return db;[\s\S]*const nextVersion = db\.version \+ 1;[\s\S]*const repairedDb = await openDbAtVersion\(nextVersion\);/,
  'Expected rawStore to repair already-current databases that are still missing object stores.',
);

assert.match(
  rawStoreSource,
  /const getStoreReadyDb = async \(store: string\) => \{[\s\S]*dbPromise = null;[\s\S]*if \(!repaired\.objectStoreNames\.contains\(store\)\) \{/,
  'Expected reads and writes to retry through a repaired connection if a store is missing.',
);

assert.match(
  rawStoreSource,
  /dbPromise = openLiorDb\(\)\.catch\(\(error\) => \{[\s\S]*dbPromise = null;[\s\S]*throw error;/,
  'Expected failed IndexedDB opens to clear the cached promise so future recovery can retry.',
);

assert.match(
  storageSource,
  /const normalizeDailyPhoto = \(value: unknown\): DailyPhoto \| null => \{[\s\S]*coerceIsoDate\(input\.createdAt\)[\s\S]*expiresAt[\s\S]*return null;/,
  'Expected daily photo metadata to be normalized before display or persistence.',
);

assert.match(
  storageSource,
  /const filterActiveDailyPhotos = \(items: DailyPhoto\[\], now = Date\.now\(\)\): DailyPhoto\[\] =>[\s\S]*normalizeDailyPhotos\(items, now\);/,
  'Expected invalid or expired daily photos to be filtered through the same normalizer as cleanup.',
);

assert.match(
  storageSource,
  /if \(DATA_CACHE\.dailyPhotos !== normalizedDailyPhotos\) \{[\s\S]*await writeRaw\(STORES\.DATA, CACHE_KEYS\.DAILY_PHOTOS, DATA_CACHE\.dailyPhotos\);/,
  'Expected startup to persist cleanup of invalid daily photo metadata once IndexedDB is repaired.',
);

for (const file of dbConsumerFiles) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(
    source,
    /from ['"]\.\/storage\/dbConfig['"]/,
    `Expected ${file} to import the shared IndexedDB config instead of duplicating database constants.`,
  );
  assert.doesNotMatch(
    source,
    /indexedDB\.open\(DB_NAME,\s*1\)/,
    `Expected ${file} not to open LiorVault_v11 at hardcoded version 1.`,
  );
}
