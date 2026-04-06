import { Memory, Note, SpecialDate, Envelope, UserStatus, DailyPhoto, DinnerOption, CoupleProfile, PetStats, Keepsake, Comment, MoodEntry, StreakData, QuestionEntry, RoomState } from '../types';
import { SupabaseService } from './supabase';
import { MediaStorageService } from './mediaStorage';

// ENSURING WE STAY ON V11 FOR DATA CONTINUITY
const DB_NAME = 'TulikaVault_v11';
const DB_VERSION = 1;
const STORES = {
    DATA: 'metadata_store',
    IMAGES: 'image_vault'
};

const CACHE_KEYS = {
    MEMORIES: 'tulika_memories',
    NOTES: 'tulika_notes',
    DATES: 'tulika_dates',
    ENVELOPES: 'tulika_envelopes',
    DAILY_PHOTOS: 'tulika_daily_photos',
    DINNER_OPTIONS: 'tulika_dinner_options',
    KEEPSAKES: 'tulika_keepsakes',
    COMMENTS: 'tulika_comments',
    SHARED_PROFILE: 'tulika_shared_profile',
    IDENTITY: 'tulika_identity',
    USER_STATUS: 'tulika_status',
    PARTNER_STATUS: 'tulika_partner_status',
    PET_STATS: 'tulika_pet_stats',
    DEVICE_ID: 'tulika_device_id',
    TOGETHER_MUSIC_META: 'tulika_together_music_meta',
    MOOD_ENTRIES: 'tulika_mood_entries',
    PENDING_DELETES: 'tulika_pending_deletes',
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

const sanitizeUserString = (value: string) => (
    value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/</g, '＜')
        .replace(/>/g, '＞')
);

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
                load(CACHE_KEYS.MOOD_ENTRIES, 'moodEntries')
            ]);

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
                restoreLocalBackup(CACHE_KEYS.MOOD_ENTRIES)
            ]);

            // Sync music
            this.syncMusicFromCloud();

            this.isInitialized = true;
            notifyUpdate({ source: 'sync', action: 'save', table: 'init', id: 'all' });
        } catch (e) {
            console.error("Critical storage failure", e);
        }
    },

    async syncMusicFromCloud() {
        if (!SupabaseService.init()) return;
        try {
            const cloudMusic = await SupabaseService.fetchSingle('together_music');
            if (cloudMusic && cloudMusic.music_base64) {
                const localMeta = this.getTogetherMusicMetadata();
                if (!localMeta || cloudMusic.meta.date !== localMeta.date) {
                    await writeRaw(STORES.IMAGES, 'custom_together_music', cloudMusic.music_base64);
                    localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(cloudMusic.meta));
                    await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, cloudMusic.meta);
                }
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
        if (!mediaId && !storagePath) return cloudPayload || null;

        // 1. RAM cache
        const cacheKey = mediaId || storagePath || '';
        if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

        // 2. IndexedDB local cache
        if (mediaId) {
            const local = await readRaw(STORES.IMAGES, mediaId);
            if (local) {
                if (local.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, local);
                return local;
            }
        }

        // 3. Supabase Storage signed URL (private, cross-device)
        if (storagePath) {
            const url = await MediaStorageService.getAccessibleUrl(storagePath);
            if (url) {
                // Don't cache signed URLs in MEDIA_MEMORY_CACHE — they expire
                // The MediaStorageService has its own signed URL cache with expiry tracking
                return url;
            }
        }

        // 4. Legacy fallback: base64 from cloud JSON column
        if (cloudPayload) {
            if (mediaId) {
                await writeRaw(STORES.IMAGES, mediaId, cloudPayload);
            }
            if (cloudPayload.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, cloudPayload);
            return cloudPayload;
        }
        return null;
    },

    async _saveInternal(listKey: keyof typeof DATA_CACHE, storageKey: string, item: any, prefix?: string, table?: string, source: 'user' | 'sync' = 'user') {
        const sanitizedItem = sanitizeUserContent(item);
        const toSaveMetadata = { ...sanitizedItem };
        const rawImage = sanitizedItem.image;
        const rawVideo = sanitizedItem.video;

        if (rawImage && prefix) {
            const imageId = sanitizedItem.imageId || `${prefix}_${sanitizedItem.id}`;
            await writeRaw(STORES.IMAGES, imageId, rawImage);
            if (rawImage.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, rawImage);
            toSaveMetadata.imageId = imageId;
            delete toSaveMetadata.image;
        }

        if (rawVideo && prefix) {
            const videoId = sanitizedItem.videoId || `${prefix}_vid_${sanitizedItem.id}`;
            await writeRaw(STORES.IMAGES, videoId, rawVideo);
            toSaveMetadata.videoId = videoId;
            delete toSaveMetadata.video;
        }

        // Preserve existing storagePaths and IDs from previous saves
        const list = [...(DATA_CACHE[listKey] as any[])];
        const idx = list.findIndex(i => i.id === item.id);
        if (idx >= 0) {
            if (!toSaveMetadata.imageId && list[idx].imageId) toSaveMetadata.imageId = list[idx].imageId;
            if (!toSaveMetadata.videoId && list[idx].videoId) toSaveMetadata.videoId = list[idx].videoId;
            if (!toSaveMetadata.storagePath && list[idx].storagePath) toSaveMetadata.storagePath = list[idx].storagePath;
            if (!toSaveMetadata.videoStoragePath && list[idx].videoStoragePath) toSaveMetadata.videoStoragePath = list[idx].videoStoragePath;
            list[idx] = toSaveMetadata;
        } else {
            list.unshift(toSaveMetadata);
        }

        (DATA_CACHE[listKey] as any) = list;
        await writeRaw(STORES.DATA, storageKey, list);

        if (table) {
            notifyUpdate({ source, action: 'save', table, id: sanitizedItem.id, item: { ...toSaveMetadata, image: rawImage, video: rawVideo } });
        }

        // Background: Upload to Supabase Storage (non-blocking, fire-and-forget)
        if (prefix && source === 'user') {
            this._uploadToStorage(listKey, storageKey, toSaveMetadata, prefix, rawImage, rawVideo);
        }
    },

    async _uploadToStorage(listKey: keyof typeof DATA_CACHE, storageKey: string, metadata: any, prefix: string, rawImage?: string, rawVideo?: string) {
        try {
            let updated = false;

            if (rawImage && !metadata.storagePath) {
                const path = await MediaStorageService.buildPath(prefix, metadata.id, 'image');
                const result = await MediaStorageService.uploadMedia(rawImage, path);
                if (result) {
                    metadata.storagePath = result;
                    updated = true;
                }
            }

            if (rawVideo && !metadata.videoStoragePath) {
                const path = await MediaStorageService.buildPath(prefix, metadata.id, 'video');
                const result = await MediaStorageService.uploadMedia(rawVideo, path);
                if (result) {
                    metadata.videoStoragePath = result;
                    updated = true;
                }
            }

            // Persist updated storagePath back to cache and IndexedDB
            if (updated) {
                const list = DATA_CACHE[listKey] as any[];
                const idx = list.findIndex(i => i.id === metadata.id);
                if (idx >= 0) {
                    list[idx] = { ...list[idx], storagePath: metadata.storagePath, videoStoragePath: metadata.videoStoragePath };
                    await writeRaw(STORES.DATA, storageKey, list);
                }
            }
        } catch (e) {
            console.warn('Background storage upload failed:', e);
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

    getDailyPhotos: () => DATA_CACHE.dailyPhotos,
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
            // Memory Leak Fix: Actually delete the blobs from IndexedDB
            for (const item of expired) {
                if (item.imageId) {
                    await deleteRaw(STORES.IMAGES, item.imageId);
                    MEDIA_MEMORY_CACHE.delete(item.imageId);
                }
                if (item.videoId) {
                    await deleteRaw(STORES.IMAGES, item.videoId);
                }
            }

            // Keep only valid photos
            const valid = DATA_CACHE.dailyPhotos.filter(p => new Date(p.expiresAt) > now);
            DATA_CACHE.dailyPhotos = valid;
            await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, valid);
            notifyUpdate({ source: 'sync', action: 'save', table: 'daily_photos', id: 'cleanup' });
        }
    },

    getKeepsakes: () => DATA_CACHE.keepsakes,
    saveKeepsake: (k: Keepsake) => StorageService._saveInternal('keepsakes', CACHE_KEYS.KEEPSAKES, k, 'keep', 'keepsakes'),
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
        const item = data.data || data;
        if (!item || !item.id) return;

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
            mood_entries: { cache: 'moodEntries', key: CACHE_KEYS.MOOD_ENTRIES }
        };

        if (tableMap[table]) {
            const config = tableMap[table];
            const list = DATA_CACHE[config.cache] as any[];
            const isNew = !list.find(i => i.id === item.id);
            
            await this._saveInternal(config.cache, config.key, item, config.prefix, undefined, 'sync');

            // Send push notification if app is in background and item is new
            if (isNew && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                let msg = '';
                if (table === 'memories') msg = 'A new memory was added to your vault!';
                else if (table === 'notes') msg = 'Your partner left you a note 💌';
                else if (table === 'daily_photos') msg = 'A new Daily Photo was shared 📸';
                else if (table === 'keepsakes') msg = 'A new keepsake arrived in your box 🎁';
                else if (table === 'comments') msg = 'Your partner commented on something 💬';
                
                if (msg) new Notification('Tulika', { body: msg, icon: '/icon.svg' });
            }
        } else if (table === 'couple_profile') {
            const local = this.getCoupleProfile();
            if (item.anniversaryDate) {
                // Only merge if the cloud date is valid
                this.saveCoupleProfile({ ...local, ...item }, 'sync');
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
            if (item.music_base64) {
                await writeRaw(STORES.IMAGES, 'custom_together_music', item.music_base64);
                if (item.meta) {
                    localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(item.meta));
                    writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, item.meta);
                }
                notifyUpdate({ source: 'sync', action: 'save', table, id: 'singleton' });
            }
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
            comments: { cache: 'comments', key: CACHE_KEYS.COMMENTS }
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
            await deleteRaw(STORES.IMAGES, 'custom_together_music');
            await deleteRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META);
            localStorage.removeItem(CACHE_KEYS.TOGETHER_MUSIC_META);
            notifyUpdate({ source: 'sync', action: 'delete', table, id });
        }
    },

    saveTogetherMusic: async (file: File) => {
        if (file.size > 10 * 1024 * 1024) throw new Error("File too large. Max size is 10MB.");
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                try {
                    await writeRaw(STORES.IMAGES, 'custom_together_music', base64);
                    const meta = { name: file.name, date: new Date().toISOString(), size: file.size };
                    localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(meta));
                    await writeRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META, meta);

                    if (SupabaseService.init()) {
                        await SupabaseService.saveSingle('together_music', { music_base64: base64, meta });
                    }
                    notifyUpdate({ source: 'user', action: 'save', table: 'together_music', id: 'singleton', item: { music_base64: base64, meta } });
                    resolve();
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    getTogetherMusic: async (): Promise<string | null> => readRaw(STORES.IMAGES, 'custom_together_music'),
    getTogetherMusicMetadata: (): { name: string, date: string, size: number } | null => {
        const str = localStorage.getItem(CACHE_KEYS.TOGETHER_MUSIC_META);
        return str ? JSON.parse(str) : null;
    },

    deleteTogetherMusic: async () => {
        await deleteRaw(STORES.IMAGES, 'custom_together_music');
        await deleteRaw(STORES.DATA, CACHE_KEYS.TOGETHER_MUSIC_META);
        localStorage.removeItem(CACHE_KEYS.TOGETHER_MUSIC_META);
        if (SupabaseService.init()) await SupabaseService.deleteItem('together_music', 'singleton');
        notifyUpdate({ source: 'user', action: 'delete', table: 'together_music', id: 'singleton' });
    },

    getCoupleProfile: (): CoupleProfile => {
        const idStr = localStorage.getItem(CACHE_KEYS.IDENTITY);
        const sharedStr = localStorage.getItem(CACHE_KEYS.SHARED_PROFILE);

        const id = idStr ? JSON.parse(idStr) : { myName: 'Ishan', partnerName: 'Tulika' };

        // HARD-BUILD: Anniversary Date is 29 August 2023
        const HARD_CODED_ANNIVERSARY = '2023-08-29T00:00:00.000Z';

        const shared = sharedStr ? JSON.parse(sharedStr) : { anniversaryDate: HARD_CODED_ANNIVERSARY, theme: 'rose' };

        // Final sanity check: if the anniversary somehow got mangled to something else, reset it to the hard-coded date
        if (!shared.anniversaryDate || shared.anniversaryDate === '2024-01-01T00:00:00.000Z' || shared.anniversaryDate.includes('1970')) {
            shared.anniversaryDate = HARD_CODED_ANNIVERSARY;
        }

        return { ...id, ...shared };
    },

    saveCoupleProfile: (p: CoupleProfile, source: 'user' | 'sync' = 'user') => {
        const sanitizedProfile = sanitizeUserContent(p);
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
        try {
            const raw = localStorage.getItem('tulika_room_state');
            return raw ? JSON.parse(raw) : { furniture: [], coins: 500 };
        } catch { return { furniture: [], coins: 500 }; }
    },

    saveRoomState: (state: RoomState): void => {
        localStorage.setItem('tulika_room_state', JSON.stringify(state));
    },

    async exportAllData() {
        const [memories, dailyPhotos, keepsakes, togetherMusic] = await Promise.all([
            Promise.all(DATA_CACHE.memories.map((item) => this._getItemWithImages(item, 'mem'))),
            Promise.all(DATA_CACHE.dailyPhotos.map((item) => this._getItemWithImages(item, 'daily'))),
            Promise.all(DATA_CACHE.keepsakes.map((item) => this._getItemWithImages(item, 'keep'))),
            this.getTogetherMusic()
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
            await writeRaw(STORES.IMAGES, 'custom_together_music', data.togetherMusic.base64);
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
        ];

        for (const { table, cache, prefix } of mediaTables) {
            try {
                const cloudItems = await SupabaseService.fetchAll(table);
                if (!cloudItems) continue;

                for (const raw of cloudItems) {
                    const item = raw?.data || raw;
                    if (!item?.id) continue;

                    const imageId = item.imageId || `${prefix}_${item.id}`;
                    const videoId = item.videoId || `${prefix}_vid_${item.id}`;

                    // Recover image if cloud has it and local doesn't
                    if (item.image) {
                        const existing = await readRaw(STORES.IMAGES, imageId);
                        if (!existing) {
                            await writeRaw(STORES.IMAGES, imageId, item.image);
                            if (item.image.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, item.image);
                            recovered++;
                        }

                        // Ensure metadata has imageId reference
                        const list = DATA_CACHE[cache] as any[];
                        const idx = list.findIndex(i => i.id === item.id);
                        if (idx >= 0 && !list[idx].imageId) {
                            list[idx] = { ...list[idx], imageId };
                            await writeRaw(STORES.DATA, CACHE_KEYS[cache === 'memories' ? 'MEMORIES' : cache === 'dailyPhotos' ? 'DAILY_PHOTOS' : 'KEEPSAKES'], list);
                        }
                    }

                    // Recover video if cloud has it
                    if (item.video) {
                        const existing = await readRaw(STORES.IMAGES, videoId);
                        if (!existing) {
                            await writeRaw(STORES.IMAGES, videoId, item.video);
                            recovered++;
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
        if (item.imageId) {
            const img = await readRaw(STORES.IMAGES, item.imageId);
            if (img) enriched.image = img;
        }
        if (item.videoId) {
            const vid = await readRaw(STORES.IMAGES, item.videoId);
            if (vid) enriched.video = vid;
        }
        return enriched;
    }
};
