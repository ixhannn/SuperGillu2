import { Memory, Note, SpecialDate, Envelope, UserStatus, DailyPhoto, DinnerOption, CoupleProfile, PetStats, Keepsake, Comment, MoodEntry, StreakData, QuestionEntry, RoomState, UsBucketItem, UsWishlistItem, UsMilestone, CoupleRoomState, TimeCapsule, Surprise, VoiceNote } from '../types';
import { SupabaseService } from './supabase';
import { MediaStorageService, compressImage } from './mediaStorage';
import { DEFAULT_ROOM_STATE, normalizeRoomState } from '../components/room/roomGameplay';
import { normalizeCoupleRoom, migrateFromOldRoom } from '../components/room/roomSoul';
import { isDailyMomentExpired } from '../shared/mediaRetention.js';
import {
    COUPLE_TOTAL_STORAGE_BUDGET_BYTES,
    estimateDataUriBytes,
    formatBytes,
    getFeatureStorageBudgetBytes,
    getMimeTypeFromDataUri,
} from '../shared/mediaPolicy.js';


// ENSURING WE STAY ON V11 FOR DATA CONTINUITY
const DB_NAME = 'LiorVault_v11';
const DB_VERSION = 1;
const STORES = {
    DATA: 'metadata_store',
    IMAGES: 'image_vault'
};

// ── Legacy "Tulika" → "Lior" migration ────────────────────────────────────
// The app was renamed from Tulika to Lior. Both the IndexedDB name and every
// localStorage key were prefixed differently before the rename, so existing
// users would otherwise lose all memories AND their stored Supabase URL/key
// (meaning the cloud client never initializes, hiding remote data too).
// This shim runs once on first init to copy old data forward.
const LEGACY_DB_NAME = 'TulikaVault_v11';
// v2: prior shim copied IDB entries with their original `tulika_*` keys, so the
// loader (which reads `lior_*`) found nothing. Bumping the flag re-runs migration
// with proper key remapping for affected users.
const LEGACY_MIGRATION_FLAG = 'lior_legacy_migrated_v2';
const remapLegacyKey = (key: unknown): unknown => {
    if (typeof key === 'string' && key.startsWith('tulika_')) {
        return 'lior_' + key.slice('tulika_'.length);
    }
    return key;
};

const migrateLegacyLocalStorage = () => {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG) === 'done') return;
    try {
        const oldKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('tulika_')) oldKeys.push(k);
        }
        for (const oldKey of oldKeys) {
            const newKey = 'lior_' + oldKey.slice('tulika_'.length);
            // Don't clobber any value already present under the new key
            if (localStorage.getItem(newKey) !== null) continue;
            const val = localStorage.getItem(oldKey);
            if (val !== null) localStorage.setItem(newKey, val);
        }
    } catch (e) {
        console.warn('[migration] localStorage copy failed:', e);
    }
};

const openDbVersionless = (name: string): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

// Read a single entry from TulikaVault_v11/image_vault.
// Used as a fallback when the IDB migration skipped copying images because
// LiorVault already had some entries (the skip-if-exists guard).
const readFromLegacyVault = (mediaId: string): Promise<string | null> =>
    new Promise((resolve) => {
        try {
            const req = indexedDB.open(LEGACY_DB_NAME);
            req.onerror = () => resolve(null);
            req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORES.IMAGES)) { db.close(); resolve(null); return; }
                try {
                    const getReq = db.transaction(STORES.IMAGES, 'readonly').objectStore(STORES.IMAGES).get(mediaId);
                    getReq.onsuccess = () => { db.close(); resolve(getReq.result ?? null); };
                    getReq.onerror = () => { db.close(); resolve(null); };
                } catch { db.close(); resolve(null); }
            };
        } catch { resolve(null); }
    });

const openLiorDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORES.DATA)) db.createObjectStore(STORES.DATA);
            if (!db.objectStoreNames.contains(STORES.IMAGES)) db.createObjectStore(STORES.IMAGES);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

const countStore = (db: IDBDatabase, storeName: string): Promise<number> =>
    new Promise((resolve) => {
        if (!db.objectStoreNames.contains(storeName)) return resolve(0);
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
    });

const copyAllEntries = (oldDb: IDBDatabase, newDb: IDBDatabase, storeName: string, remapKeys: boolean): Promise<number> =>
    new Promise((resolve, reject) => {
        if (!oldDb.objectStoreNames.contains(storeName)) return resolve(0);
        if (!newDb.objectStoreNames.contains(storeName)) return resolve(0);
        const readTx = oldDb.transaction(storeName, 'readonly');
        const writeTx = newDb.transaction(storeName, 'readwrite');
        const writeStore = writeTx.objectStore(storeName);
        const cursorReq = readTx.objectStore(storeName).openCursor();
        let count = 0;
        cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                const targetKey = remapKeys ? remapLegacyKey(cursor.key) : cursor.key;
                writeStore.put(cursor.value, targetKey as IDBValidKey);
                count++;
                cursor.continue();
            }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
        writeTx.oncomplete = () => resolve(count);
        writeTx.onerror = () => reject(writeTx.error);
    });

// Remap any orphaned `tulika_*` keys inside LiorVault_v11/metadata_store
// in-place. This catches users whose prior (broken) v1 migration copied
// entries with the wrong keys.
const remapInPlaceLiorMetadata = async (): Promise<number> => {
    try {
        const db = await openLiorDb();
        return await new Promise<number>((resolve) => {
            const tx = db.transaction(STORES.DATA, 'readwrite');
            const store = tx.objectStore(STORES.DATA);
            const cursorReq = store.openCursor();
            let remapped = 0;
            cursorReq.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const key = cursor.key;
                    if (typeof key === 'string' && key.startsWith('tulika_')) {
                        const newKey = 'lior_' + key.slice('tulika_'.length);
                        const value = cursor.value;
                        store.get(newKey).onsuccess = (ev) => {
                            const existing = (ev.target as IDBRequest).result;
                            if (existing == null) {
                                store.put(value, newKey);
                                remapped++;
                            }
                            cursor.delete();
                        };
                    }
                    cursor.continue();
                }
            };
            cursorReq.onerror = () => resolve(remapped);
            tx.oncomplete = () => { db.close(); resolve(remapped); };
            tx.onerror = () => { db.close(); resolve(remapped); };
        });
    } catch {
        return 0;
    }
};

const migrateLegacyIndexedDB = async (): Promise<void> => {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG) === 'done') return;

    let oldDb: IDBDatabase | null = null;
    let newDb: IDBDatabase | null = null;
    try {
        // Always run the in-place remap first — it's cheap and catches orphans
        // from a prior failed v1 migration even when the legacy DB is gone.
        const remapped = await remapInPlaceLiorMetadata();
        if (remapped > 0) console.info(`[migration] remapped ${remapped} orphaned tulika_* keys in LiorVault_v11`);

        // Quick existence check (Chromium/Safari only — Firefox falls through harmlessly)
        const enumerate = (indexedDB as any).databases as undefined | (() => Promise<{ name?: string }[]>);
        if (enumerate) {
            const list = await enumerate.call(indexedDB).catch(() => []);
            const hasLegacy = list.some((d) => d.name === LEGACY_DB_NAME);
            if (!hasLegacy) {
                localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
                return;
            }
        }

        oldDb = await openDbVersionless(LEGACY_DB_NAME);

        // If the legacy DB has no stores at all (was just created by our open),
        // there's nothing to migrate.
        const storeNames = Array.from(oldDb.objectStoreNames);
        if (storeNames.length === 0) {
            localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
            return;
        }

        newDb = await openLiorDb();

        for (const storeName of [STORES.DATA, STORES.IMAGES]) {
            if (!oldDb.objectStoreNames.contains(storeName)) continue;
            // Always copy: metadata_store may be empty (after a failed prior migration)
            // even though useful entries exist under tulika_* keys we now need to remap.
            // For image_vault, we still skip if the new store already has entries to
            // avoid clobbering re-uploaded media.
            if (storeName === STORES.IMAGES) {
                const existing = await countStore(newDb, storeName);
                if (existing > 0) continue;
            }
            const remapKeys = storeName === STORES.DATA;
            const copied = await copyAllEntries(oldDb, newDb, storeName, remapKeys);
            if (copied > 0) console.info(`[migration] copied ${copied} entries from ${LEGACY_DB_NAME}/${storeName}${remapKeys ? ' (remapped)' : ''}`);
        }

        localStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
    } catch (e) {
        console.warn('[migration] IndexedDB copy failed:', e);
    } finally {
        oldDb?.close();
        newDb?.close();
    }
};

const CACHE_KEYS = {
    MEMORIES: 'lior_memories',
    NOTES: 'lior_notes',
    DATES: 'lior_dates',
    ENVELOPES: 'lior_envelopes',
    DAILY_PHOTOS: 'lior_daily_photos',
    DINNER_OPTIONS: 'lior_dinner_options',
    KEEPSAKES: 'lior_keepsakes',
    COMMENTS: 'lior_comments',
    SHARED_PROFILE: 'lior_shared_profile',
    IDENTITY: 'lior_identity',
    USER_STATUS: 'lior_status',
    PARTNER_STATUS: 'lior_partner_status',
    PET_STATS: 'lior_pet_stats',
    DEVICE_ID: 'lior_device_id',
    TOGETHER_MUSIC_META: 'lior_together_music_meta',
    MOOD_ENTRIES: 'lior_mood_entries',
    PENDING_DELETES: 'lior_pending_deletes',
    OUR_ROOM_STATE: 'lior_room_state_v2',
    US_BUCKET_ITEMS: 'lior_us_bucket_items',
    US_WISHLIST_ITEMS: 'lior_us_wishlist_items',
    US_MILESTONES: 'lior_us_milestones',
    TIME_CAPSULES: 'lior_time_capsules',
    SURPRISES: 'lior_surprises',
    VOICE_NOTES: 'lior_voice_notes',
    PENDING_UPLOADS: 'lior_pending_uploads',
};

/* ─── Pending upload retry queue ─── */
// When R2 upload fails (network down, misconfigured worker, etc.), the item's
// IDs are saved here. On the next successful sync cycle, retryPendingUploads()
// reads the queue, re-reads the media from IDB, and retries the upload.
export type PendingUpload = {
    listKey: string;         // keyof DATA_CACHE, e.g. 'memories'
    storageKey: string;      // CACHE_KEYS value, e.g. 'lior_memories'
    prefix: string;          // 'mem' | 'daily' | 'keep' etc.
    itemId: string;
    hasImage: boolean;
    hasVideo: boolean;
};

const _getPendingUploads = (): PendingUpload[] => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEYS.PENDING_UPLOADS) || '[]'); } catch { return []; }
};

const _savePendingUploads = (list: PendingUpload[]) => {
    localStorage.setItem(CACHE_KEYS.PENDING_UPLOADS, JSON.stringify(list));
};

const _addPendingUpload = (entry: PendingUpload) => {
    const list = _getPendingUploads();
    const exists = list.find(u => u.listKey === entry.listKey && u.itemId === entry.itemId);
    if (!exists) _savePendingUploads([...list, entry]);
};

const _removePendingUpload = (listKey: string, itemId: string) => {
    _savePendingUploads(_getPendingUploads().filter(u => !(u.listKey === listKey && u.itemId === itemId)));
};

/* ─── Pending delete tombstones ─── */
export type PendingDelete = { table: string; id: string };

const _getPendingDeletes = (): PendingDelete[] => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEYS.PENDING_DELETES) || '[]'); } catch { return []; }
};

const _savePendingDeletes = (list: PendingDelete[]) => {
    localStorage.setItem(CACHE_KEYS.PENDING_DELETES, JSON.stringify(list));
};

export const addPendingDelete = (table: string, id: string) => {
    const list = _getPendingDeletes();
    if (!list.find(d => d.table === table && d.id === id)) {
        _savePendingDeletes([...list, { table, id }]);
    }
};

export const removePendingDelete = (table: string, id: string) => {
    _savePendingDeletes(_getPendingDeletes().filter(d => !(d.table === table && d.id === id)));
};

export const getPendingDeletes = (): PendingDelete[] => _getPendingDeletes();

export const isDeletedLocally = (table: string, id: string): boolean =>
    _getPendingDeletes().some(d => d.table === table && d.id === id);

const DATA_CACHE = {
    memories: [] as Memory[],
    notes: [] as Note[],
    specialDates: [] as SpecialDate[],
    envelopes: [] as Envelope[],
    dailyPhotos: [] as DailyPhoto[],
    dinnerOptions: [] as DinnerOption[],
    keepsakes: [] as Keepsake[],
    comments: [] as Comment[],
    moodEntries: [] as MoodEntry[],
    usBucketItems: [] as UsBucketItem[],
    usWishlistItems: [] as UsWishlistItem[],
    usMilestones: [] as UsMilestone[],
    timeCapsules: [] as TimeCapsule[],
    surprises: [] as Surprise[],
    voiceNotes: [] as VoiceNote[],
};

const MEDIA_MEMORY_CACHE = new Map<string, string>();
export const storageEventTarget = new EventTarget();
const SANITIZED_TEXT_KEYS = new Set([
    'text',
    'content',
    'title',
    'label',
    'caption',
    'note',
    'message',
    'senderName',
    'myName',
    'partnerName',
    'name'
]);

const ROOM_WALLPAPERS = new Set(['plain', 'stripes', 'polka', 'hearts', 'stars', 'wood']);
const ROOM_FLOORS = new Set(['hardwood', 'carpet', 'tiles', 'cloud', 'grass', 'marble']);
const ROOM_AMBIENTS = new Set(['warm', 'cool', 'rainbow']);
const COUPLE_ROOM_KEY = 'lior_couple_room_v2';
const TULIKA_NAME = 'Tulika';
const ISHAN_NAME = 'Ishan';
const LEGACY_RENAMED_PERSON_NAME = 'Lior';
const LEGACY_ROOM_ITEM_MAP: Record<string, string> = {
    frame: 'photo_frames',
    candle: 'candle_cluster',
    sofa: 'fluffy_couch',
    lamp: 'floor_lamp',
    plant: 'succulent_set',
    table: 'coffee_table_round',
    tv: 'tv_stand_screen',
    books: 'book_stack',
    rug: 'throw_blanket',
    bed: 'double_bed',
    piano: 'record_player',
    blossom: 'flower_bouquet',
    crystal: 'portal_door',
    cat: 'cute_robot',
};

const toLegacyRoomState = (room: Partial<CoupleRoomState>): RoomState => normalizeRoomState({
    placedItems: Array.isArray(room?.placedItems)
        ? room.placedItems.map((item: any) => ({
            ...item,
            itemId: LEGACY_ROOM_ITEM_MAP[item.itemId] || item.itemId || 'fluffy_couch'
        }))
        : [],
    coins: 500,
    roomName: room.roomName || 'Our Room',
    wallpaper: ROOM_WALLPAPERS.has(String(room.wallpaper)) ? room.wallpaper as any : 'plain',
    floor: ROOM_FLOORS.has(String(room.floor)) ? room.floor as any : 'carpet',
    ambient: ROOM_AMBIENTS.has(String(room.ambient)) ? room.ambient as any : 'warm',
});

const sanitizeUserString = (value: string) => (
    value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/</g, '＜')
        .replace(/>/g, '＞')
);

const normalizeIdentityPair = <T extends { myName?: string; partnerName?: string }>(identity: T): T => {
    const normalized = { ...identity };

    if (normalized.myName === LEGACY_RENAMED_PERSON_NAME) {
        normalized.myName = TULIKA_NAME;
    }

    if (normalized.partnerName === LEGACY_RENAMED_PERSON_NAME) {
        normalized.partnerName = TULIKA_NAME;
    }

    // Do not auto-fill empty names — they stay empty until the user sets them
    // via onboarding or profile settings. Partner name is set automatically
    // after QR pairing via PairingService / SyncService.

    return normalized;
};

const normalizeKeepsakeSender = <T extends { senderId?: string }>(item: T): T => {
    if (item.senderId !== LEGACY_RENAMED_PERSON_NAME) {
        return item;
    }

    return {
        ...item,
        senderId: TULIKA_NAME,
    };
};

const sanitizeUserContent = <T>(value: T): T => {
    if (typeof value === 'string') {
        return sanitizeUserString(value) as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeUserContent(item)) as T;
    }

    if (value && typeof value === 'object') {
        const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
            if (typeof entryValue === 'string' && SANITIZED_TEXT_KEYS.has(key)) {
                return [key, sanitizeUserString(entryValue)];
            }
            return [key, sanitizeUserContent(entryValue)];
        });
        return Object.fromEntries(sanitizedEntries) as T;
    }

    return value;
};

export interface StorageUpdateDetail {
    source: 'user' | 'sync';
    action: 'save' | 'delete';
    table: string;
    id: string;
    item?: any;
}

const notifyUpdate = (detail: StorageUpdateDetail) => {
    storageEventTarget.dispatchEvent(new CustomEvent('storage-update', { detail }));
};

const MEDIA_OWNER_TABLES = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'voice_notes']);
const TABLE_TO_MEDIA_FEATURE: Record<string, string> = {
    memories: 'memories',
    daily_photos: 'daily-moments',
    keepsakes: 'keepsakes',
    time_capsules: 'time-capsules',
    surprises: 'surprises',
    voice_notes: 'voice-notes',
    together_music: 'together-music',
};
const TOGETHER_MUSIC_SOURCE_KEY = 'custom_together_music';
type TogetherMusicMetadata = { name: string; date: string; size: number; mimeType?: string; ownerUserId?: string };
type VoiceNoteAudioSaveResult = { storagePath: string | null; byteSize: number; mimeType: string };
type ManagedStorageFeature = 'memories' | 'daily-moments' | 'keepsakes' | 'time-capsules' | 'surprises' | 'voice-notes' | 'together-music';
type ManagedStorageBreakdown = { feature: ManagedStorageFeature; label: string; bytes: number; quotaBytes: number | null; itemCount: number };

const isInlineMediaPayload = (value?: string | null) => typeof value === 'string' && value.startsWith('data:');

const getMediaTimestamp = (item: any): string | undefined => {
    const candidate = item?.date || item?.createdAt || item?.meta?.date;
    return typeof candidate === 'string' && candidate ? candidate : undefined;
};

const MANAGED_FEATURE_LABELS: Record<ManagedStorageFeature, string> = {
    memories: 'Memories',
    'daily-moments': 'Daily Moments',
    keepsakes: 'Keepsakes',
    'time-capsules': 'Time Capsules',
    surprises: 'Surprises',
    'voice-notes': 'Voice Notes',
    'together-music': 'Together Music',
};

const extractInlineMediaMeta = (value?: string | null): { bytes: number; mimeType: string } | null => {
    if (!isInlineMediaPayload(value)) return null;
    return {
        bytes: estimateDataUriBytes(value),
        mimeType: getMimeTypeFromDataUri(value),
    };
};

const getManagedItemBytes = (item: any): number => (
    Number(item?.imageBytes || 0)
    + Number(item?.videoBytes || 0)
    + Number(item?.audioBytes || 0)
);

const getFeatureItemsForBudget = (feature: ManagedStorageFeature): any[] => {
    switch (feature) {
        case 'memories':
            return DATA_CACHE.memories;
        case 'daily-moments':
            return filterActiveDailyPhotos(DATA_CACHE.dailyPhotos);
        case 'keepsakes':
            return DATA_CACHE.keepsakes;
        case 'time-capsules':
            return DATA_CACHE.timeCapsules;
        case 'surprises':
            return DATA_CACHE.surprises;
        case 'voice-notes':
            return DATA_CACHE.voiceNotes;
        case 'together-music': {
            const meta = StorageService.getTogetherMusicMetadata();
            return meta ? [{ size: meta.size }] : [];
        }
        default:
            return [];
    }
};

const getFeatureBytesForBudget = (feature: ManagedStorageFeature): number => {
    if (feature === 'together-music') {
        const meta = StorageService.getTogetherMusicMetadata();
        return Number(meta?.size || 0);
    }
    return getFeatureItemsForBudget(feature).reduce((sum, item) => sum + getManagedItemBytes(item), 0);
};

const getManagedStorageTotals = () => {
    const features = Object.keys(MANAGED_FEATURE_LABELS) as ManagedStorageFeature[];
    const breakdown = features.map((feature) => ({
        feature,
        label: MANAGED_FEATURE_LABELS[feature],
        bytes: getFeatureBytesForBudget(feature),
        quotaBytes: getFeatureStorageBudgetBytes(feature),
        itemCount: getFeatureItemsForBudget(feature).length,
    }));
    const totalBytes = breakdown.reduce((sum, entry) => sum + entry.bytes, 0);
    return {
        totalBytes,
        totalQuotaBytes: COUPLE_TOTAL_STORAGE_BUDGET_BYTES,
        breakdown,
    };
};

const assertManagedStorageBudget = (
    feature: ManagedStorageFeature,
    incomingBytes: number,
    excludeBytes = 0,
) => {
    if (!(incomingBytes > 0)) return;

    const { totalBytes } = getManagedStorageTotals();
    const featureBytes = getFeatureBytesForBudget(feature);
    const totalAfter = Math.max(0, totalBytes - excludeBytes) + incomingBytes;
    const featureAfter = Math.max(0, featureBytes - excludeBytes) + incomingBytes;
    const featureBudget = getFeatureStorageBudgetBytes(feature);

    if (featureBudget && featureAfter > featureBudget) {
        throw new Error(`${MANAGED_FEATURE_LABELS[feature]} is over its storage budget (${formatBytes(featureAfter)} / ${formatBytes(featureBudget)}). Delete older media before adding more.`);
    }

    if (totalAfter > COUPLE_TOTAL_STORAGE_BUDGET_BYTES) {
        throw new Error(`Your shared media storage is full (${formatBytes(totalAfter)} / ${formatBytes(COUPLE_TOTAL_STORAGE_BUDGET_BYTES)}). Delete older media before uploading more.`);
    }
};

const stripInternalRowMeta = <T extends Record<string, any>>(item: T): T => {
    const next = { ...item };
    delete next.__rowMeta;
    return next;
};

const resolveOwnerUserId = async (item: any, source: 'user' | 'sync', existingItem?: any): Promise<string | undefined> => {
    const explicitOwner = item?.ownerUserId || existingItem?.ownerUserId;
    if (explicitOwner) return explicitOwner;

    const rowOwner = item?.__rowMeta?.userId || item?.user_id;
    if (typeof rowOwner === 'string' && rowOwner) return rowOwner;

    if (source !== 'user' || !SupabaseService.init()) return undefined;
    const currentUserId = await SupabaseService.getCurrentUserId();
    return currentUserId ?? undefined;
};

const filterActiveDailyPhotos = <T extends { expiresAt?: string }>(items: T[], now = Date.now()): T[] =>
    items.filter((item) => !isDailyMomentExpired(item, now));

let dbPromise: Promise<IDBDatabase> | null = null;
const getDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = (e.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(STORES.DATA)) database.createObjectStore(STORES.DATA);
            if (!database.objectStoreNames.contains(STORES.IMAGES)) database.createObjectStore(STORES.IMAGES);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
};

const writeRaw = async (store: string, key: string, val: any) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const readRaw = async (store: string, key: string) => {
    const db = await getDB();
    return new Promise<any>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const deleteRaw = async (store: string, key: string) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const StorageService = {
    isInitialized: false,
    isPersisted: false,

    async init() {
        if (this.isInitialized) return;
        try {
            // Run legacy Tulika→Lior migration BEFORE opening the new DB so any
            // copied entries are visible on the very first init pass.
            migrateLegacyLocalStorage();
            await migrateLegacyIndexedDB();

            await getDB();
            if (navigator.storage && navigator.storage.persist) {
                this.isPersisted = await navigator.storage.persist();
            }

            const load = async (key: string, cacheKey: keyof typeof DATA_CACHE) => {
                const val = await readRaw(STORES.DATA, key);
                if (val) (DATA_CACHE[cacheKey] as any) = val;
            };

            await Promise.all([
                load(CACHE_KEYS.MEMORIES, 'memories'),
                load(CACHE_KEYS.NOTES, 'notes'),
                load(CACHE_KEYS.DATES, 'specialDates'),
                load(CACHE_KEYS.ENVELOPES, 'envelopes'),
                load(CACHE_KEYS.DAILY_PHOTOS, 'dailyPhotos'),
                load(CACHE_KEYS.DINNER_OPTIONS, 'dinnerOptions'),
                load(CACHE_KEYS.KEEPSAKES, 'keepsakes'),
                load(CACHE_KEYS.COMMENTS, 'comments'),
                load(CACHE_KEYS.MOOD_ENTRIES, 'moodEntries'),
                load(CACHE_KEYS.US_BUCKET_ITEMS, 'usBucketItems'),
                load(CACHE_KEYS.US_WISHLIST_ITEMS, 'usWishlistItems'),
                load(CACHE_KEYS.US_MILESTONES, 'usMilestones'),
                load(CACHE_KEYS.TIME_CAPSULES, 'timeCapsules'),
                load(CACHE_KEYS.SURPRISES, 'surprises'),
                load(CACHE_KEYS.VOICE_NOTES, 'voiceNotes'),
            ]);

            DATA_CACHE.keepsakes = DATA_CACHE.keepsakes.map((item) => normalizeKeepsakeSender(item));

            const restoreLocalBackup = async (key: string) => {
                const backup = await readRaw(STORES.DATA, key);
                if (backup && !localStorage.getItem(key)) {
                    localStorage.setItem(key, JSON.stringify(backup));
                }
            };

            await Promise.all([
                restoreLocalBackup(CACHE_KEYS.SHARED_PROFILE),
                restoreLocalBackup(CACHE_KEYS.PET_STATS),
                restoreLocalBackup(CACHE_KEYS.USER_STATUS),
                restoreLocalBackup(CACHE_KEYS.PARTNER_STATUS),
                restoreLocalBackup(CACHE_KEYS.TOGETHER_MUSIC_META),
                restoreLocalBackup(CACHE_KEYS.MOOD_ENTRIES),
                restoreLocalBackup(CACHE_KEYS.OUR_ROOM_STATE),
                restoreLocalBackup(CACHE_KEYS.US_BUCKET_ITEMS),
                restoreLocalBackup(CACHE_KEYS.US_WISHLIST_ITEMS),
                restoreLocalBackup(CACHE_KEYS.US_MILESTONES)
            ]);

            // Sync music
            this.syncMusicFromCloud();
            await this.cleanupDailyPhotos();

            this.isInitialized = true;
            notifyUpdate({ source: 'sync', action: 'save', table: 'init', id: 'all' });
        } catch (e) {
            console.error("Critical storage failure", e);
        }
    },

    async syncMusicFromCloud() {
        if (!SupabaseService.init()) return;
        try {
            const cloudRow = await SupabaseService.fetchSingleRow('together_music');
            const cloudMusic = cloudRow?.data;
            if (!cloudMusic) return;
            const localMeta = this.getTogetherMusicMetadata();
            const hasUpdate = !localMeta || (cloudMusic.meta?.date && cloudMusic.meta.date !== localMeta.date);
            if (!hasUpdate) return;

            if (cloudMusic.music_url) {
                // Store R2 URL directly — audio element can stream from it
                await writeRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY, cloudMusic.music_url);
            } else if (cloudMusic.music_base64) {
                await writeRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY, cloudMusic.music_base64);
            }
            if (cloudMusic.meta) {
                const metaWithOwner: TogetherMusicMetadata = {
                    ...cloudMusic.meta,
                    ownerUserId: cloudMusic.ownerUserId || cloudRow?.user_id || localMeta?.ownerUserId,
                };
                localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(metaWithOwner));
                await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, metaWithOwner);
            }
        } catch (e) { }
    },

    getDeviceId: () => {
        let id = localStorage.getItem(CACHE_KEYS.DEVICE_ID);
        if (!id) {
            id = Math.random().toString(36).substring(2, 9).toUpperCase();
            localStorage.setItem(CACHE_KEYS.DEVICE_ID, id);
        }
        return id;
    },

    async getImage(mediaId: string, cloudPayload?: string, storagePath?: string): Promise<string | null> {
        const legacyPayloadPath = !storagePath && MediaStorageService.isMediaReference(cloudPayload) ? cloudPayload : undefined;
        const resolvedStoragePath = storagePath || legacyPayloadPath;
        if (!mediaId && !resolvedStoragePath) return cloudPayload || null;

        // 1. RAM cache
        const cacheKey = mediaId || resolvedStoragePath || '';
        if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

        // 2. IndexedDB local cache — checked FIRST before cloud URL.
        //    Local data is faster, always fresh, and resilient to R2 outages / URL staleness.
        //    Items uploaded from this device always have their base64 here.
        if (mediaId) {
            const local = await readRaw(STORES.IMAGES, mediaId);
            if (local) {
                if (local.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, local);
                return local;
            }
        }

        // 3. R2 / Cloud storage URL — used when IDB doesn't have the image
        //    (e.g. partner's item synced from cloud, or IDB was evicted by browser).
        //    If the path is still pointing at legacy Supabase storage, recover that
        //    payload instead of returning a dead R2 URL.
        if (resolvedStoragePath) {
            const url = await MediaStorageService.getAccessibleUrl(resolvedStoragePath);
            if (url) {
                // Background: download and cache in IDB so future loads are instant
                // and offline-resilient.  Fire-and-forget — never blocks the caller.
                this._cacheR2Image(cacheKey, url).catch(() => {});
                return url;
            }

            const recovered = await MediaStorageService.downloadMedia(resolvedStoragePath);
            if (recovered) {
                if (mediaId) await writeRaw(STORES.IMAGES, mediaId, recovered);
                if (recovered.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, recovered);
                return recovered;
            }
        }

        // 4. TulikaVault fallback — pre-rename images skipped by IDB migration
        if (mediaId) {
            const legacy = await readFromLegacyVault(mediaId);
            if (legacy) {
                await writeRaw(STORES.IMAGES, mediaId, legacy);
                if (legacy.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, legacy);
                return legacy;
            }
        }

        // 5. Legacy fallback: base64 stored inline in cloud JSON column
        if (cloudPayload?.startsWith('data:')) {
            if (mediaId) await writeRaw(STORES.IMAGES, mediaId, cloudPayload);
            if (cloudPayload.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, cloudPayload);
            return cloudPayload;
        }
        return null;
    },

    /**
     * Fallback resolver used when a cloud URL fails to load in the browser.
     * Re-queries using only local sources (IDB, legacy IDB, inline base64).
     * Never returns an http URL — only base64 or null.
     */
    async getImageLocalOnly(mediaId: string, cloudPayload?: string, storagePath?: string): Promise<string | null> {
        const legacyPayloadPath = !storagePath && MediaStorageService.isMediaReference(cloudPayload) ? cloudPayload : undefined;
        const resolvedStoragePath = storagePath || legacyPayloadPath;
        if (!mediaId && !cloudPayload && !resolvedStoragePath) return null;

        if (mediaId) {
            const cacheKey = mediaId;
            if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

            const local = await readRaw(STORES.IMAGES, mediaId);
            if (local) {
                if (local.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, local);
                return local;
            }

            const legacy = await readFromLegacyVault(mediaId);
            if (legacy) {
                await writeRaw(STORES.IMAGES, mediaId, legacy);
                if (legacy.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, legacy);
                return legacy;
            }
        }

        if (cloudPayload?.startsWith('data:')) {
            if (mediaId) await writeRaw(STORES.IMAGES, mediaId, cloudPayload);
            if (cloudPayload.length < 2_000_000) MEDIA_MEMORY_CACHE.set(mediaId, cloudPayload);
            return cloudPayload;
        }

        if (resolvedStoragePath) {
            const cacheKey = mediaId || resolvedStoragePath;
            if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

            const recovered = await MediaStorageService.downloadMedia(resolvedStoragePath);
            if (recovered) {
                if (mediaId) await writeRaw(STORES.IMAGES, mediaId, recovered);
                if (recovered.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, recovered);
                return recovered;
            }
        }

        return null;
    },

    async _saveInternal(listKey: keyof typeof DATA_CACHE, storageKey: string, item: any, prefix?: string, table?: string, source: 'user' | 'sync' = 'user') {
        const sanitizedItem = sanitizeUserContent(item);
        const normalizedItem = listKey === 'keepsakes'
            ? normalizeKeepsakeSender(sanitizedItem)
            : sanitizedItem;
        const list = [...(DATA_CACHE[listKey] as any[])];
        const idx = list.findIndex(i => i.id === item.id);
        const existingItem = idx >= 0 ? list[idx] : undefined;
        const ownerUserId = prefix && table && MEDIA_OWNER_TABLES.has(table)
            ? await resolveOwnerUserId(normalizedItem, source, existingItem)
            : normalizedItem.ownerUserId || existingItem?.ownerUserId;
        const toSaveMetadata = stripInternalRowMeta({
            ...normalizedItem,
            ownerUserId,
        });
        const rawImage = normalizedItem.image;
        const rawVideo = normalizedItem.video;
        const imageToStore = isInlineMediaPayload(rawImage) ? await compressImage(rawImage) : undefined;
        const videoToStore = isInlineMediaPayload(rawVideo) ? rawVideo : undefined;
        const imageRef = !imageToStore && MediaStorageService.isMediaReference(rawImage) ? rawImage : undefined;
        const videoRef = !videoToStore && MediaStorageService.isMediaReference(rawVideo) ? rawVideo : undefined;
        const managedFeature = table ? TABLE_TO_MEDIA_FEATURE[table] as ManagedStorageFeature | undefined : undefined;
        const imageMeta = extractInlineMediaMeta(imageToStore);
        const videoMeta = extractInlineMediaMeta(videoToStore);
        const replacedBytes =
            (imageMeta ? Number(existingItem?.imageBytes || 0) : 0)
            + (videoMeta ? Number(existingItem?.videoBytes || 0) : 0);

        if (source === 'user' && managedFeature) {
            assertManagedStorageBudget(
                managedFeature,
                Number(imageMeta?.bytes || 0) + Number(videoMeta?.bytes || 0),
                replacedBytes,
            );
        }

        if (imageToStore && prefix) {
            const imageId = normalizedItem.imageId || existingItem?.imageId || `${prefix}_${normalizedItem.id}`;
            await writeRaw(STORES.IMAGES, imageId, imageToStore);
            if (imageToStore.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, imageToStore);
            toSaveMetadata.imageId = imageId;
            toSaveMetadata.imageBytes = imageMeta?.bytes;
            toSaveMetadata.imageMimeType = imageMeta?.mimeType;
        } else if (imageRef && !toSaveMetadata.storagePath) {
            toSaveMetadata.storagePath = imageRef;
        } else if (existingItem?.imageBytes && !hasOwn(toSaveMetadata, 'imageBytes')) {
            toSaveMetadata.imageBytes = existingItem.imageBytes;
            toSaveMetadata.imageMimeType = existingItem.imageMimeType;
        }
        delete toSaveMetadata.image;

        if (videoToStore && prefix) {
            const videoId = normalizedItem.videoId || existingItem?.videoId || `${prefix}_vid_${normalizedItem.id}`;
            await writeRaw(STORES.IMAGES, videoId, videoToStore);
            toSaveMetadata.videoId = videoId;
            toSaveMetadata.videoBytes = videoMeta?.bytes;
            toSaveMetadata.videoMimeType = videoMeta?.mimeType;
        } else if (videoRef && !toSaveMetadata.videoStoragePath) {
            toSaveMetadata.videoStoragePath = videoRef;
        } else if (existingItem?.videoBytes && !hasOwn(toSaveMetadata, 'videoBytes')) {
            toSaveMetadata.videoBytes = existingItem.videoBytes;
            toSaveMetadata.videoMimeType = existingItem.videoMimeType;
        }
        delete toSaveMetadata.video;

        if (idx >= 0) {
            if (!toSaveMetadata.imageId && list[idx].imageId) toSaveMetadata.imageId = list[idx].imageId;
            if (!toSaveMetadata.videoId && list[idx].videoId) toSaveMetadata.videoId = list[idx].videoId;
            if (!toSaveMetadata.storagePath && list[idx].storagePath) toSaveMetadata.storagePath = list[idx].storagePath;
            if (!toSaveMetadata.videoStoragePath && list[idx].videoStoragePath) toSaveMetadata.videoStoragePath = list[idx].videoStoragePath;
            if (!toSaveMetadata.imageBytes && list[idx].imageBytes) toSaveMetadata.imageBytes = list[idx].imageBytes;
            if (!toSaveMetadata.imageMimeType && list[idx].imageMimeType) toSaveMetadata.imageMimeType = list[idx].imageMimeType;
            if (!toSaveMetadata.videoBytes && list[idx].videoBytes) toSaveMetadata.videoBytes = list[idx].videoBytes;
            if (!toSaveMetadata.videoMimeType && list[idx].videoMimeType) toSaveMetadata.videoMimeType = list[idx].videoMimeType;
            if (!toSaveMetadata.ownerUserId && list[idx].ownerUserId) toSaveMetadata.ownerUserId = list[idx].ownerUserId;
            list[idx] = toSaveMetadata;
        } else {
            list.unshift(toSaveMetadata);
        }

        (DATA_CACHE[listKey] as any) = list;
        await writeRaw(STORES.DATA, storageKey, list);

        if (table) {
            notifyUpdate({
                source,
                action: 'save',
                table,
                id: normalizedItem.id,
                item: { ...toSaveMetadata, image: imageToStore ?? imageRef, video: videoToStore ?? videoRef },
            });
        }

        if (prefix) {
            this._uploadToStorage(listKey, storageKey, toSaveMetadata, prefix, imageToStore, videoToStore, table);
        }
    },

    async _uploadToStorage(listKey: keyof typeof DATA_CACHE, storageKey: string, metadata: any, prefix: string, rawImage?: string, rawVideo?: string, table?: string) {
        try {
            let updated = false;
            const cleanupPaths: string[] = [];
            const timestamp = getMediaTimestamp(metadata);
            const pathOptions = { ownerUserId: metadata.ownerUserId, timestamp };
            const imageNeedsMigration = !!(rawImage || metadata.storagePath)
                && (!metadata.storagePath || !(await MediaStorageService.isScopedToCurrentUser(metadata.storagePath)));
            const videoNeedsMigration = !!(rawVideo || metadata.videoStoragePath)
                && (!metadata.videoStoragePath || !(await MediaStorageService.isScopedToCurrentUser(metadata.videoStoragePath)));

            if (imageNeedsMigration) {
                const previousPath = metadata.storagePath;
                const payload = rawImage || (previousPath ? await MediaStorageService.downloadMedia(previousPath) : null);
                if (payload) {
                    const path = await MediaStorageService.buildPath(prefix, metadata.id, 'image', pathOptions);
                    const result = await MediaStorageService.uploadMedia(payload, path);
                    const verified = result ? await MediaStorageService.probeR2Path(result) : false;
                    if (result && verified === true) {
                        metadata.storagePath = result;
                        if (previousPath && previousPath !== result) cleanupPaths.push(previousPath);
                        updated = true;
                    }
                }
            }

            if (videoNeedsMigration) {
                const previousPath = metadata.videoStoragePath;
                const payload = rawVideo || (previousPath ? await MediaStorageService.downloadMedia(previousPath) : null);
                if (payload) {
                    const path = await MediaStorageService.buildPath(prefix, metadata.id, 'video', pathOptions);
                    const result = await MediaStorageService.uploadMedia(payload, path);
                    const verified = result ? await MediaStorageService.probeR2Path(result) : false;
                    if (result && verified === true) {
                        metadata.videoStoragePath = result;
                        if (previousPath && previousPath !== result) cleanupPaths.push(previousPath);
                        updated = true;
                    }
                }
            }

            // Persist updated storagePath back to cache and IndexedDB
            if (updated) {
                const list = DATA_CACHE[listKey] as any[];
                const idx = list.findIndex(i => i.id === metadata.id);
                if (idx >= 0) {
                    list[idx] = {
                        ...list[idx],
                        storagePath: metadata.storagePath,
                        videoStoragePath: metadata.videoStoragePath,
                        ownerUserId: metadata.ownerUserId || list[idx].ownerUserId,
                    };
                    await writeRaw(STORES.DATA, storageKey, list);

                    // Push storagePath to Supabase so it survives IDB eviction.
                    // Also fires storageEventTarget so MemoryTimeline re-renders
                    // with updated storagePath and useLiorMedia can use R2 fallback.
                    if (table) {
                        notifyUpdate({ source: 'user', action: 'save', table, id: metadata.id, item: list[idx] });
                    }
                }

                for (const cleanupPath of cleanupPaths) {
                    if (cleanupPath && cleanupPath !== metadata.storagePath && cleanupPath !== metadata.videoStoragePath) {
                        await MediaStorageService.deleteMedia(cleanupPath);
                    }
                }
            }

            // If upload succeeded for both, remove from pending queue (if it was there)
            const needsImage = !!(rawImage || metadata.storagePath)
                && (!metadata.storagePath || !(await MediaStorageService.isScopedToCurrentUser(metadata.storagePath)));
            const needsVideo = !!(rawVideo || metadata.videoStoragePath)
                && (!metadata.videoStoragePath || !(await MediaStorageService.isScopedToCurrentUser(metadata.videoStoragePath)));
            if (!needsImage && !needsVideo) {
                _removePendingUpload(listKey, metadata.id);
            }
        } catch (e) {
            console.warn('Background storage upload failed — queued for retry:', e);
            // Queue for retry on next sync cycle so media is never permanently lost
            _addPendingUpload({
                listKey,
                storageKey,
                prefix,
                itemId: metadata.id,
                hasImage: !!(rawImage || metadata.storagePath),
                hasVideo: !!(rawVideo || metadata.videoStoragePath),
            });
        }
    },

    /**
     * Retry R2 uploads that failed in a previous session.
     * Called by the sync service after a successful cloud connection is established.
     * Reads media from IDB (where it was safely persisted) and uploads to R2.
     */
    async retryPendingUploads(): Promise<void> {
        const queue = _getPendingUploads();
        if (queue.length === 0) return;

        console.info(`[upload-retry] Retrying ${queue.length} pending upload(s)…`);

        for (const entry of queue) {
            try {
                const cacheList = DATA_CACHE[entry.listKey as keyof typeof DATA_CACHE] as any[] | undefined;
                if (!cacheList) continue;
                const item = cacheList.find((i: any) => i.id === entry.itemId);
                if (!item) {
                    _removePendingUpload(entry.listKey, entry.itemId);
                    continue;
                }

                let updated = false;
                const cleanupPaths: string[] = [];
                const pathOptions = {
                    ownerUserId: item.ownerUserId,
                    timestamp: getMediaTimestamp(item),
                };

                const imageNeedsMigration = entry.hasImage
                    && !!(item.imageId || item.storagePath)
                    && (!item.storagePath || !(await MediaStorageService.isScopedToCurrentUser(item.storagePath)));
                if (imageNeedsMigration) {
                    const previousPath = item.storagePath;
                    const imgData = item.imageId ? await readRaw(STORES.IMAGES, item.imageId) as string | null : null;
                    const payload = imgData || (previousPath ? await MediaStorageService.downloadMedia(previousPath) : null);
                    if (payload) {
                        const path = await MediaStorageService.buildPath(entry.prefix, item.id, 'image', pathOptions);
                        const result = await MediaStorageService.uploadMedia(payload, path);
                        const verified = result ? await MediaStorageService.probeR2Path(result) : false;
                        if (result && verified === true) {
                            item.storagePath = result;
                            if (previousPath && previousPath !== result) cleanupPaths.push(previousPath);
                            updated = true;
                        }
                    }
                }

                const videoNeedsMigration = entry.hasVideo
                    && !!(item.videoId || item.videoStoragePath)
                    && (!item.videoStoragePath || !(await MediaStorageService.isScopedToCurrentUser(item.videoStoragePath)));
                if (videoNeedsMigration) {
                    const previousPath = item.videoStoragePath;
                    const vidData = item.videoId ? await readRaw(STORES.IMAGES, item.videoId) as string | null : null;
                    const payload = vidData || (previousPath ? await MediaStorageService.downloadMedia(previousPath) : null);
                    if (payload) {
                        const path = await MediaStorageService.buildPath(entry.prefix, item.id, 'video', pathOptions);
                        const result = await MediaStorageService.uploadMedia(payload, path);
                        const verified = result ? await MediaStorageService.probeR2Path(result) : false;
                        if (result && verified === true) {
                            item.videoStoragePath = result;
                            if (previousPath && previousPath !== result) cleanupPaths.push(previousPath);
                            updated = true;
                        }
                    }
                }

                if (updated) {
                    const idx = (cacheList as any[]).findIndex((i: any) => i.id === item.id);
                    if (idx >= 0) {
                        (cacheList as any[])[idx] = {
                            ...(cacheList as any[])[idx],
                            storagePath: item.storagePath,
                            videoStoragePath: item.videoStoragePath,
                            ownerUserId: item.ownerUserId || (cacheList as any[])[idx].ownerUserId,
                        };
                        await writeRaw(STORES.DATA, entry.storageKey, cacheList);
                        // Push storagePath to Supabase and refresh UI
                        const tableForCache: Record<string, string> = {
                            memories: 'memories', dailyPhotos: 'daily_photos',
                            keepsakes: 'keepsakes', timeCapsules: 'time_capsules', surprises: 'surprises',
                        };
                        const tbl = tableForCache[entry.listKey];
                        if (tbl) notifyUpdate({ source: 'user', action: 'save', table: tbl, id: item.id, item: (cacheList as any[])[idx] });
                    }
                    for (const cleanupPath of cleanupPaths) {
                        if (cleanupPath && cleanupPath !== item.storagePath && cleanupPath !== item.videoStoragePath) {
                            await MediaStorageService.deleteMedia(cleanupPath);
                        }
                    }
                }
                const remainingImage = entry.hasImage
                    && (!item.storagePath || !(await MediaStorageService.isScopedToCurrentUser(item.storagePath)));
                const remainingVideo = entry.hasVideo
                    && (!item.videoStoragePath || !(await MediaStorageService.isScopedToCurrentUser(item.videoStoragePath)));
                if (!remainingImage && !remainingVideo) {
                    _removePendingUpload(entry.listKey, entry.itemId);
                    if (updated) console.info(`[upload-retry] Uploaded ${entry.itemId}`);
                }
            } catch (e) {
                console.warn(`[upload-retry] Still failed for ${entry.itemId}:`, e);
                // Leave in queue — will retry next time
            }
        }
    },

    async _replaceCollection(listKey: keyof typeof DATA_CACHE, storageKey: string, items: any[]) {
        (DATA_CACHE[listKey] as any) = items;
        await writeRaw(STORES.DATA, storageKey, items);
    },

    getMemories: () => DATA_CACHE.memories,
    saveMemory: (m: Memory) => StorageService._saveInternal('memories', CACHE_KEYS.MEMORIES, m, 'mem', 'memories'),
    deleteMemory: async (id: string) => {
        addPendingDelete('memories', id);
        const item = DATA_CACHE.memories.find(m => m.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
        if (item?.videoStoragePath) MediaStorageService.deleteMedia(item.videoStoragePath);
        DATA_CACHE.memories = DATA_CACHE.memories.filter(m => m.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.MEMORIES, DATA_CACHE.memories);
        notifyUpdate({ source: 'user', action: 'delete', table: 'memories', id });
    },

    async _purgeDailyPhotoLocalOnly(id: string, notifySource: 'sync' | 'user' = 'sync') {
        const item = DATA_CACHE.dailyPhotos.find(p => p.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        DATA_CACHE.dailyPhotos = DATA_CACHE.dailyPhotos.filter(p => p.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, DATA_CACHE.dailyPhotos);
        notifyUpdate({ source: notifySource, action: 'save', table: 'daily_photos', id });
    },

    getDailyPhotos: () => filterActiveDailyPhotos(DATA_CACHE.dailyPhotos),
    saveDailyPhoto: (p: DailyPhoto) => StorageService._saveInternal('dailyPhotos', CACHE_KEYS.DAILY_PHOTOS, p, 'daily', 'daily_photos'),
    deleteDailyPhoto: async (id: string) => {
        addPendingDelete('daily_photos', id);
        const item = DATA_CACHE.dailyPhotos.find(p => p.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
        if (item?.videoStoragePath) MediaStorageService.deleteMedia(item.videoStoragePath);
        DATA_CACHE.dailyPhotos = DATA_CACHE.dailyPhotos.filter(p => p.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, DATA_CACHE.dailyPhotos);
        notifyUpdate({ source: 'user', action: 'delete', table: 'daily_photos', id });
    },

    async cleanupDailyPhotos() {
        const now = new Date();

        // Find expired photos
        const expired = DATA_CACHE.dailyPhotos.filter(p => new Date(p.expiresAt) <= now);

        if (expired.length > 0) {
            for (const item of expired) {
                await this._purgeDailyPhotoLocalOnly(item.id, 'sync');
            }
        }
    },

    getKeepsakes: () => DATA_CACHE.keepsakes.map((item) => normalizeKeepsakeSender(item)),
    saveKeepsake: (k: Keepsake) => StorageService._saveInternal('keepsakes', CACHE_KEYS.KEEPSAKES, normalizeKeepsakeSender(k), 'keep', 'keepsakes'),
    hideKeepsake: async (id: string) => {
        const list = DATA_CACHE.keepsakes.map(k => k.id === id ? { ...k, isHidden: true } : k);
        DATA_CACHE.keepsakes = list;
        await writeRaw(STORES.DATA, CACHE_KEYS.KEEPSAKES, list);
        notifyUpdate({ source: 'user', action: 'save', table: 'keepsakes', id });
    },

    getNotes: () => DATA_CACHE.notes,
    saveNote: (n: Note) => StorageService._saveInternal('notes', CACHE_KEYS.NOTES, n, undefined, 'notes'),
    deleteNote: async (id: string) => {
        addPendingDelete('notes', id);
        DATA_CACHE.notes = DATA_CACHE.notes.filter(n => n.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.NOTES, DATA_CACHE.notes);
        notifyUpdate({ source: 'user', action: 'delete', table: 'notes', id });
    },

    getSpecialDates: () => DATA_CACHE.specialDates,
    saveSpecialDate: (d: SpecialDate) => StorageService._saveInternal('specialDates', CACHE_KEYS.DATES, d, undefined, 'dates'),
    deleteSpecialDate: async (id: string) => {
        addPendingDelete('dates', id);
        DATA_CACHE.specialDates = DATA_CACHE.specialDates.filter(d => d.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DATES, DATA_CACHE.specialDates);
        notifyUpdate({ source: 'user', action: 'delete', table: 'dates', id });
    },

    getEnvelopes: () => DATA_CACHE.envelopes,
    saveEnvelope: (e: Envelope) => StorageService._saveInternal('envelopes', CACHE_KEYS.ENVELOPES, e, undefined, 'envelopes'),
    deleteEnvelope: async (id: string) => {
        addPendingDelete('envelopes', id);
        DATA_CACHE.envelopes = DATA_CACHE.envelopes.filter(e => e.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.ENVELOPES, DATA_CACHE.envelopes);
        notifyUpdate({ source: 'user', action: 'delete', table: 'envelopes', id });
    },

    getDinnerOptions: () => DATA_CACHE.dinnerOptions.length ? DATA_CACHE.dinnerOptions : [{ id: '1', text: 'Pizza 🍕' }, { id: '2', text: 'Sushi 🍣' }],
    saveDinnerOption: (o: DinnerOption) => StorageService._saveInternal('dinnerOptions', CACHE_KEYS.DINNER_OPTIONS, o, undefined, 'dinner_options'),
    deleteDinnerOption: async (id: string) => {
        DATA_CACHE.dinnerOptions = DATA_CACHE.dinnerOptions.filter(o => o.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DINNER_OPTIONS, DATA_CACHE.dinnerOptions);
        notifyUpdate({ source: 'user', action: 'delete', table: 'dinner_options', id: id });
    },

    getComments: (postId?: string): Comment[] => {
        if (postId) return DATA_CACHE.comments.filter(c => c.postId === postId);
        return DATA_CACHE.comments;
    },
    saveComment: async (c: Comment) => {
        const sanitizedComment = sanitizeUserContent(c);
        const list = [...DATA_CACHE.comments];
        const idx = list.findIndex(i => i.id === sanitizedComment.id);
        if (idx >= 0) list[idx] = sanitizedComment;
        else list.push(sanitizedComment);
        DATA_CACHE.comments = list;
        await writeRaw(STORES.DATA, CACHE_KEYS.COMMENTS, list);
        notifyUpdate({ source: 'user', action: 'save', table: 'comments', id: sanitizedComment.id, item: sanitizedComment });
    },
    deleteComment: async (id: string) => {
        addPendingDelete('comments', id);
        DATA_CACHE.comments = DATA_CACHE.comments.filter(c => c.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.COMMENTS, DATA_CACHE.comments);
        notifyUpdate({ source: 'user', action: 'delete', table: 'comments', id });
    },

    async handleCloudUpdate(table: string, data: any) {
        const rowMeta = data?.data
            ? { userId: data.user_id, coupleId: data.couple_id }
            : undefined;
        const item = rowMeta ? { ...data.data, __rowMeta: rowMeta } : (data.data || data);
        if (!item) return;
        const singletonTables = new Set(['couple_profile', 'pet_stats', 'together_music', 'our_room_state']);
        if (!singletonTables.has(table) && !item.id) return;

        if (table === 'daily_photos' && isDailyMomentExpired(item)) {
            if (DATA_CACHE.dailyPhotos.some((photo) => photo.id === item.id)) {
                await this._purgeDailyPhotoLocalOnly(item.id, 'sync');
            }
            return;
        }

        // Never restore a tombstoned item — it was deleted locally and cloud hasn't caught up yet
        if (isDeletedLocally(table, item.id)) return;

        const tableMap: Record<string, { cache: keyof typeof DATA_CACHE, key: string, prefix?: string }> = {
            memories: { cache: 'memories', key: CACHE_KEYS.MEMORIES, prefix: 'mem' },
            notes: { cache: 'notes', key: CACHE_KEYS.NOTES },
            dates: { cache: 'specialDates', key: CACHE_KEYS.DATES },
            envelopes: { cache: 'envelopes', key: CACHE_KEYS.ENVELOPES },
            daily_photos: { cache: 'dailyPhotos', key: CACHE_KEYS.DAILY_PHOTOS, prefix: 'daily' },
            keepsakes: { cache: 'keepsakes', key: CACHE_KEYS.KEEPSAKES, prefix: 'keep' },
            dinner_options: { cache: 'dinnerOptions', key: CACHE_KEYS.DINNER_OPTIONS },
            comments: { cache: 'comments', key: CACHE_KEYS.COMMENTS },
            mood_entries: { cache: 'moodEntries', key: CACHE_KEYS.MOOD_ENTRIES },
            us_bucket_items: { cache: 'usBucketItems', key: CACHE_KEYS.US_BUCKET_ITEMS },
            us_wishlist_items: { cache: 'usWishlistItems', key: CACHE_KEYS.US_WISHLIST_ITEMS },
            us_milestones: { cache: 'usMilestones', key: CACHE_KEYS.US_MILESTONES },
            time_capsules: { cache: 'timeCapsules', key: CACHE_KEYS.TIME_CAPSULES, prefix: 'cap' },
            surprises: { cache: 'surprises', key: CACHE_KEYS.SURPRISES, prefix: 'surp' },
            voice_notes: { cache: 'voiceNotes', key: CACHE_KEYS.VOICE_NOTES, prefix: 'vn' },
        };

        if (tableMap[table]) {
            const config = tableMap[table];
            const list = DATA_CACHE[config.cache] as any[];
            const isNew = !list.find(i => i.id === item.id);
            
            await this._saveInternal(config.cache, config.key, item, config.prefix, table, 'sync');

            // Send push notification if app is in background and item is new
            if (isNew && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                let msg = '';
                if (table === 'memories') msg = 'A new memory was added to your vault!';
                else if (table === 'notes') msg = 'Your partner left you a note 💌';
                else if (table === 'daily_photos') msg = 'A new Daily Photo was shared 📸';
                else if (table === 'keepsakes') msg = 'A new keepsake arrived in your box 🎁';
                else if (table === 'comments') msg = 'Your partner commented on something 💬';
                
                if (msg) new Notification('Lior', { body: msg, icon: '/icon.svg' });
            }
        } else if (table === 'couple_profile') {
            const local = this.getCoupleProfile();
            if (item.anniversaryDate) {
                // Only merge shared fields — never overwrite local identity (myName/partnerName)
                // from cloud data. Each device owns its own identity; syncing would swap names.
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { myName: _m, partnerName: _p, ...sharedFromCloud } = item as any;
                this.saveCoupleProfile({ ...local, ...sharedFromCloud }, 'sync');
            }
        } else if (table === 'pet_stats') {
            this.savePetStats(item, 'sync');
        } else if (table === 'user_status') {
            const profile = this.getCoupleProfile();
            if (item.id === profile.partnerName) {
                localStorage.setItem(CACHE_KEYS.PARTNER_STATUS, JSON.stringify(item));
                writeRaw(STORES.DATA, CACHE_KEYS.PARTNER_STATUS, item);
                notifyUpdate({ source: 'sync', action: 'save', table, id: item.id });
            } else if (item.id === profile.myName) {
                localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(item));
                writeRaw(STORES.DATA, CACHE_KEYS.USER_STATUS, item);
                notifyUpdate({ source: 'sync', action: 'save', table, id: item.id });
            }
        } else if (table === 'together_music') {
            const musicData = item.music_url || item.music_base64;
            if (musicData) {
                await writeRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY, musicData);
                if (item.meta) {
                    const localMeta = this.getTogetherMusicMetadata();
                    const metaWithOwner: TogetherMusicMetadata = {
                        ...item.meta,
                        ownerUserId: item.ownerUserId || rowMeta?.userId || localMeta?.ownerUserId,
                    };
                    localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(metaWithOwner));
                    await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, metaWithOwner);
                }
                notifyUpdate({ source: 'sync', action: 'save', table, id: 'singleton' });
            }
        } else if (table === 'our_room_state') {
            const sanitized = sanitizeUserContent(item);
            const nextCoupleRoom = Array.isArray((sanitized as any)?.notes) || Array.isArray((sanitized as any)?.gifts)
                ? normalizeCoupleRoom(sanitized as Partial<CoupleRoomState>)
                : migrateFromOldRoom(sanitized);
            const legacyMirror = toLegacyRoomState(nextCoupleRoom);

            localStorage.setItem(COUPLE_ROOM_KEY, JSON.stringify(nextCoupleRoom));
            localStorage.setItem(CACHE_KEYS.OUR_ROOM_STATE, JSON.stringify(legacyMirror));
            localStorage.setItem('lior_room_state', JSON.stringify(legacyMirror));
            await writeRaw(STORES.DATA, COUPLE_ROOM_KEY, nextCoupleRoom);
            await writeRaw(STORES.DATA, CACHE_KEYS.OUR_ROOM_STATE, legacyMirror);

            notifyUpdate({ source: 'sync', action: 'save', table, id: 'singleton', item: nextCoupleRoom });
        }
    },

    async handleCloudDelete(table: string, id: string) {
        const tableToStorage: Record<string, { cache: keyof typeof DATA_CACHE, key: string }> = {
            memories: { cache: 'memories', key: CACHE_KEYS.MEMORIES },
            daily_photos: { cache: 'dailyPhotos', key: CACHE_KEYS.DAILY_PHOTOS },
            keepsakes: { cache: 'keepsakes', key: CACHE_KEYS.KEEPSAKES },
            notes: { cache: 'notes', key: CACHE_KEYS.NOTES },
            dates: { cache: 'specialDates', key: CACHE_KEYS.DATES },
            envelopes: { cache: 'envelopes', key: CACHE_KEYS.ENVELOPES },
            comments: { cache: 'comments', key: CACHE_KEYS.COMMENTS },
            us_bucket_items: { cache: 'usBucketItems', key: CACHE_KEYS.US_BUCKET_ITEMS },
            us_wishlist_items: { cache: 'usWishlistItems', key: CACHE_KEYS.US_WISHLIST_ITEMS },
            us_milestones: { cache: 'usMilestones', key: CACHE_KEYS.US_MILESTONES },
            time_capsules: { cache: 'timeCapsules', key: CACHE_KEYS.TIME_CAPSULES },
            surprises: { cache: 'surprises', key: CACHE_KEYS.SURPRISES },
            voice_notes: { cache: 'voiceNotes', key: CACHE_KEYS.VOICE_NOTES },
        };
        if (tableToStorage[table]) {
            const cfg = tableToStorage[table];
            const list = DATA_CACHE[cfg.cache] as any[];
            const item = list.find(i => i.id === id);
            if (item?.imageId) {
                await deleteRaw(STORES.IMAGES, item.imageId);
                MEDIA_MEMORY_CACHE.delete(item.imageId);
            }
            if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
            if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
            if (item?.videoStoragePath) MediaStorageService.deleteMedia(item.videoStoragePath);
            DATA_CACHE[cfg.cache] = list.filter(i => i.id !== id);
            await writeRaw(STORES.DATA, cfg.key, DATA_CACHE[cfg.cache]);
            notifyUpdate({ source: 'sync', action: 'delete', table, id });
        } else if (table === 'together_music') {
            await deleteRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY);
            await deleteRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META);
            localStorage.removeItem(CACHE_KEYS.TOGETHER_MUSIC_META);
            notifyUpdate({ source: 'sync', action: 'delete', table, id });
        } else if (table === 'our_room_state') {
            const defaultCoupleRoom = normalizeCoupleRoom();
            const legacyMirror = toLegacyRoomState(defaultCoupleRoom);
            localStorage.setItem(COUPLE_ROOM_KEY, JSON.stringify(defaultCoupleRoom));
            localStorage.setItem(CACHE_KEYS.OUR_ROOM_STATE, JSON.stringify(legacyMirror));
            localStorage.setItem('lior_room_state', JSON.stringify(legacyMirror));
            await writeRaw(STORES.DATA, COUPLE_ROOM_KEY, defaultCoupleRoom);
            await writeRaw(STORES.DATA, CACHE_KEYS.OUR_ROOM_STATE, legacyMirror);
            notifyUpdate({ source: 'sync', action: 'delete', table, id: 'singleton' });
        }
    },

    saveTogetherMusic: async (file: File) => {
        if (file.size > 10 * 1024 * 1024) throw new Error("File too large. Max size is 10MB.");
        assertManagedStorageBudget('together-music', file.size, Number(StorageService.getTogetherMusicMetadata()?.size || 0));
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                try {
                    const previousSource = await readRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY) as string | null;
                    const hasCloud = SupabaseService.init();
                    const ownerUserId = hasCloud ? await SupabaseService.getCurrentUserId() ?? undefined : undefined;
                    const meta: TogetherMusicMetadata = {
                        name: file.name,
                        date: new Date().toISOString(),
                        size: file.size,
                        mimeType: file.type || getMimeTypeFromDataUri(base64),
                        ownerUserId,
                    };
                    let storedSource = base64;
                    let cloudPayload: any = { music_base64: base64, meta, ownerUserId };

                    if (hasCloud) {
                        // Upload audio to R2 — avoid storing large base64 in Supabase JSONB
                        const path = await MediaStorageService.buildCustomPath('singleton', 'together-music', 'track', {
                            ownerUserId,
                            timestamp: meta.date,
                        });
                        const uploaded = await MediaStorageService.uploadMedia(base64, path);
                        const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
                        if (uploaded && verified === true) {
                            storedSource = uploaded;
                            cloudPayload = { music_url: uploaded, meta, ownerUserId };
                        }
                    }
                    await writeRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY, storedSource);
                    localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(meta));
                    await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, meta);
                    if (hasCloud) {
                        await SupabaseService.saveSingle('together_music', cloudPayload);
                    }
                    if (
                        previousSource &&
                        previousSource !== storedSource &&
                        !storedSource.startsWith('data:') &&
                        MediaStorageService.isMediaReference(previousSource)
                    ) {
                        await MediaStorageService.deleteMedia(previousSource);
                    }
                    notifyUpdate({ source: 'user', action: 'save', table: 'together_music', id: 'singleton', item: cloudPayload });
                    resolve();
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    },

    getStoredTogetherMusicSource: async (): Promise<string | null> => readRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY),
    getTogetherMusic: async (): Promise<string | null> => {
        const stored = await readRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY) as string | null;
        if (!stored) return null;
        if (stored.startsWith('data:')) return stored;
        return await MediaStorageService.getAccessibleUrl(stored) || stored;
    },
    getTogetherMusicMetadata: (): TogetherMusicMetadata | null => {
        const str = localStorage.getItem(CACHE_KEYS.TOGETHER_MUSIC_META);
        return str ? JSON.parse(str) : null;
    },

    deleteTogetherMusic: async () => {
        const storedSource = await readRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY) as string | null;
        if (storedSource && MediaStorageService.isMediaReference(storedSource)) {
            await MediaStorageService.deleteMedia(storedSource);
        }
        await deleteRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY);
        await deleteRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META);
        localStorage.removeItem(CACHE_KEYS.TOGETHER_MUSIC_META);
        if (SupabaseService.init()) await SupabaseService.deleteItem('together_music', 'singleton');
        notifyUpdate({ source: 'user', action: 'delete', table: 'together_music', id: 'singleton' });
    },

    getCoupleProfile: (): CoupleProfile => {
        const idStr = localStorage.getItem(CACHE_KEYS.IDENTITY);
        const sharedStr = localStorage.getItem(CACHE_KEYS.SHARED_PROFILE);

        const rawIdentity = idStr ? JSON.parse(idStr) : { myName: '', partnerName: '' };
        const id = normalizeIdentityPair(rawIdentity);
        if (id.myName !== rawIdentity.myName || id.partnerName !== rawIdentity.partnerName) {
            localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify({ myName: id.myName, partnerName: id.partnerName }));
        }

        const shared = sharedStr ? JSON.parse(sharedStr) : { anniversaryDate: '', theme: 'rose' };

        return { ...id, ...shared };
    },

    saveCoupleProfile: (p: CoupleProfile, source: 'user' | 'sync' = 'user') => {
        const sanitizedProfile = normalizeIdentityPair(sanitizeUserContent(p));
        localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify({ myName: sanitizedProfile.myName, partnerName: sanitizedProfile.partnerName }));
        const sharedProfile = { ...sanitizedProfile };
        delete (sharedProfile as any).myName;
        delete (sharedProfile as any).partnerName;
        localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify(sharedProfile));

        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.SHARED_PROFILE, sharedProfile);

        notifyUpdate({ source, action: 'save', table: 'couple_profile', id: 'singleton', item: sanitizedProfile });
    },

    checkInStreak: (): void => {
        const profile = StorageService.getCoupleProfile();
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const existing: StreakData = profile.streakData ?? {
            checkIns: {},
            count: 0,
            lastMutualDate: '',
            bestStreak: 0,
        };

        const checkIns = { ...existing.checkIns, [profile.myName]: today };
        const partnerDate = checkIns[profile.partnerName];
        const bothToday = partnerDate === today;

        let count = existing.count;
        let lastMutualDate = existing.lastMutualDate;
        let bestStreak = existing.bestStreak ?? 0;
        let lastBrokenCount = existing.lastBrokenCount;
        let lastBrokenDate = existing.lastBrokenDate;

        if (bothToday && lastMutualDate !== today) {
            const continued = lastMutualDate === yesterday;
            if (!continued && count > 0) {
                // Streak broke — record it
                lastBrokenCount = count;
                lastBrokenDate = today;
                count = 1;
            } else {
                count = continued ? count + 1 : 1;
            }
            lastMutualDate = today;
            if (count > bestStreak) bestStreak = count;
        }

        StorageService.saveCoupleProfile({
            ...profile,
            streakData: { checkIns, count, lastMutualDate, bestStreak, lastBrokenCount, lastBrokenDate },
        });
    },

    getTodayQuestion: (myName: string, partnerName: string): QuestionEntry => {
        const profile = StorageService.getCoupleProfile();
        const today = new Date().toISOString().split('T')[0];
        const existing = (profile.questions ?? []).find(q => q.date === today);
        if (existing) return existing;

        // Deterministic question from pool using date hash
        // Mix: ~55 light/fun, ~25 reflective, ~10 deep — heavy ones sprinkled, not daily
        const QUESTIONS = [
            // ── Light & Fun ──
            "If today had a flavor, what would it be?",
            "What's the most useless talent you have?",
            "If we swapped lives for one day, what's the first thing you'd do?",
            "What's a guilty pleasure you've never fully admitted to me?",
            "What's your go-to order when you genuinely can't decide?",
            "If you had to describe today using only a movie title, what would it be?",
            "What's a weird habit you have that I probably don't know about?",
            "What's the last song you had stuck in your head all day?",
            "What's something you bought recently that you absolutely did not need?",
            "If we were any two animals, what would we be and why?",
            "What's something on your phone you'd be mildly embarrassed if I saw?",
            "What's a childhood snack you still secretly love?",
            "What's a conspiracy theory you kind of half-believe?",
            "What would your reality TV show be called?",
            "What's the most random thing you googled this week?",
            "If today had a color, what would it be?",
            "What's a small luxury that makes your day noticeably better?",
            "What's a smell that instantly takes you somewhere else?",
            "If you could have any superpower just for tomorrow, what would you pick?",
            "What's something tiny that actually made today a little better?",
            "What's the last photo you took on your phone?",
            "If we had a theme song right now, what would it be?",
            "What's a word in another language you love the sound of?",
            "What's something you've been procrastinating on for way too long?",
            "What's a show or movie you could rewatch forever?",
            "If you could rename yourself, would you? What to?",
            "What's the weirdest dream you've had recently?",
            "What's a skill you wish you had but never actually learned?",
            "What's your comfort food right now, no judgment?",
            "If you could teleport anywhere for exactly one hour, where?",
            "What's a place you really want to show me someday?",
            "What's a compliment someone gave you that you still think about?",
            "What's something you've been watching or reading lately?",
            "What would you do if you had a completely free, unplanned day tomorrow?",
            "If you could have dinner with any fictional character, who and why?",
            "What's a small thing you're quietly looking forward to this week?",
            "What's a word you always spell wrong no matter how many times you look it up?",
            "What's something you used to be obsessed with that you've completely moved on from?",
            "If you could only keep three apps on your phone, which ones?",
            "What's something that always makes you feel instantly better?",

            // ── Reflective & Warm ──
            "What's something you learned about yourself recently that surprised you?",
            "What's a decision you made lately that you feel genuinely good about?",
            "What's a memory from us that you come back to more than I probably know?",
            "What does a perfect lazy day actually look like for you?",
            "What's something you're quietly proud of yourself for?",
            "What's something you wish people understood about you without having to explain it?",
            "What's a version of our future that you love imagining?",
            "What's something I do that means more to you than I probably realize?",
            "What's a quality in yourself that you're actively trying to grow?",
            "What made you feel most understood recently?",
            "What does feeling at home feel like to you?",
            "What's a moment from the last few months you'd want to live again?",
            "What's something you've let go of that felt hard but turned out to be right?",
            "What's something we do together that feels like its own little world?",
            "What's a way I've grown recently that you've noticed?",
            "What's something about our relationship that still surprises you?",
            "What's a goal you set for yourself this year — how's it going honestly?",
            "What's something you're still figuring out about yourself?",
            "What's something you're grateful for that you don't say out loud enough?",
            "What does a good day feel like for you lately — what's the common thread?",
            "What's a memory from your childhood you love revisiting?",
            "What's a book, song, or film that genuinely changed how you think?",
            "What's something about love that you understand now that you didn't before?",
            "What's something small I do that you'd miss a lot if I stopped?",
            "If you wrote me a letter tonight, what would the first line be?",

            // ── Deep & Vulnerable (occasional — roughly 1 in 9 days) ──
            "What's something you've been carrying alone lately that you haven't said out loud?",
            "What's something you wish you could go back and tell a younger version of yourself?",
            "What's a part of you that you find genuinely hard to share, even with me?",
            "What's something you're afraid to want too much — in case it doesn't happen?",
            "When was the last time you felt truly at peace, and what was happening?",
            "What's a wound that's still healing, even slowly?",
            "What do you need more of that you find hard to ask for?",
            "What does feeling loved by me look like on a really hard day?",
            "What's a fear about us you've never said out loud?",
            "What's a question you wish I would ask you more?",
        ];

        const parts = today.split('-').map(Number);
        const hash = parts[0] * 31 + parts[1] * 7 + parts[2];
        const question = QUESTIONS[Math.abs(hash) % QUESTIONS.length];

        const entry: QuestionEntry = { date: today, question, answers: {} };
        const updated = [...(profile.questions ?? []).filter(q => {
            const age = Date.now() - new Date(q.date).getTime();
            return age < 90 * 24 * 60 * 60 * 1000; // keep 90 days
        }), entry];
        StorageService.saveCoupleProfile({ ...profile, questions: updated });
        return entry;
    },

    submitQuestionAnswer: (answer: string): void => {
        const profile = StorageService.getCoupleProfile();
        const today = new Date().toISOString().split('T')[0];
        const questions = profile.questions ?? [];
        const idx = questions.findIndex(q => q.date === today);
        if (idx === -1) return;

        const updated = questions.map((q, i) => {
            if (i !== idx) return q;
            const answers = { ...q.answers, [profile.myName]: answer };
            const bothAnswered = answers[profile.myName] && answers[profile.partnerName];
            return { ...q, answers, revealedAt: bothAnswered ? new Date().toISOString() : q.revealedAt };
        });
        StorageService.saveCoupleProfile({ ...profile, questions: updated });
    },

    getMoodEntries: (): MoodEntry[] => {
        if (DATA_CACHE.moodEntries.length > 0) return DATA_CACHE.moodEntries;
        const str = localStorage.getItem(CACHE_KEYS.MOOD_ENTRIES);
        if (str) {
            DATA_CACHE.moodEntries = JSON.parse(str);
            return DATA_CACHE.moodEntries;
        }
        return [];
    },

    saveMoodEntry: (entry: MoodEntry, source: 'user' | 'sync' = 'user') => {
        const entries = StorageService.getMoodEntries();
        const existingIdx = entries.findIndex(e => e.id === entry.id);
        if (existingIdx >= 0) {
            entries[existingIdx] = entry;
        } else {
            entries.push(entry);
        }
        localStorage.setItem(CACHE_KEYS.MOOD_ENTRIES, JSON.stringify(entries));
        writeRaw(STORES.DATA, CACHE_KEYS.MOOD_ENTRIES, entries);
        notifyUpdate({ source, action: 'save', table: 'mood_entries', id: entry.id, item: entry });
    },

    getPetStats: (): PetStats => {
        const str = localStorage.getItem(CACHE_KEYS.PET_STATS);
        const defaults: PetStats = {
            name: 'Coco', type: 'bear', lastFed: '1970-01-01T00:00:00.000Z', lastPetted: '1970-01-01T00:00:00.000Z', happiness: 50,
            xp: 0,
            careStreak: 0,
            presenceStreak: 0,
            bondMoments: 0,
            coins: 0, inventory: [], equipped: {}
        };
        if (str) {
            const parsed = JSON.parse(str);
            return { ...defaults, ...parsed };
        }
        return defaults;
    },

    savePetStats: (s: PetStats, source: 'user' | 'sync' = 'user') => {
        const sanitizedStats = sanitizeUserContent(s);
        localStorage.setItem(CACHE_KEYS.PET_STATS, JSON.stringify(sanitizedStats));
        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.PET_STATS, sanitizedStats);
        notifyUpdate({ source, action: 'save', table: 'pet_stats', id: 'singleton', item: sanitizedStats });
    },

    getStatus: (): UserStatus => JSON.parse(localStorage.getItem(CACHE_KEYS.USER_STATUS) || '{"state":"awake","timestamp":"' + new Date().toISOString() + '"}'),
    saveStatus: (s: UserStatus) => {
        localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(s));
        writeRaw(STORES.DATA, CACHE_KEYS.USER_STATUS, s);
        const profile = StorageService.getCoupleProfile();
        notifyUpdate({ source: 'user', action: 'save', table: 'user_status', id: profile.myName, item: { id: profile.myName, ...s } });
    },
    getPartnerStatus: (): UserStatus => JSON.parse(localStorage.getItem(CACHE_KEYS.PARTNER_STATUS) || '{"state":"awake","timestamp":""}'),

    getBonsaiState: (): any => {
        const profile = StorageService.getCoupleProfile();
        return profile.bonsaiState || { level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' };
    },
    saveBonsaiState: (s: any, source: 'user' | 'sync' = 'user') => {
        const profile = StorageService.getCoupleProfile();
        profile.bonsaiState = s;
        StorageService.saveCoupleProfile(profile, source);
    },

    addMissedAura: (payload: any) => {
        const profile = StorageService.getCoupleProfile();
        if (!profile.missedAuras) profile.missedAuras = [];
        const msg = {
            id: crypto.randomUUID(),
            target: profile.partnerName,
            timestamp: new Date().toISOString(),
            payload
        };
        profile.missedAuras.push(msg);
        StorageService.saveCoupleProfile(profile);
    },

    removeMissedAura: (id: string) => {
        const profile = StorageService.getCoupleProfile();
        if (!profile.missedAuras) return;
        profile.missedAuras = profile.missedAuras.filter((a: any) => a.id !== id);
        StorageService.saveCoupleProfile(profile);
    },

    getRoomState: (): RoomState => {
        const fallback: RoomState = DEFAULT_ROOM_STATE;
        try {
            const raw = localStorage.getItem(CACHE_KEYS.OUR_ROOM_STATE) || localStorage.getItem('lior_room_state');
            if (!raw) {
                const coupleRaw = localStorage.getItem(COUPLE_ROOM_KEY);
                if (!coupleRaw) return fallback;
                return toLegacyRoomState(JSON.parse(coupleRaw));
            }
            const parsed = JSON.parse(raw) as Partial<RoomState> & { furniture?: any[] };
            const legacyFurniture = Array.isArray(parsed.furniture) ? parsed.furniture : [];
            const migratedPlaced = legacyFurniture.map((f: any, idx: number) => ({
                uid: f.uid || crypto.randomUUID(),
                itemId: LEGACY_ROOM_ITEM_MAP[f.itemId] || f.itemId || 'fluffy_couch',
                x: Math.max(8, Math.min(92, 18 + ((f.gx ?? 0) * 12))),
                y: Math.max(12, Math.min(90, 20 + ((f.gy ?? 0) * 10))),
                z: idx,
                placedBy: f.placedBy || '',
            }));
            return normalizeRoomState({
                placedItems: Array.isArray(parsed.placedItems)
                    ? parsed.placedItems.map((it: any) => ({ ...it, itemId: LEGACY_ROOM_ITEM_MAP[it.itemId] || it.itemId || 'fluffy_couch' }))
                    : migratedPlaced,
                coins: Number.isFinite(parsed.coins) ? Number(parsed.coins) : 500,
                love: Number.isFinite((parsed as any).love) ? Number((parsed as any).love) : fallback.love,
                stars: Number.isFinite((parsed as any).stars) ? Number((parsed as any).stars) : fallback.stars,
                xp: Number.isFinite((parsed as any).xp) ? Number((parsed as any).xp) : fallback.xp,
                roomXp: Number.isFinite((parsed as any).roomXp) ? Number((parsed as any).roomXp) : fallback.roomXp,
                bondXp: Number.isFinite((parsed as any).bondXp) ? Number((parsed as any).bondXp) : fallback.bondXp,
                roomName: parsed.roomName || 'P1 Room',
                wallpaper: ROOM_WALLPAPERS.has(String(parsed.wallpaper)) ? parsed.wallpaper : 'plain',
                floor: ROOM_FLOORS.has(String(parsed.floor)) ? parsed.floor : 'carpet',
                ambient: ROOM_AMBIENTS.has(String(parsed.ambient)) ? parsed.ambient : 'warm',
                lastActiveAt: (parsed as any).lastActiveAt,
                lastIdleClaimAt: (parsed as any).lastIdleClaimAt,
                purchaseCounts: (parsed as any).purchaseCounts,
                upgrades: (parsed as any).upgrades,
                daily: (parsed as any).daily,
                stats: (parsed as any).stats,
                unlockedThemes: (parsed as any).unlockedThemes,
            });
        } catch {
            return fallback;
        }
    },

    saveRoomState: (state: RoomState, source: 'user' | 'sync' = 'user'): void => {
        const nextState = sanitizeUserContent(normalizeRoomState(state));
        localStorage.setItem(CACHE_KEYS.OUR_ROOM_STATE, JSON.stringify(nextState));
        localStorage.setItem('lior_room_state', JSON.stringify(nextState)); // legacy key mirror
        writeRaw(STORES.DATA, CACHE_KEYS.OUR_ROOM_STATE, nextState);
        notifyUpdate({ source, action: 'save', table: 'our_room_state', id: 'singleton', item: nextState });
    },

    getCoupleRoomState: (): CoupleRoomState => {
        try {
            const raw = localStorage.getItem(COUPLE_ROOM_KEY);
            if (raw) return normalizeCoupleRoom(JSON.parse(raw));

            // Legacy Migration: If v2 doesn't exist, try to migrate from v1
            const oldRaw = localStorage.getItem(CACHE_KEYS.OUR_ROOM_STATE) || localStorage.getItem('lior_room_state');
            if (oldRaw) {
                const migrated = migrateFromOldRoom(JSON.parse(oldRaw));
                localStorage.setItem(COUPLE_ROOM_KEY, JSON.stringify(migrated));
                writeRaw(STORES.DATA, COUPLE_ROOM_KEY, migrated);
                return migrated;
            }
        } catch {}
        return normalizeCoupleRoom();
    },


    saveCoupleRoomState: (state: CoupleRoomState, source: 'user' | 'sync' = 'user'): void => {
        const nextState = sanitizeUserContent(normalizeCoupleRoom(state));
        const legacyMirror = toLegacyRoomState(nextState);
        localStorage.setItem(COUPLE_ROOM_KEY, JSON.stringify(nextState));
        localStorage.setItem(CACHE_KEYS.OUR_ROOM_STATE, JSON.stringify(legacyMirror));
        localStorage.setItem('lior_room_state', JSON.stringify(legacyMirror));
        writeRaw(STORES.DATA, COUPLE_ROOM_KEY, nextState);
        writeRaw(STORES.DATA, CACHE_KEYS.OUR_ROOM_STATE, legacyMirror);
        notifyUpdate({ source, action: 'save', table: 'our_room_state', id: 'singleton', item: nextState });
    },


    getUsBucketItems: (): UsBucketItem[] => {
        if (DATA_CACHE.usBucketItems.length > 0) return DATA_CACHE.usBucketItems;
        const raw = localStorage.getItem(CACHE_KEYS.US_BUCKET_ITEMS) || localStorage.getItem('lior_bucket');
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            DATA_CACHE.usBucketItems = Array.isArray(parsed) ? parsed : [];
            return DATA_CACHE.usBucketItems;
        } catch {
            DATA_CACHE.usBucketItems = [];
            return [];
        }
    },

    saveUsBucketItem: (item: UsBucketItem, source: 'user' | 'sync' = 'user') => {
        const sanitized = sanitizeUserContent(item);
        const list = StorageService.getUsBucketItems();
        const idx = list.findIndex((it) => it.id === sanitized.id);
        if (idx >= 0) list[idx] = sanitized;
        else list.unshift(sanitized);
        DATA_CACHE.usBucketItems = list;
        localStorage.setItem(CACHE_KEYS.US_BUCKET_ITEMS, JSON.stringify(list));
        localStorage.setItem('lior_bucket', JSON.stringify(list)); // legacy key mirror
        writeRaw(STORES.DATA, CACHE_KEYS.US_BUCKET_ITEMS, list);
        notifyUpdate({ source, action: 'save', table: 'us_bucket_items', id: sanitized.id, item: sanitized });
    },

    deleteUsBucketItem: (id: string, source: 'user' | 'sync' = 'user') => {
        if (source === 'user') addPendingDelete('us_bucket_items', id);
        DATA_CACHE.usBucketItems = StorageService.getUsBucketItems().filter((it) => it.id !== id);
        localStorage.setItem(CACHE_KEYS.US_BUCKET_ITEMS, JSON.stringify(DATA_CACHE.usBucketItems));
        localStorage.setItem('lior_bucket', JSON.stringify(DATA_CACHE.usBucketItems));
        writeRaw(STORES.DATA, CACHE_KEYS.US_BUCKET_ITEMS, DATA_CACHE.usBucketItems);
        notifyUpdate({ source, action: 'delete', table: 'us_bucket_items', id });
    },

    getUsWishlistItems: (): UsWishlistItem[] => {
        if (DATA_CACHE.usWishlistItems.length > 0) return DATA_CACHE.usWishlistItems;
        const raw = localStorage.getItem(CACHE_KEYS.US_WISHLIST_ITEMS) || localStorage.getItem('lior_wishlist');
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            const profile = StorageService.getCoupleProfile();
            const normalized = (Array.isArray(parsed) ? parsed : []).map((item: any) => {
                if (item.ownerName) return item;
                if (item.owner === 'me') return { ...item, ownerName: profile.myName };
                if (item.owner === 'partner') return { ...item, ownerName: profile.partnerName };
                return { ...item, ownerName: profile.myName };
            });
            DATA_CACHE.usWishlistItems = normalized;
            return DATA_CACHE.usWishlistItems;
        } catch {
            DATA_CACHE.usWishlistItems = [];
            return [];
        }
    },

    saveUsWishlistItem: (item: UsWishlistItem, source: 'user' | 'sync' = 'user') => {
        const sanitized = sanitizeUserContent(item);
        const list = StorageService.getUsWishlistItems();
        const idx = list.findIndex((it) => it.id === sanitized.id);
        if (idx >= 0) list[idx] = sanitized;
        else list.unshift(sanitized);
        DATA_CACHE.usWishlistItems = list;
        localStorage.setItem(CACHE_KEYS.US_WISHLIST_ITEMS, JSON.stringify(list));
        localStorage.setItem('lior_wishlist', JSON.stringify(list)); // legacy key mirror
        writeRaw(STORES.DATA, CACHE_KEYS.US_WISHLIST_ITEMS, list);
        notifyUpdate({ source, action: 'save', table: 'us_wishlist_items', id: sanitized.id, item: sanitized });
    },

    deleteUsWishlistItem: (id: string, source: 'user' | 'sync' = 'user') => {
        if (source === 'user') addPendingDelete('us_wishlist_items', id);
        DATA_CACHE.usWishlistItems = StorageService.getUsWishlistItems().filter((it) => it.id !== id);
        localStorage.setItem(CACHE_KEYS.US_WISHLIST_ITEMS, JSON.stringify(DATA_CACHE.usWishlistItems));
        localStorage.setItem('lior_wishlist', JSON.stringify(DATA_CACHE.usWishlistItems));
        writeRaw(STORES.DATA, CACHE_KEYS.US_WISHLIST_ITEMS, DATA_CACHE.usWishlistItems);
        notifyUpdate({ source, action: 'delete', table: 'us_wishlist_items', id });
    },

    getUsMilestones: (): UsMilestone[] => {
        if (DATA_CACHE.usMilestones.length > 0) return DATA_CACHE.usMilestones;
        const raw = localStorage.getItem(CACHE_KEYS.US_MILESTONES) || localStorage.getItem('lior_milestones');
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            DATA_CACHE.usMilestones = Array.isArray(parsed) ? parsed : [];
            return DATA_CACHE.usMilestones;
        } catch {
            DATA_CACHE.usMilestones = [];
            return [];
        }
    },

    saveUsMilestone: (item: UsMilestone, source: 'user' | 'sync' = 'user') => {
        const sanitized = sanitizeUserContent(item);
        const list = StorageService.getUsMilestones();
        const idx = list.findIndex((it) => it.id === sanitized.id);
        if (idx >= 0) list[idx] = sanitized;
        else list.push(sanitized);
        DATA_CACHE.usMilestones = list;
        localStorage.setItem(CACHE_KEYS.US_MILESTONES, JSON.stringify(list));
        localStorage.setItem('lior_milestones', JSON.stringify(list)); // legacy key mirror
        writeRaw(STORES.DATA, CACHE_KEYS.US_MILESTONES, list);
        notifyUpdate({ source, action: 'save', table: 'us_milestones', id: sanitized.id, item: sanitized });
    },

    deleteUsMilestone: (id: string, source: 'user' | 'sync' = 'user') => {
        if (source === 'user') addPendingDelete('us_milestones', id);
        DATA_CACHE.usMilestones = StorageService.getUsMilestones().filter((it) => it.id !== id);
        localStorage.setItem(CACHE_KEYS.US_MILESTONES, JSON.stringify(DATA_CACHE.usMilestones));
        localStorage.setItem('lior_milestones', JSON.stringify(DATA_CACHE.usMilestones));
        writeRaw(STORES.DATA, CACHE_KEYS.US_MILESTONES, DATA_CACHE.usMilestones);
        notifyUpdate({ source, action: 'delete', table: 'us_milestones', id });
    },

    // ── Free-tier limits ────────────────────────────────────────────────────
    FREE_MEMORY_LIMIT: 50,
    FREE_DAILY_LIMIT: 30,

    hasReachedMemoryLimit(): boolean {
        const profile = StorageService.getCoupleProfile();
        if (profile.isPremium) return false;
        return DATA_CACHE.memories.length >= this.FREE_MEMORY_LIMIT;
    },

    hasReachedDailyLimit(): boolean {
        const profile = StorageService.getCoupleProfile();
        if (profile.isPremium) return false;
        const today = new Date().toISOString().split('T')[0];
        const todayPhotos = filterActiveDailyPhotos(DATA_CACHE.dailyPhotos).filter(p => p.createdAt.startsWith(today));
        return todayPhotos.length >= this.FREE_DAILY_LIMIT;
    },

    // ── Time Capsules ────────────────────────────────────────────────────────
    getTimeCapsules: (): TimeCapsule[] => {
        if (DATA_CACHE.timeCapsules.length > 0) return DATA_CACHE.timeCapsules;
        const raw = localStorage.getItem(CACHE_KEYS.TIME_CAPSULES);
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            DATA_CACHE.timeCapsules = Array.isArray(parsed) ? parsed : [];
        } catch { DATA_CACHE.timeCapsules = []; }
        return DATA_CACHE.timeCapsules;
    },

    saveTimeCapsule: (item: TimeCapsule) => StorageService._saveInternal('timeCapsules', CACHE_KEYS.TIME_CAPSULES, item, 'cap', 'time_capsules'),

    deleteTimeCapsule: async (id: string) => {
        addPendingDelete('time_capsules', id);
        const item = DATA_CACHE.timeCapsules.find(c => c.id === id);
        if (item?.imageId) await deleteRaw(STORES.IMAGES, item.imageId);
        if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
        DATA_CACHE.timeCapsules = DATA_CACHE.timeCapsules.filter(c => c.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.TIME_CAPSULES, DATA_CACHE.timeCapsules);
        notifyUpdate({ source: 'user', action: 'delete', table: 'time_capsules', id });
    },

    unlockTimeCapsule: async (id: string) => {
        const idx = DATA_CACHE.timeCapsules.findIndex(c => c.id === id);
        if (idx < 0) return;
        DATA_CACHE.timeCapsules = DATA_CACHE.timeCapsules.map(c =>
            c.id === id ? { ...c, isUnlocked: true } : c
        );
        await writeRaw(STORES.DATA, CACHE_KEYS.TIME_CAPSULES, DATA_CACHE.timeCapsules);
        notifyUpdate({ source: 'user', action: 'save', table: 'time_capsules', id });
    },

    // ── Surprises ─────────────────────────────────────────────────────────────
    getSurprises: (): Surprise[] => {
        if (DATA_CACHE.surprises.length > 0) return DATA_CACHE.surprises;
        const raw = localStorage.getItem(CACHE_KEYS.SURPRISES);
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            DATA_CACHE.surprises = Array.isArray(parsed) ? parsed : [];
        } catch { DATA_CACHE.surprises = []; }
        return DATA_CACHE.surprises;
    },

    saveSurprise: (item: Surprise) => StorageService._saveInternal('surprises', CACHE_KEYS.SURPRISES, item, 'surp', 'surprises'),

    deleteSurprise: async (id: string) => {
        addPendingDelete('surprises', id);
        const item = DATA_CACHE.surprises.find(s => s.id === id);
        if (item?.imageId) await deleteRaw(STORES.IMAGES, item.imageId);
        if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
        DATA_CACHE.surprises = DATA_CACHE.surprises.filter(s => s.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.SURPRISES, DATA_CACHE.surprises);
        notifyUpdate({ source: 'user', action: 'delete', table: 'surprises', id });
    },

    markSurpriseDelivered: async (id: string) => {
        DATA_CACHE.surprises = DATA_CACHE.surprises.map(s =>
            s.id === id ? { ...s, delivered: true, deliveredAt: new Date().toISOString() } : s
        );
        await writeRaw(STORES.DATA, CACHE_KEYS.SURPRISES, DATA_CACHE.surprises);
        notifyUpdate({ source: 'user', action: 'save', table: 'surprises', id });
    },

    // ── Voice Notes ──────────────────────────────────────────────────────────
    getVoiceNotes: (): VoiceNote[] => {
        if (DATA_CACHE.voiceNotes.length > 0) return DATA_CACHE.voiceNotes;
        const raw = localStorage.getItem(CACHE_KEYS.VOICE_NOTES);
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            DATA_CACHE.voiceNotes = Array.isArray(parsed) ? parsed : [];
        } catch { DATA_CACHE.voiceNotes = []; }
        return DATA_CACHE.voiceNotes;
    },

    saveVoiceNote: (item: VoiceNote) => StorageService._saveInternal('voiceNotes', CACHE_KEYS.VOICE_NOTES, item, 'vn', 'voice_notes'),

    deleteVoiceNote: async (id: string) => {
        addPendingDelete('voice_notes', id);
        const item = DATA_CACHE.voiceNotes.find(v => v.id === id);
        if (item?.audioId) await deleteRaw(STORES.IMAGES, item.audioId);
        if (item?.audioStoragePath) MediaStorageService.deleteMedia(item.audioStoragePath);
        DATA_CACHE.voiceNotes = DATA_CACHE.voiceNotes.filter(v => v.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.VOICE_NOTES, DATA_CACHE.voiceNotes);
        notifyUpdate({ source: 'user', action: 'delete', table: 'voice_notes', id });
    },

    async saveVoiceNoteAudio(id: string, audioDataUri: string, options?: { ownerUserId?: string; createdAt?: string }): Promise<VoiceNoteAudioSaveResult> {
        const audioId = `vn_${id}`;
        const byteSize = estimateDataUriBytes(audioDataUri);
        const mimeType = getMimeTypeFromDataUri(audioDataUri);
        const existingNote = DATA_CACHE.voiceNotes.find(v => v.id === id);
        assertManagedStorageBudget('voice-notes', byteSize, Number(existingNote?.audioBytes || 0));
        await writeRaw(STORES.IMAGES, audioId, audioDataUri);
        const path = await MediaStorageService.buildCustomPath(id, 'voice-notes', 'audio', {
            ownerUserId: options?.ownerUserId,
            timestamp: options?.createdAt,
        });
        const uploaded = await MediaStorageService.uploadMedia(audioDataUri, path);
        const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
        return {
            storagePath: uploaded && verified === true ? uploaded : null,
            byteSize,
            mimeType,
        };
    },

    async getVoiceNoteAudio(note: VoiceNote): Promise<string | null> {
        if (note.audioId) {
            const cached = await readRaw(STORES.IMAGES, note.audioId);
            if (cached) return cached as string;
        }
        if (note.audioStoragePath) {
            return await MediaStorageService.getAccessibleUrl(note.audioStoragePath)
                || await MediaStorageService.downloadMedia(note.audioStoragePath)
                || note.audioStoragePath;
        }
        return null;
    },

    async exportAllData() {
        const [memories, dailyPhotos, keepsakes, togetherMusic] = await Promise.all([
            Promise.all(DATA_CACHE.memories.map((item) => this._getItemWithImages(item, 'mem'))),
            Promise.all(DATA_CACHE.dailyPhotos.map((item) => this._getItemWithImages(item, 'daily'))),
            Promise.all(DATA_CACHE.keepsakes.map((item) => this._getItemWithImages(item, 'keep'))),
            this.getStoredTogetherMusicSource().then(async (stored) => {
                if (!stored) return null;
                if (stored.startsWith('data:')) return stored;
                return await MediaStorageService.downloadMedia(stored);
            })
        ]);

        return {
            memories,
            notes: DATA_CACHE.notes,
            dates: DATA_CACHE.specialDates,
            envelopes: DATA_CACHE.envelopes,
            dailyPhotos,
            dinnerOptions: DATA_CACHE.dinnerOptions,
            keepsakes,
            comments: DATA_CACHE.comments,
            moodEntries: this.getMoodEntries(),
            profile: this.getCoupleProfile(),
            pet: this.getPetStats(),
            userStatus: this.getStatus(),
            partnerStatus: this.getPartnerStatus(),
            togetherMusic: togetherMusic ? {
                base64: togetherMusic,
                meta: this.getTogetherMusicMetadata()
            } : null
        };
    },

    async importData(data: any) {
        if (!data) return false;

        const simpleCollections: Array<{ items?: any[]; listKey: keyof typeof DATA_CACHE; storageKey: string }> = [
            { items: data.notes, listKey: 'notes', storageKey: CACHE_KEYS.NOTES },
            { items: data.dates, listKey: 'specialDates', storageKey: CACHE_KEYS.DATES },
            { items: data.envelopes, listKey: 'envelopes', storageKey: CACHE_KEYS.ENVELOPES },
            { items: data.dinnerOptions, listKey: 'dinnerOptions', storageKey: CACHE_KEYS.DINNER_OPTIONS },
            { items: data.comments, listKey: 'comments', storageKey: CACHE_KEYS.COMMENTS },
            { items: data.moodEntries, listKey: 'moodEntries', storageKey: CACHE_KEYS.MOOD_ENTRIES }
        ];

        for (const { items, listKey, storageKey } of simpleCollections) {
            await this._replaceCollection(listKey, storageKey, Array.isArray(items) ? items : []);
        }

        const importMediaItems = async (
            items: any[] | undefined,
            listKey: keyof typeof DATA_CACHE,
            storageKey: string,
            prefix: string
        ) => {
            await this._replaceCollection(listKey, storageKey, []);
            for (const item of Array.isArray(items) ? items : []) {
                await this._saveInternal(listKey, storageKey, item, prefix, undefined, 'sync');
            }
        };

        await importMediaItems(data.memories, 'memories', CACHE_KEYS.MEMORIES, 'mem');
        await importMediaItems(data.dailyPhotos, 'dailyPhotos', CACHE_KEYS.DAILY_PHOTOS, 'daily');
        await importMediaItems(data.keepsakes, 'keepsakes', CACHE_KEYS.KEEPSAKES, 'keep');

        if (data.profile) this.saveCoupleProfile(data.profile, 'sync');
        if (data.pet) this.savePetStats(data.pet, 'sync');
        if (data.userStatus) {
            localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(data.userStatus));
            await writeRaw(STORES.DATA, CACHE_KEYS.USER_STATUS, data.userStatus);
        }
        if (data.partnerStatus) {
            localStorage.setItem(CACHE_KEYS.PARTNER_STATUS, JSON.stringify(data.partnerStatus));
            await writeRaw(STORES.DATA, CACHE_KEYS.PARTNER_STATUS, data.partnerStatus);
        }
        if (data.togetherMusic?.base64) {
            await writeRaw(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY, data.togetherMusic.base64);
            if (data.togetherMusic.meta) {
                localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(data.togetherMusic.meta));
                await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, data.togetherMusic.meta);
            }
        }

        notifyUpdate({ source: 'sync', action: 'save', table: 'import', id: 'all' });
        return true;
    },

    async getStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
        return null;
    },

    getManagedStorageStats(): { totalBytes: number; totalQuotaBytes: number; breakdown: ManagedStorageBreakdown[] } {
        return getManagedStorageTotals();
    },

    /**
     * Recovery: Pull images back from Supabase cloud into local IndexedDB.
     * Call this when local images are missing but cloud has the data.
     */
    async recoverImagesFromCloud(): Promise<{ recovered: number; failed: number }> {
        if (!SupabaseService.init()) return { recovered: 0, failed: 0 };

        let recovered = 0;
        let failed = 0;

        const mediaTables: { table: string; cache: keyof typeof DATA_CACHE; prefix: string }[] = [
            { table: 'memories', cache: 'memories', prefix: 'mem' },
            { table: 'daily_photos', cache: 'dailyPhotos', prefix: 'daily' },
            { table: 'keepsakes', cache: 'keepsakes', prefix: 'keep' },
            { table: 'time_capsules', cache: 'timeCapsules', prefix: 'cap' },
            { table: 'surprises', cache: 'surprises', prefix: 'surp' },
        ];

        for (const { table, cache, prefix } of mediaTables) {
            try {
                const cloudItems = await SupabaseService.fetchAll(table);
                if (!cloudItems) continue;

                const cacheKeyMap: Record<string, string> = {
                    memories: CACHE_KEYS.MEMORIES,
                    dailyPhotos: CACHE_KEYS.DAILY_PHOTOS,
                    keepsakes: CACHE_KEYS.KEEPSAKES,
                    timeCapsules: CACHE_KEYS.TIME_CAPSULES,
                    surprises: CACHE_KEYS.SURPRISES,
                };

                for (const raw of cloudItems) {
                    const item = raw?.data || raw;
                    if (!item?.id) continue;

                    const imageId = item.imageId || `${prefix}_${item.id}`;
                    const videoId = item.videoId || `${prefix}_vid_${item.id}`;
                    const imagePath = item.storagePath || (MediaStorageService.isMediaReference(item.image) ? item.image : null);
                    const videoPath = item.videoStoragePath || (MediaStorageService.isMediaReference(item.video) ? item.video : null);

                    // Recover image if cloud has base64 and local IDB doesn't
                    if (item.image?.startsWith('data:')) {
                        const existing = await readRaw(STORES.IMAGES, imageId);
                        if (!existing) {
                            await writeRaw(STORES.IMAGES, imageId, item.image);
                            if (item.image.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, item.image);
                            recovered++;
                        }
                    } else if (imagePath) {
                        const existing = await readRaw(STORES.IMAGES, imageId);
                        if (!existing) {
                            const restored = await MediaStorageService.downloadMedia(imagePath);
                            if (restored) {
                                await writeRaw(STORES.IMAGES, imageId, restored);
                                if (restored.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, restored);
                                recovered++;
                            }
                        }
                    }

                    // If cloud has storagePath but local metadata doesn't, restore it so
                    // useLiorMedia can serve the image via R2 even when IDB is empty.
                    // Also covers the case where Supabase has no base64 but does have R2 path.
                    const list = DATA_CACHE[cache] as any[];
                    const idx = list.findIndex(i => i.id === item.id);
                    if (idx >= 0) {
                        let metaChanged = false;
                        const updated = { ...list[idx] };

                        if (!updated.imageId && imageId) {
                            updated.imageId = imageId;
                            metaChanged = true;
                        }
                        if (!updated.storagePath && imagePath) {
                            updated.storagePath = imagePath;
                            metaChanged = true;
                            // Warm the RAM cache with the R2 URL immediately
                            const r2Url = await MediaStorageService.getAccessibleUrl(imagePath).catch(() => null);
                            if (r2Url) {
                                MEDIA_MEMORY_CACHE.set(imageId, r2Url);
                            }
                        }
                        if (!updated.videoStoragePath && videoPath) {
                            updated.videoStoragePath = videoPath;
                            metaChanged = true;
                        }
                        if (metaChanged) {
                            list[idx] = updated;
                            const ck = cacheKeyMap[cache];
                            if (ck) await writeRaw(STORES.DATA, ck, list);
                        }
                    }

                    // Recover video if cloud has it
                    if (item.video?.startsWith('data:')) {
                        const existing = await readRaw(STORES.IMAGES, videoId);
                        if (!existing) {
                            await writeRaw(STORES.IMAGES, videoId, item.video);
                            recovered++;
                        }
                    } else if (videoPath) {
                        const existing = await readRaw(STORES.IMAGES, videoId);
                        if (!existing) {
                            const restored = await MediaStorageService.downloadMedia(videoPath);
                            if (restored) {
                                await writeRaw(STORES.IMAGES, videoId, restored);
                                recovered++;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`Image recovery failed for ${table}:`, e);
                failed++;
            }
        }

        // Force UI refresh
        notifyUpdate({ source: 'sync', action: 'save', table: 'recovery', id: 'images' });
        return { recovered, failed };
    },

    /**
     * Get an image-enriched copy of items for cloud push.
     * Re-attaches raw image blobs from IndexedDB to metadata before uploading.
     */
    async _getItemWithImages(item: any, prefix: string): Promise<any> {
        const enriched = { ...item };
        if (item.imageId && !item.storagePath) {
            const img = await readRaw(STORES.IMAGES, item.imageId);
            if (img) enriched.image = img;
        }
        if (item.videoId && !item.videoStoragePath) {
            const vid = await readRaw(STORES.IMAGES, item.videoId);
            if (vid) enriched.video = vid;
        }
        return enriched;
    },

    /**
     * Background: fetch an image from an R2 URL and cache it in IDB so future
     * loads are instant and survive R2 outages / offline usage.
     * Fire-and-forget — never blocks calling code, never throws to the caller.
     */
    async _cacheR2Image(idbKey: string, url: string): Promise<void> {
        if (!idbKey || !url) return;
        // Don't re-download if already cached
        const existing = await readRaw(STORES.IMAGES, idbKey);
        if (existing) return;

        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const blob = await res.blob();
            const base64: string = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            if (!base64 || !base64.startsWith('data:')) return;
            await writeRaw(STORES.IMAGES, idbKey, base64);
            if (base64.length < 2_000_000) MEDIA_MEMORY_CACHE.set(idbKey, base64);
        } catch {
            // Best-effort — next getImage will try R2 again
        }
    }
};
