import { Memory, Note, SpecialDate, Envelope, UserStatus, DailyPhoto, DinnerOption, CoupleProfile, PetStats, Keepsake, Comment, MoodEntry } from '../types';
import { SupabaseService } from './supabase';

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
    MOOD_ENTRIES: 'tulika_mood_entries'
};

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
                load(CACHE_KEYS.COMMENTS, 'comments')
            ]);

            // RECOVERY: If localStorage is empty but IndexedDB has profile/pet, restore it
            const profileBackup = await readRaw(STORES.DATA, CACHE_KEYS.SHARED_PROFILE);
            if (profileBackup && !localStorage.getItem(CACHE_KEYS.SHARED_PROFILE)) {
                localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify(profileBackup));
            }

            const petBackup = await readRaw(STORES.DATA, CACHE_KEYS.PET_STATS);
            if (petBackup && !localStorage.getItem(CACHE_KEYS.PET_STATS)) {
                localStorage.setItem(CACHE_KEYS.PET_STATS, JSON.stringify(petBackup));
            }

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

    async getImage(mediaId: string, cloudPayload?: string): Promise<string | null> {
        if (!mediaId) return cloudPayload || null;
        if (MEDIA_MEMORY_CACHE.has(mediaId)) return MEDIA_MEMORY_CACHE.get(mediaId)!;
        const local = await readRaw(STORES.IMAGES, mediaId);
        if (local) {
            if (local.length < 2_000_000) MEDIA_MEMORY_CACHE.set(mediaId, local);
            return local;
        }
        if (cloudPayload) {
            await writeRaw(STORES.IMAGES, mediaId, cloudPayload);
            if (cloudPayload.length < 2_000_000) MEDIA_MEMORY_CACHE.set(mediaId, cloudPayload);
            return cloudPayload;
        }
        return null;
    },

    async _saveInternal(listKey: keyof typeof DATA_CACHE, storageKey: string, item: any, prefix?: string, table?: string, source: 'user' | 'sync' = 'user') {
        const toSaveMetadata = { ...item };
        const rawImage = item.image;
        const rawVideo = item.video;

        if (rawImage && prefix) {
            const imageId = item.imageId || `${prefix}_${item.id}`;
            await writeRaw(STORES.IMAGES, imageId, rawImage);
            MEDIA_MEMORY_CACHE.set(imageId, rawImage);
            toSaveMetadata.imageId = imageId;
            delete toSaveMetadata.image;
        }

        if (rawVideo && prefix) {
            const videoId = item.videoId || `${prefix}_vid_${item.id}`;
            await writeRaw(STORES.IMAGES, videoId, rawVideo);
            toSaveMetadata.videoId = videoId;
            delete toSaveMetadata.video;
        }

        const list = [...(DATA_CACHE[listKey] as any[])];
        const idx = list.findIndex(i => i.id === item.id);
        if (idx >= 0) {
            if (!toSaveMetadata.imageId && list[idx].imageId) toSaveMetadata.imageId = list[idx].imageId;
            if (!toSaveMetadata.videoId && list[idx].videoId) toSaveMetadata.videoId = list[idx].videoId;
            list[idx] = toSaveMetadata;
        } else {
            list.unshift(toSaveMetadata);
        }

        (DATA_CACHE[listKey] as any) = list;
        await writeRaw(STORES.DATA, storageKey, list);

        if (table) {
            notifyUpdate({ source, action: 'save', table, id: item.id, item: { ...toSaveMetadata, image: rawImage, video: rawVideo } });
        }
    },

    getMemories: () => DATA_CACHE.memories,
    saveMemory: (m: Memory) => StorageService._saveInternal('memories', CACHE_KEYS.MEMORIES, m, 'mem', 'memories'),
    deleteMemory: async (id: string) => {
        const item = DATA_CACHE.memories.find(m => m.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        DATA_CACHE.memories = DATA_CACHE.memories.filter(m => m.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.MEMORIES, DATA_CACHE.memories);
        notifyUpdate({ source: 'user', action: 'delete', table: 'memories', id });
    },

    getDailyPhotos: () => DATA_CACHE.dailyPhotos,
    saveDailyPhoto: (p: DailyPhoto) => StorageService._saveInternal('dailyPhotos', CACHE_KEYS.DAILY_PHOTOS, p, 'daily', 'daily_photos'),
    deleteDailyPhoto: async (id: string) => {
        const item = DATA_CACHE.dailyPhotos.find(p => p.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        DATA_CACHE.dailyPhotos = DATA_CACHE.dailyPhotos.filter(p => p.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, DATA_CACHE.dailyPhotos);
        notifyUpdate({ source: 'user', action: 'delete', table: 'daily_photos', id });
    },

    async cleanupDailyPhotos() {
        const now = new Date();
        const valid = DATA_CACHE.dailyPhotos.filter(p => new Date(p.expiresAt) > now);
        if (valid.length !== DATA_CACHE.dailyPhotos.length) {
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
        DATA_CACHE.notes = DATA_CACHE.notes.filter(n => n.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.NOTES, DATA_CACHE.notes);
        notifyUpdate({ source: 'user', action: 'delete', table: 'notes', id });
    },

    getSpecialDates: () => DATA_CACHE.specialDates,
    saveSpecialDate: (d: SpecialDate) => StorageService._saveInternal('specialDates', CACHE_KEYS.DATES, d, undefined, 'dates'),
    deleteSpecialDate: async (id: string) => {
        DATA_CACHE.specialDates = DATA_CACHE.specialDates.filter(d => d.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.DATES, DATA_CACHE.specialDates);
        notifyUpdate({ source: 'user', action: 'delete', table: 'dates', id });
    },

    getEnvelopes: () => DATA_CACHE.envelopes,
    saveEnvelope: (e: Envelope) => StorageService._saveInternal('envelopes', CACHE_KEYS.ENVELOPES, e, undefined, 'envelopes'),
    deleteEnvelope: async (id: string) => {
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
        const list = [...DATA_CACHE.comments];
        const idx = list.findIndex(i => i.id === c.id);
        if (idx >= 0) list[idx] = c;
        else list.push(c);
        DATA_CACHE.comments = list;
        await writeRaw(STORES.DATA, CACHE_KEYS.COMMENTS, list);
        notifyUpdate({ source: 'user', action: 'save', table: 'comments', id: c.id, item: c });
    },
    deleteComment: async (id: string) => {
        DATA_CACHE.comments = DATA_CACHE.comments.filter(c => c.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.COMMENTS, DATA_CACHE.comments);
        notifyUpdate({ source: 'user', action: 'delete', table: 'comments', id });
    },

    async handleCloudUpdate(table: string, data: any) {
        const item = data.data || data;
        if (!item || !item.id) return;

        const tableMap: Record<string, { cache: keyof typeof DATA_CACHE, key: string, prefix?: string }> = {
            memories: { cache: 'memories', key: CACHE_KEYS.MEMORIES, prefix: 'mem' },
            notes: { cache: 'notes', key: CACHE_KEYS.NOTES },
            dates: { cache: 'specialDates', key: CACHE_KEYS.DATES },
            envelopes: { cache: 'envelopes', key: CACHE_KEYS.ENVELOPES },
            daily_photos: { cache: 'dailyPhotos', key: CACHE_KEYS.DAILY_PHOTOS, prefix: 'daily' },
            keepsakes: { cache: 'keepsakes', key: CACHE_KEYS.KEEPSAKES, prefix: 'keep' },
            dinner_options: { cache: 'dinnerOptions', key: CACHE_KEYS.DINNER_OPTIONS },
            comments: { cache: 'comments', key: CACHE_KEYS.COMMENTS }
        };

        if (tableMap[table]) {
            const config = tableMap[table];
            await this._saveInternal(config.cache, config.key, item, config.prefix, undefined, 'sync');
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
                notifyUpdate({ source: 'sync', action: 'save', table, id: item.id });
            }
        } else if (table === 'together_music') {
            if (item.music_base64) {
                await writeRaw(STORES.IMAGES, 'custom_together_music', item.music_base64);
                if (item.meta) localStorage.setItem(CACHE_KEYS.TOGETHER_MUSIC_META, JSON.stringify(item.meta));
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
            DATA_CACHE[cfg.cache] = list.filter(i => i.id !== id);
            await writeRaw(STORES.DATA, cfg.key, DATA_CACHE[cfg.cache]);
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
        localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify({ myName: p.myName, partnerName: p.partnerName }));
        localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify({ anniversaryDate: p.anniversaryDate, theme: p.theme, photo: p.photo }));

        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.SHARED_PROFILE, { anniversaryDate: p.anniversaryDate, theme: p.theme, photo: p.photo });

        notifyUpdate({ source: 'user', action: 'save', table: 'couple_profile', id: 'singleton', item: p });
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
        return str ? JSON.parse(str) : { name: 'Coco', type: 'bear', lastFed: '1970-01-01T00:00:00.000Z', lastPetted: '1970-01-01T00:00:00.000Z', happiness: 50 };
    },

    savePetStats: (s: PetStats, source: 'user' | 'sync' = 'user') => {
        localStorage.setItem(CACHE_KEYS.PET_STATS, JSON.stringify(s));
        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.PET_STATS, s);
        notifyUpdate({ source, action: 'save', table: 'pet_stats', id: 'singleton', item: s });
    },

    getStatus: (): UserStatus => JSON.parse(localStorage.getItem(CACHE_KEYS.USER_STATUS) || '{"state":"awake","timestamp":"' + new Date().toISOString() + '"}'),
    saveStatus: (s: UserStatus) => {
        localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(s));
        const profile = StorageService.getCoupleProfile();
        notifyUpdate({ source: 'user', action: 'save', table: 'user_status', id: profile.myName, item: { id: profile.myName, ...s } });
    },
    getPartnerStatus: (): UserStatus => JSON.parse(localStorage.getItem(CACHE_KEYS.PARTNER_STATUS) || '{"state":"awake","timestamp":""}'),

    async exportAllData() {
        return {
            memories: DATA_CACHE.memories,
            notes: DATA_CACHE.notes,
            dates: DATA_CACHE.specialDates,
            envelopes: DATA_CACHE.envelopes,
            dailyPhotos: DATA_CACHE.dailyPhotos,
            dinnerOptions: DATA_CACHE.dinnerOptions,
            keepsakes: DATA_CACHE.keepsakes,
            profile: this.getCoupleProfile(),
            pet: this.getPetStats()
        };
    },

    async importData(data: any) {
        if (!data) return false;
        if (data.profile) this.saveCoupleProfile(data.profile);
        if (data.pet) this.savePetStats(data.pet);
        return true;
    },

    async getStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
        return null;
    }
};