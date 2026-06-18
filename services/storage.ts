import { Memory, Note, SpecialDate, Envelope, UserStatus, DailyPhoto, DinnerOption, CoupleProfile, PetStats, Keepsake, Comment, MoodEntry, StreakData, QuestionEntry, RoomState, UsBucketItem, UsWishlistItem, UsMilestone, CoupleRoomState, TimeCapsule, Surprise, VoiceNote, PrivateSpaceItem } from '../types';
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
import { STORES } from './storage/dbConfig';
import {
    migrateLegacyIndexedDB,
    migrateLegacyLocalStorage,
    readFromLegacyVault,
} from './storage/legacyMigration';
import {
    addPendingDelete,
    addPendingUpload,
    getPendingDeletes,
    getPendingUploads,
    isDeletedLocally,
    removePendingDelete,
    removePendingUpload,
    type PendingDelete,
    type PendingUpload,
} from './storage/pendingOperations';
import { createPersonalCollectionsStorageDomain } from './storage/personalCollections';
import { deleteRaw, getDB, readRaw, writeRaw } from './storage/rawStore';
import { createUsCollectionsStorageDomain } from './storage/usCollections';
export { addPendingDelete, getPendingDeletes, isDeletedLocally, removePendingDelete } from './storage/pendingOperations';

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

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
    LINK_LOCK: 'lior_link_lock',
    SEEN_RELEASE_VERSION: 'lior_seen_version',
    COACHMARKS_SEEN: 'lior_coachmarks_seen',
    USER_STATUS: 'lior_status',
    PARTNER_STATUS: 'lior_partner_status',
    PET_STATS: 'lior_pet_stats',
    DEVICE_ID: 'lior_device_id',
    TOGETHER_MUSIC_META: 'lior_together_music_meta',
    MOOD_ENTRIES: 'lior_mood_entries',
    OUR_ROOM_STATE: 'lior_room_state_v2',
    US_BUCKET_ITEMS: 'lior_us_bucket_items',
    US_WISHLIST_ITEMS: 'lior_us_wishlist_items',
    US_MILESTONES: 'lior_us_milestones',
    TIME_CAPSULES: 'lior_time_capsules',
    SURPRISES: 'lior_surprises',
    VOICE_NOTES: 'lior_voice_notes',
    PRIVATE_SPACE_ITEMS: 'lior_private_space_items',
};

const ACCOUNT_LOCAL_KEYS = {
    ONBOARDING_COMPLETE: 'lior_onboarded',
    MANUAL_OVERRIDE: 'lior_manual_override',
    ACTIVE_USER_ID: 'lior_active_user_id',
} as const;

const EMPTY_IDENTITY = { myName: '', partnerName: '' };
const EMPTY_SHARED_PROFILE = { anniversaryDate: '', theme: 'rose' };

type LockedPairLink = {
    coupleId: string;
    partnerUserId: string;
    partnerName?: string;
};

const getActiveAccountScopeUserId = () => (
    SupabaseService.getCachedUserId()
    || localStorage.getItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID)
    || null
);

const buildAccountScopedStorageKey = (baseKey: string, userId: string | null = getActiveAccountScopeUserId()) => {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    return normalizedUserId ? `${baseKey}::${normalizedUserId}` : baseKey;
};

const getAccountScopedLocalStorageValue = (baseKey: string): string | null => {
    const scopedKey = buildAccountScopedStorageKey(baseKey);
    const scopedValue = localStorage.getItem(scopedKey);
    if (scopedValue !== null) {
        return scopedValue;
    }

    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue !== null && scopedKey !== baseKey) {
        localStorage.setItem(scopedKey, legacyValue);
        localStorage.removeItem(baseKey);
        return legacyValue;
    }

    return legacyValue;
};

const setAccountScopedLocalStorageValue = (baseKey: string, value: string) => {
    const scopedKey = buildAccountScopedStorageKey(baseKey);
    localStorage.setItem(scopedKey, value);
    if (scopedKey !== baseKey) {
        localStorage.removeItem(baseKey);
    }
};

const clearAccountScopedLocalStorageValue = (baseKey: string) => {
    const scopedKey = buildAccountScopedStorageKey(baseKey);
    localStorage.removeItem(scopedKey);
    if (scopedKey !== baseKey) {
        localStorage.removeItem(baseKey);
    }
};

const persistScopedLocalStorageValue = (baseKey: string, value: string, userId: string | null) => {
    const scopedKey = buildAccountScopedStorageKey(baseKey, userId);
    if (scopedKey === baseKey) return;
    localStorage.setItem(scopedKey, value);
};

const serializeLocalBackupValue = (value: unknown) => (
    typeof value === 'string' ? value : JSON.stringify(value)
);

const parseLocalBackupValue = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

const readLocalStorageJson = <T,>(key: string): T | null => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const persistScopedLocalStorageJson = (baseKey: string, value: unknown, userId: string | null = getActiveAccountScopeUserId()) => {
    const scopedKey = buildAccountScopedStorageKey(baseKey, userId);
    if (scopedKey === baseKey) return;
    localStorage.setItem(scopedKey, JSON.stringify(value));
};

const hasMeaningfulIdentity = (identity: Record<string, unknown> | null): boolean => (
    Boolean(cleanString(identity?.myName) || cleanString(identity?.partnerName))
);

const hasMeaningfulSharedProfile = (shared: Record<string, unknown> | null): boolean => {
    if (!shared) return false;
    return Object.entries(shared).some(([key, value]) => {
        if (key === 'theme') return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return value != null;
    });
};

const backupAccountScopedFlagsForAccount = (userId: string | null) => {
    if (!userId) return;
    [
        ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE,
        ACCOUNT_LOCAL_KEYS.MANUAL_OVERRIDE,
        CACHE_KEYS.LINK_LOCK,
        CACHE_KEYS.SEEN_RELEASE_VERSION,
        CACHE_KEYS.COACHMARKS_SEEN,
    ].forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw !== null) persistScopedLocalStorageValue(key, raw, userId);
    });
};

const restoreAccountScopedFlagsForAccount = (userId: string | null) => {
    if (!userId) return;
    [
        ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE,
        ACCOUNT_LOCAL_KEYS.MANUAL_OVERRIDE,
        CACHE_KEYS.LINK_LOCK,
        CACHE_KEYS.SEEN_RELEASE_VERSION,
        CACHE_KEYS.COACHMARKS_SEEN,
    ].forEach((key) => {
        const scopedKey = buildAccountScopedStorageKey(key, userId);
        const scopedValue = localStorage.getItem(scopedKey);
        if (scopedValue !== null) {
            // Scoped owns the truth — mirror to base for legacy readers.
            localStorage.setItem(key, scopedValue);
            return;
        }
        // No scoped backup yet for this user. If base holds a value
        // (e.g. it was written before the userId became available, or it
        // survived from a prior session), promote it INTO the scoped key
        // so future activations restore it cleanly. Do NOT wipe base —
        // that's what re-triggered onboarding / coachmarks / What's New
        // on every fresh login.
        const baseValue = localStorage.getItem(key);
        if (baseValue !== null) {
            localStorage.setItem(scopedKey, baseValue);
        }
    });
};

const restoreAccountScopedProfile = (userId: string) => {
    const identityKey = buildAccountScopedStorageKey(CACHE_KEYS.IDENTITY, userId);
    const sharedKey = buildAccountScopedStorageKey(CACHE_KEYS.SHARED_PROFILE, userId);
    const scopedIdentity = readLocalStorageJson<Record<string, unknown>>(identityKey);
    const scopedShared = readLocalStorageJson<Record<string, unknown>>(sharedKey);
    const hasScopedProfile = Boolean(scopedIdentity || scopedShared);

    if (!hasScopedProfile) return false;

    localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify(scopedIdentity ?? EMPTY_IDENTITY));
    localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify(applyLockedPairLink(scopedShared ?? EMPTY_SHARED_PROFILE)));
    return true;
};

const backupCurrentProfileForAccount = (userId: string | null) => {
    if (!userId) return;
    const identity = readLocalStorageJson<Record<string, unknown>>(CACHE_KEYS.IDENTITY);
    const shared = readLocalStorageJson<Record<string, unknown>>(CACHE_KEYS.SHARED_PROFILE);
    if (hasMeaningfulIdentity(identity)) persistScopedLocalStorageJson(CACHE_KEYS.IDENTITY, identity, userId);
    if (hasMeaningfulSharedProfile(shared)) persistScopedLocalStorageJson(CACHE_KEYS.SHARED_PROFILE, shared, userId);
    backupAccountScopedFlagsForAccount(userId);
};

const clearBaseProfileForAccountSwitch = () => {
    localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify(EMPTY_IDENTITY));
    localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify(EMPTY_SHARED_PROFILE));
    localStorage.removeItem(CACHE_KEYS.LINK_LOCK);
    localStorage.removeItem(ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE);
    localStorage.removeItem(ACCOUNT_LOCAL_KEYS.MANUAL_OVERRIDE);
    localStorage.removeItem(CACHE_KEYS.SEEN_RELEASE_VERSION);
    localStorage.removeItem(CACHE_KEYS.COACHMARKS_SEEN);
};

const cleanString = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const isGenericPartnerName = (value: unknown): boolean => {
    const normalized = cleanString(value).toLowerCase();
    return normalized === 'partner' || normalized === 'your partner';
};

const cleanPartnerDisplayName = (value: unknown): string => {
    const cleaned = cleanString(value);
    return cleaned && !isGenericPartnerName(cleaned) ? cleaned : '';
};

const PET_TYPE_VALUES = new Set(['dog', 'cat', 'bunny', 'bear']);
const DEFAULT_PET_STATS: PetStats = {
    name: 'Coco',
    type: 'bear',
    lastFed: '1970-01-01T00:00:00.000Z',
    lastPetted: '1970-01-01T00:00:00.000Z',
    happiness: 50,
    xp: 0,
    careStreak: 0,
    presenceStreak: 0,
    bondMoments: 0,
    coins: 0,
    inventory: [],
    equipped: {},
};

const numberInRange = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const next = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, Math.round(next)));
};

const normalizePetEquipment = (value: unknown): PetStats['equipped'] => {
    const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
        hat: cleanString(input.hat) || undefined,
        accessory: cleanString(input.accessory) || undefined,
        environment: cleanString(input.environment) || undefined,
    };
};

const normalizePetStats = (value: unknown): PetStats => {
    const input = value && typeof value === 'object' ? value as Partial<PetStats> & Record<string, unknown> : {};
    const type = PET_TYPE_VALUES.has(String(input.type))
        ? String(input.type) as PetStats['type']
        : DEFAULT_PET_STATS.type;

    return {
        ...DEFAULT_PET_STATS,
        ...input,
        name: cleanString(input.name) || DEFAULT_PET_STATS.name,
        type,
        lastFed: cleanString(input.lastFed) || DEFAULT_PET_STATS.lastFed,
        lastPetted: cleanString(input.lastPetted) || DEFAULT_PET_STATS.lastPetted,
        happiness: numberInRange(input.happiness, DEFAULT_PET_STATS.happiness, 0, 100),
        xp: numberInRange(input.xp, DEFAULT_PET_STATS.xp),
        careStreak: numberInRange(input.careStreak, DEFAULT_PET_STATS.careStreak),
        presenceStreak: numberInRange(input.presenceStreak, DEFAULT_PET_STATS.presenceStreak),
        bondMoments: numberInRange(input.bondMoments, DEFAULT_PET_STATS.bondMoments),
        coins: numberInRange(input.coins, DEFAULT_PET_STATS.coins),
        inventory: Array.isArray(input.inventory) ? input.inventory.map(cleanString).filter(Boolean) : [],
        equipped: normalizePetEquipment(input.equipped),
    };
};

const getLockedPairLink = (): LockedPairLink | null => {
    const raw = getAccountScopedLocalStorageValue(CACHE_KEYS.LINK_LOCK);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<LockedPairLink>;
        const coupleId = cleanString(parsed.coupleId);
        const partnerUserId = cleanString(parsed.partnerUserId);
        if (!coupleId || !partnerUserId) return null;
        return {
            coupleId,
            partnerUserId,
            partnerName: cleanPartnerDisplayName(parsed.partnerName) || undefined,
        };
    } catch {
        return null;
    }
};

const persistLockedPairLink = (profile: Partial<CoupleProfile>) => {
    const coupleId = cleanString(profile.coupleId);
    const partnerUserId = cleanString(profile.partnerUserId);
    if (!coupleId || !partnerUserId) return;

    const lock: LockedPairLink = {
        coupleId,
        partnerUserId,
        partnerName: cleanPartnerDisplayName(profile.partnerName) || undefined,
    };
    setAccountScopedLocalStorageValue(CACHE_KEYS.LINK_LOCK, JSON.stringify(lock));
};

// ── getCoupleProfile content-keyed micro-cache ──────────────────────────────
// getCoupleProfile() is called dozens of times per render pass across the app
// AND internally by many storage methods. The unmemoized version re-ran three
// localStorage reads + three JSON.parse + identity normalization + locked-pair
// merge on EVERY call. The cache key is the exact source strings, so it is
// fully self-invalidating (any write changes a string → cache miss → recompute)
// with zero staleness risk. We hand back a shallow clone so callers that
// reassign a top-level field don't corrupt the cached object.
let _profileCacheKey: string | null = null;
let _profileCacheVal: CoupleProfile | null = null;

const applyLockedPairLink = <T extends Partial<CoupleProfile>>(profile: T, current?: Partial<CoupleProfile>): T => {
    const existingLock = getLockedPairLink();
    const currentCoupleId = cleanString(current?.coupleId);
    const currentPartnerUserId = cleanString(current?.partnerUserId);
    const activeLock = existingLock
        ?? (currentCoupleId && currentPartnerUserId
            ? {
                coupleId: currentCoupleId,
                partnerUserId: currentPartnerUserId,
                partnerName: cleanString(current?.partnerName) || undefined,
            }
            : null);

    if (!activeLock) return profile;

    const incomingCoupleId = cleanString(profile.coupleId);
    const incomingPartnerUserId = cleanString(profile.partnerUserId);
    const incomingHasCompleteLink = incomingCoupleId && incomingPartnerUserId;
    const sameLockedPair = incomingCoupleId === activeLock.coupleId && incomingPartnerUserId === activeLock.partnerUserId;

    if (incomingHasCompleteLink && !sameLockedPair) {
        console.warn('[pairing] Ignoring attempted partner relink; existing pair lock is preserved.');
    }

    return {
        ...profile,
        coupleId: activeLock.coupleId,
        partnerUserId: activeLock.partnerUserId,
        partnerName: cleanPartnerDisplayName(profile.partnerName) || activeLock.partnerName || profile.partnerName,
    };
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
    usBucketItems: [] as UsBucketItem[],
    usWishlistItems: [] as UsWishlistItem[],
    usMilestones: [] as UsMilestone[],
    timeCapsules: [] as TimeCapsule[],
    surprises: [] as Surprise[],
    voiceNotes: [] as VoiceNote[],
    privateSpaceItems: [] as PrivateSpaceItem[],
};

const DEFAULT_ENVELOPE_COLOR = 'bg-pink-500/12 text-pink-600';

const normalizeEnvelopeColor = (value: unknown): string =>
    typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ENVELOPE_COLOR;

const normalizeEnvelope = (value: Envelope | Partial<Envelope>): Envelope => ({
    ...(value as Envelope),
    color: normalizeEnvelopeColor(value?.color),
});

const normalizeEnvelopeList = (items: Envelope[] | Partial<Envelope>[]): Envelope[] =>
    items.map((item) => normalizeEnvelope(item));

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
const CONTENT_COLLECTION_STORES: Array<{ storageKey: string; cacheKey: keyof typeof DATA_CACHE }> = [
    { storageKey: CACHE_KEYS.MEMORIES, cacheKey: 'memories' },
    { storageKey: CACHE_KEYS.NOTES, cacheKey: 'notes' },
    { storageKey: CACHE_KEYS.DATES, cacheKey: 'specialDates' },
    { storageKey: CACHE_KEYS.ENVELOPES, cacheKey: 'envelopes' },
    { storageKey: CACHE_KEYS.DAILY_PHOTOS, cacheKey: 'dailyPhotos' },
    { storageKey: CACHE_KEYS.DINNER_OPTIONS, cacheKey: 'dinnerOptions' },
    { storageKey: CACHE_KEYS.KEEPSAKES, cacheKey: 'keepsakes' },
    { storageKey: CACHE_KEYS.COMMENTS, cacheKey: 'comments' },
    { storageKey: CACHE_KEYS.MOOD_ENTRIES, cacheKey: 'moodEntries' },
    { storageKey: CACHE_KEYS.US_BUCKET_ITEMS, cacheKey: 'usBucketItems' },
    { storageKey: CACHE_KEYS.US_WISHLIST_ITEMS, cacheKey: 'usWishlistItems' },
    { storageKey: CACHE_KEYS.US_MILESTONES, cacheKey: 'usMilestones' },
    { storageKey: CACHE_KEYS.TIME_CAPSULES, cacheKey: 'timeCapsules' },
    { storageKey: CACHE_KEYS.SURPRISES, cacheKey: 'surprises' },
    { storageKey: CACHE_KEYS.VOICE_NOTES, cacheKey: 'voiceNotes' },
    { storageKey: CACHE_KEYS.PRIVATE_SPACE_ITEMS, cacheKey: 'privateSpaceItems' },
];
const CONTENT_SINGLETON_KEYS = [
    CACHE_KEYS.PET_STATS,
    CACHE_KEYS.USER_STATUS,
    CACHE_KEYS.PARTNER_STATUS,
    CACHE_KEYS.TOGETHER_MUSIC_META,
    CACHE_KEYS.OUR_ROOM_STATE,
    COUPLE_ROOM_KEY,
];
const CONTENT_LEGACY_MIRROR_KEYS = ['lior_bucket', 'lior_wishlist', 'lior_milestones', 'lior_room_state'];
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

const backupCurrentContentForAccount = (userId: string | null) => {
    if (!userId) return;

    const collectionSnapshots = CONTENT_COLLECTION_STORES.map(({ storageKey, cacheKey }) => ({
        storageKey,
        value: [...(DATA_CACHE[cacheKey] as unknown[])],
        raw: localStorage.getItem(storageKey),
    }));
    const singletonSnapshots = CONTENT_SINGLETON_KEYS.map((storageKey) => ({
        storageKey,
        raw: localStorage.getItem(storageKey),
    }));

    void (async () => {
        try {
            for (const { storageKey, value, raw } of collectionSnapshots) {
                await writeRaw(STORES.DATA, buildAccountScopedStorageKey(storageKey, userId), value);
                if (raw !== null) localStorage.setItem(buildAccountScopedStorageKey(storageKey, userId), raw);
            }

            for (const { storageKey, raw } of singletonSnapshots) {
                if (raw !== null) {
                    localStorage.setItem(buildAccountScopedStorageKey(storageKey, userId), raw);
                    await writeRaw(STORES.DATA, buildAccountScopedStorageKey(storageKey, userId), parseLocalBackupValue(raw));
                }
            }
        } catch (error) {
            console.warn('[privacy] Failed to snapshot account content before switching account:', error);
        }
    })();
};

const clearBaseContentForAccountSwitch = () => {
    for (const { storageKey, cacheKey } of CONTENT_COLLECTION_STORES) {
        (DATA_CACHE as Record<string, unknown[]>)[cacheKey] = [];
        localStorage.removeItem(storageKey);
        void writeRaw(STORES.DATA, storageKey, []);
    }

    for (const storageKey of CONTENT_SINGLETON_KEYS) {
        localStorage.removeItem(storageKey);
        void deleteRaw(STORES.DATA, storageKey);
    }

    for (const legacyKey of CONTENT_LEGACY_MIRROR_KEYS) {
        localStorage.removeItem(legacyKey);
    }

    MEDIA_MEMORY_CACHE.clear();
    notifyUpdate({ source: 'sync', action: 'save', table: 'account-scope', id: 'cleared' });
};

const restoreAccountScopedContent = (userId: string) => {
    void (async () => {
        try {
            for (const { storageKey, cacheKey } of CONTENT_COLLECTION_STORES) {
                const scopedValue = await readRaw(STORES.DATA, buildAccountScopedStorageKey(storageKey, userId));
                const value = Array.isArray(scopedValue) ? scopedValue : [];
                (DATA_CACHE as Record<string, unknown[]>)[cacheKey] = value;
                await writeRaw(STORES.DATA, storageKey, value);
            }

            for (const storageKey of CONTENT_SINGLETON_KEYS) {
                const scopedStorageKey = buildAccountScopedStorageKey(storageKey, userId);
                const scopedLocalValue = localStorage.getItem(scopedStorageKey);
                if (scopedLocalValue !== null) {
                    localStorage.setItem(storageKey, scopedLocalValue);
                } else {
                    localStorage.removeItem(storageKey);
                }

                const scopedRawValue = await readRaw(STORES.DATA, scopedStorageKey);
                if (scopedRawValue !== undefined) {
                    await writeRaw(STORES.DATA, storageKey, scopedRawValue);
                } else {
                    await deleteRaw(STORES.DATA, storageKey);
                }
            }

            notifyUpdate({ source: 'sync', action: 'save', table: 'account-scope', id: userId });
        } catch (error) {
            console.warn('[privacy] Failed to restore account-scoped content:', error);
        }
    })();
};

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

const MEDIA_OWNER_TABLES = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'voice_notes', 'private_space_items']);
const TABLE_TO_MEDIA_FEATURE: Record<string, string> = {
    memories: 'memories',
    daily_photos: 'daily-moments',
    keepsakes: 'keepsakes',
    time_capsules: 'time-capsules',
    surprises: 'surprises',
    voice_notes: 'voice-notes',
    private_space_items: 'private-space',
    together_music: 'together-music',
};
const TOGETHER_MUSIC_SOURCE_KEY = 'custom_together_music';
type TogetherMusicMetadata = { name: string; date: string; size: number; mimeType?: string; ownerUserId?: string };
type VoiceNoteAudioSaveResult = { storagePath: string | null; byteSize: number; mimeType: string };
type ManagedStorageFeature = 'memories' | 'daily-moments' | 'keepsakes' | 'time-capsules' | 'surprises' | 'voice-notes' | 'private-space' | 'together-music';
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
    'private-space': 'Private Space',
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
        case 'private-space':
            return DATA_CACHE.privateSpaceItems;
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

const coerceIsoDate = (value: unknown): string | null => {
    let timestamp = Number.NaN;
    if (value instanceof Date) {
        timestamp = value.getTime();
    } else if (typeof value === 'number') {
        timestamp = value;
    } else {
        const raw = cleanString(value);
        if (raw) timestamp = Date.parse(raw);
    }

    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const addMsToIso = (iso: string, ms: number): string | null => {
    const timestamp = Date.parse(iso);
    return Number.isFinite(timestamp) ? new Date(timestamp + ms).toISOString() : null;
};

const normalizeMoodEntry = (value: unknown): MoodEntry | null => {
    if (!value || typeof value !== 'object') return null;
    const input = value as Partial<MoodEntry> & Record<string, unknown>;
    const id = cleanString(input.id);
    const userId = cleanString(input.userId);
    const mood = cleanString(input.mood).toLowerCase();
    const timestamp = coerceIsoDate(input.timestamp) || coerceIsoDate(input.createdAt) || coerceIsoDate(input.date);

    if (!id || !userId || !mood || !timestamp) return null;

    const note = cleanString(input.note);
    return {
        id,
        userId,
        mood,
        timestamp,
        ...(note ? { note } : {}),
    };
};

const normalizeMoodEntries = (items: unknown): MoodEntry[] => {
    if (!Array.isArray(items)) return [];
    const byId = new Map<string, MoodEntry>();
    for (const item of items) {
        const normalized = normalizeMoodEntry(item);
        if (normalized) byId.set(normalized.id, normalized);
    }
    return Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const normalizeDailyPhoto = (value: unknown): DailyPhoto | null => {
    if (!value || typeof value !== 'object') return null;
    const input = value as Partial<DailyPhoto> & Record<string, unknown>;
    const id = cleanString(input.id);
    if (!id) return null;

    const expiresAt = coerceIsoDate(input.expiresAt);
    const createdAt = coerceIsoDate(input.createdAt)
        || coerceIsoDate(input.date)
        || (expiresAt ? addMsToIso(expiresAt, -24 * 60 * 60 * 1000) : null);
    const finalExpiresAt = expiresAt || (createdAt ? addMsToIso(createdAt, 24 * 60 * 60 * 1000) : null);
    if (!createdAt || !finalExpiresAt) return null;

    return {
        ...input,
        id,
        caption: cleanString(input.caption) || 'Just now',
        createdAt,
        expiresAt: finalExpiresAt,
        senderId: cleanString(input.senderId) || 'unknown',
    } as DailyPhoto;
};

const normalizeDailyPhotos = (items: DailyPhoto[], now = Date.now(), includeExpired = false): DailyPhoto[] => {
    const byId = new Map<string, DailyPhoto>();
    for (const item of items) {
        const normalized = normalizeDailyPhoto(item);
        if (!normalized || (!includeExpired && isDailyMomentExpired(normalized, now))) continue;
        byId.set(normalized.id, normalized);
    }
    return Array.from(byId.values());
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

const filterActiveDailyPhotos = (items: DailyPhoto[], now = Date.now()): DailyPhoto[] =>
    normalizeDailyPhotos(items, now);

/**
 * Removes coupleId / partnerUserId from a raw JSON blob in localStorage.
 * Used by forceNewPairing and clearPairLock to prevent applyLockedPairLink
 * from re-deriving an activeLock from stale stored values.
 */
const scrubPairFieldsFromStorageKey = (rawKey: string): void => {
    const raw = localStorage.getItem(rawKey);
    if (!raw) return;
    try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        delete obj.coupleId;
        delete obj.partnerUserId;
        localStorage.setItem(rawKey, JSON.stringify(obj));
    } catch { /* ignore */ }
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

            const activeUserIdForInit = localStorage.getItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID);
            const load = async (key: string, cacheKey: keyof typeof DATA_CACHE) => {
                const scopedVal = activeUserIdForInit
                    ? await readRaw(STORES.DATA, buildAccountScopedStorageKey(key, activeUserIdForInit))
                    : undefined;
                const val = scopedVal ?? await readRaw(STORES.DATA, key);
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
                load(CACHE_KEYS.PRIVATE_SPACE_ITEMS, 'privateSpaceItems'),
            ]);

            const hadLegacyEnvelopeColors = DATA_CACHE.envelopes.some(
                (item) => normalizeEnvelopeColor(item?.color) !== (typeof item?.color === 'string' ? item.color.trim() : ''),
            );
            DATA_CACHE.envelopes = normalizeEnvelopeList(DATA_CACHE.envelopes);
            if (hadLegacyEnvelopeColors) {
                await writeRaw(STORES.DATA, CACHE_KEYS.ENVELOPES, DATA_CACHE.envelopes);
            }

            DATA_CACHE.keepsakes = DATA_CACHE.keepsakes.map((item) => normalizeKeepsakeSender(item));
            DATA_CACHE.moodEntries = normalizeMoodEntries(DATA_CACHE.moodEntries);
            await writeRaw(STORES.DATA, CACHE_KEYS.MOOD_ENTRIES, DATA_CACHE.moodEntries);

            const normalizedDailyPhotos = normalizeDailyPhotos(DATA_CACHE.dailyPhotos, Date.now(), true);
            if (DATA_CACHE.dailyPhotos !== normalizedDailyPhotos) {
                DATA_CACHE.dailyPhotos = normalizedDailyPhotos;
                await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, DATA_CACHE.dailyPhotos);
            }

            const restoreLocalBackup = async (key: string) => {
                const backup = await readRaw(STORES.DATA, key);
                if (backup && !localStorage.getItem(key)) {
                    localStorage.setItem(key, serializeLocalBackupValue(backup));
                }
            };

            await Promise.all([
                restoreLocalBackup(CACHE_KEYS.IDENTITY),
                restoreLocalBackup(CACHE_KEYS.SHARED_PROFILE),
                restoreLocalBackup(CACHE_KEYS.SEEN_RELEASE_VERSION),
                restoreLocalBackup(CACHE_KEYS.COACHMARKS_SEEN),
                restoreLocalBackup(CACHE_KEYS.PET_STATS),
                restoreLocalBackup(CACHE_KEYS.USER_STATUS),
                restoreLocalBackup(CACHE_KEYS.PARTNER_STATUS),
                restoreLocalBackup(CACHE_KEYS.TOGETHER_MUSIC_META),
                restoreLocalBackup(CACHE_KEYS.MOOD_ENTRIES),
                restoreLocalBackup(CACHE_KEYS.OUR_ROOM_STATE),
                restoreLocalBackup(CACHE_KEYS.US_BUCKET_ITEMS),
                restoreLocalBackup(CACHE_KEYS.US_WISHLIST_ITEMS),
                restoreLocalBackup(CACHE_KEYS.US_MILESTONES),
                restoreLocalBackup(CACHE_KEYS.PRIVATE_SPACE_ITEMS)
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

    getMediaReferenceCandidates(storagePath?: string, cloudPayload?: string): string[] {
        const candidates: string[] = [];
        const pushCandidate = (value?: string) => {
            if (!value || value.startsWith('data:')) return;
            if (!MediaStorageService.isMediaReference(value)) return;
            if (!candidates.includes(value)) candidates.push(value);
        };

        pushCandidate(storagePath);
        pushCandidate(cloudPayload);
        return candidates;
    },

    async getImage(mediaId: string, cloudPayload?: string, storagePath?: string): Promise<string | null> {
        const referenceCandidates = this.getMediaReferenceCandidates(storagePath, cloudPayload);
        const primaryReference = referenceCandidates[0];
        if (!mediaId && !primaryReference) return cloudPayload || null;

        // 1. RAM cache
        const cacheKey = mediaId || primaryReference || '';
        if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

        // 2. IndexedDB local cache — checked FIRST before cloud URL.
        //    Local data is faster, always fresh, and resilient to R2 outages / URL staleness.
        //    Items uploaded from this device always have their base64 here.
        if (mediaId) {
            const local = await readRaw<string>(STORES.IMAGES, mediaId);
            if (local) {
                if (local.length < 2_000_000) MEDIA_MEMORY_CACHE.set(cacheKey, local);
                return local;
            }
        }

        // 3. R2 / Cloud storage URL — used when IDB doesn't have the image
        //    (e.g. partner's item synced from cloud, or IDB was evicted by browser).
        //    If the path is still pointing at legacy Supabase storage, recover that
        //    payload instead of returning a dead R2 URL.
        for (const candidate of referenceCandidates) {
            const url = await MediaStorageService.getAccessibleUrl(candidate);
            if (url) {
                // Background: download and cache in IDB so future loads are instant
                // and offline-resilient. Fire-and-forget — never blocks the caller.
                this._cacheR2Image(cacheKey, url).catch(() => {});
                return url;
            }

            const recovered = await MediaStorageService.downloadMedia(candidate);
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
        const referenceCandidates = this.getMediaReferenceCandidates(storagePath, cloudPayload);
        const primaryReference = referenceCandidates[0];
        if (!mediaId && !cloudPayload && !primaryReference) return null;

        if (mediaId) {
            const cacheKey = mediaId;
            if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

            const local = await readRaw<string>(STORES.IMAGES, mediaId);
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

        for (const candidate of referenceCandidates) {
            const cacheKey = mediaId || candidate;
            if (MEDIA_MEMORY_CACHE.has(cacheKey)) return MEDIA_MEMORY_CACHE.get(cacheKey)!;

            const recovered = await MediaStorageService.downloadMedia(candidate);
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
            : listKey === 'dailyPhotos'
            ? normalizeDailyPhoto(sanitizedItem)
            : listKey === 'moodEntries'
            ? normalizeMoodEntry(sanitizedItem)
            : sanitizedItem;
        if (!normalizedItem) return;
        const list = [...(DATA_CACHE[listKey] as any[])];
        const idx = list.findIndex(i => i.id === normalizedItem.id);
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
        const preserveLegacyImageRef = source === 'sync' && !!imageRef && imageRef !== toSaveMetadata.storagePath;
        const preserveLegacyVideoRef = source === 'sync' && !!videoRef && videoRef !== toSaveMetadata.videoStoragePath;
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
        if (preserveLegacyImageRef) {
            toSaveMetadata.image = imageRef;
        } else {
            delete toSaveMetadata.image;
        }

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
        if (preserveLegacyVideoRef) {
            toSaveMetadata.video = videoRef;
        } else {
            delete toSaveMetadata.video;
        }

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

        // No-op sync write: a reconciled cloud row that is byte-identical to the
        // cached row must NOT churn state. Without this, reconcileCloud re-saves
        // EVERY pulled row and fires one 'storage-update' per item, so a sync
        // burst became N full re-renders across every subscribing view. Skip the
        // cache reassign + writeRaw + notifyUpdate when nothing actually changed.
        // Scoped to sync + no inline media this call (media side-effects above
        // must still land); strict equality only ever skips a true no-op, so a
        // false negative harmlessly falls through to the normal path.
        if (
            source === 'sync'
            && idx >= 0
            && existingItem
            && !imageToStore
            && !videoToStore
            && JSON.stringify(existingItem) === JSON.stringify(toSaveMetadata)
        ) {
            return;
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
                    const result = await MediaStorageService.uploadMedia(payload, path, {
                        sourceTable: table,
                        logicalRowId: metadata.id,
                        itemId: metadata.id,
                        ownerUserId: metadata.ownerUserId,
                        expiresAt: metadata.expiresAt ?? null,
                        metadata: { mediaField: 'image' },
                    });
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
                    const result = await MediaStorageService.uploadMedia(payload, path, {
                        sourceTable: table,
                        logicalRowId: metadata.id,
                        itemId: metadata.id,
                        ownerUserId: metadata.ownerUserId,
                        expiresAt: metadata.expiresAt ?? null,
                        metadata: { mediaField: 'video' },
                    });
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
                removePendingUpload(listKey, metadata.id);
            } else if (SupabaseService.init()) {
                addPendingUpload({
                    listKey,
                    storageKey,
                    prefix,
                    itemId: metadata.id,
                    hasImage: needsImage,
                    hasVideo: needsVideo,
                });
            }
        } catch (e) {
            console.warn('Background storage upload failed — queued for retry:', e);
            // Queue for retry on next sync cycle so media is never permanently lost
            addPendingUpload({
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
        const queue = getPendingUploads();
        if (queue.length === 0) return;

        console.info(`[upload-retry] Retrying ${queue.length} pending upload(s)…`);

        for (const entry of queue) {
            try {
                const cacheList = DATA_CACHE[entry.listKey as keyof typeof DATA_CACHE] as any[] | undefined;
                if (!cacheList) continue;
                const item = cacheList.find((i: any) => i.id === entry.itemId);
                if (!item) {
                    removePendingUpload(entry.listKey, entry.itemId);
                    continue;
                }

                let updated = false;
                const cleanupPaths: string[] = [];
                const tableForCache: Record<string, string> = {
                    memories: 'memories',
                    dailyPhotos: 'daily_photos',
                    keepsakes: 'keepsakes',
                    timeCapsules: 'time_capsules',
                    surprises: 'surprises',
                    privateSpaceItems: 'private_space_items',
                };
                const tbl = tableForCache[entry.listKey];
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
                        const result = await MediaStorageService.uploadMedia(payload, path, {
                            sourceTable: tbl,
                            logicalRowId: item.id,
                            itemId: item.id,
                            ownerUserId: item.ownerUserId,
                            expiresAt: item.expiresAt ?? null,
                            metadata: { mediaField: 'image' },
                        });
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
                        const result = await MediaStorageService.uploadMedia(payload, path, {
                            sourceTable: tbl,
                            logicalRowId: item.id,
                            itemId: item.id,
                            ownerUserId: item.ownerUserId,
                            expiresAt: item.expiresAt ?? null,
                            metadata: { mediaField: 'video' },
                        });
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
                    removePendingUpload(entry.listKey, entry.itemId);
                    if (updated) console.info(`[upload-retry] Uploaded ${entry.itemId}`);
                }
            } catch (e) {
                console.warn(`[upload-retry] Still failed for ${entry.itemId}:`, e);
                // Leave in queue — will retry next time
            }
        }
    },

    async _replaceCollection(listKey: keyof typeof DATA_CACHE, storageKey: string, items: any[]) {
        const normalizedItems = listKey === 'envelopes'
            ? normalizeEnvelopeList(items)
            : listKey === 'moodEntries'
            ? normalizeMoodEntries(items)
            : items;
        (DATA_CACHE[listKey] as any) = normalizedItems;
        await writeRaw(STORES.DATA, storageKey, normalizedItems);
    },

    getMemories: () => DATA_CACHE.memories.filter(m => !isDeletedLocally('memories', m.id)),
    saveMemory: (m: Memory) => StorageService._saveInternal('memories', CACHE_KEYS.MEMORIES, m, 'mem', 'memories'),
    deleteMemory: async (id: string) => {
        addPendingDelete('memories', id);
        const item = DATA_CACHE.memories.find(m => m.id === id);
        if (item?.imageId) {
            await deleteRaw(STORES.IMAGES, item.imageId);
            MEDIA_MEMORY_CACHE.delete(item.imageId);
        }
        if (item?.videoId) await deleteRaw(STORES.IMAGES, item.videoId);
        if (item?.audioId) await deleteRaw(STORES.IMAGES, item.audioId);
        const remoteMediaDeletes: Promise<boolean>[] = [];
        if (item?.storagePath) remoteMediaDeletes.push(MediaStorageService.deleteMedia(item.storagePath));
        if (item?.videoStoragePath) remoteMediaDeletes.push(MediaStorageService.deleteMedia(item.videoStoragePath));
        if (item?.audioStoragePath) remoteMediaDeletes.push(MediaStorageService.deleteMedia(item.audioStoragePath));
        DATA_CACHE.memories = DATA_CACHE.memories.filter(m => m.id !== id);
        await writeRaw(STORES.DATA, CACHE_KEYS.MEMORIES, DATA_CACHE.memories);
        const mediaDeleteResults = remoteMediaDeletes.length > 0
            ? await Promise.allSettled(remoteMediaDeletes)
            : [];
        const remoteMediaDeleted = mediaDeleteResults.every((result) => result.status === 'fulfilled' && result.value === true);

        // Immediate cloud delete so the record is removed before sync reconciliation.
        // notifyUpdate below still keeps the standard sync path as backup.
        let cloudRowDeleted = false;
        try {
            if (SupabaseService.init()) {
                cloudRowDeleted = await SupabaseService.deleteItem('memories', id);
            }
        } catch {
            cloudRowDeleted = false;
        }
        notifyUpdate({ source: 'user', action: 'delete', table: 'memories', id });
        if (!cloudRowDeleted || !remoteMediaDeleted) {
            throw new Error('Memory deleted locally, but cloud deletion did not confirm. Sync will retry from the tombstone.');
        }
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
        notifyUpdate({ source: notifySource, action: 'delete', table: 'daily_photos', id });
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
        const now = Date.now();
        const normalized = normalizeDailyPhotos(DATA_CACHE.dailyPhotos, now, true);
        if (normalized.length !== DATA_CACHE.dailyPhotos.length) {
            DATA_CACHE.dailyPhotos = normalized;
            await writeRaw(STORES.DATA, CACHE_KEYS.DAILY_PHOTOS, DATA_CACHE.dailyPhotos);
            notifyUpdate({ source: 'sync', action: 'save', table: 'daily_photos', id: 'cleanup' });
        }

        // Find expired photos
        const expired = DATA_CACHE.dailyPhotos.filter(p => isDailyMomentExpired(p, now));

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

    getEnvelopes: () => {
        DATA_CACHE.envelopes = normalizeEnvelopeList(DATA_CACHE.envelopes);
        return DATA_CACHE.envelopes;
    },
    saveEnvelope: (e: Envelope) => StorageService._saveInternal('envelopes', CACHE_KEYS.ENVELOPES, normalizeEnvelope(e), undefined, 'envelopes'),
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
        let item = rowMeta ? { ...data.data, __rowMeta: rowMeta } : (data.data || data);
        if (!item) return;
        const singletonTables = new Set(['couple_profile', 'pet_stats', 'together_music', 'our_room_state']);
        if (!singletonTables.has(table) && !item.id) return;

        if (table === 'daily_photos') {
            const normalizedDailyPhoto = normalizeDailyPhoto(item);
            if (!normalizedDailyPhoto || isDailyMomentExpired(normalizedDailyPhoto)) {
                if (DATA_CACHE.dailyPhotos.some((photo) => photo.id === item.id)) {
                    await this._purgeDailyPhotoLocalOnly(item.id, 'sync');
                }
                return;
            }
            item = normalizedDailyPhoto;
        }

        if (table === 'daily_photos' && isDailyMomentExpired(item)) {
            if (DATA_CACHE.dailyPhotos.some((photo) => photo.id === item.id)) {
                await this._purgeDailyPhotoLocalOnly(item.id, 'sync');
            }
            return;
        }

        // Never restore a tombstoned item — it was deleted locally and cloud hasn't caught up yet.
        // Also purge any stale cached copy so UI reloads cannot briefly resurrect it.
        if (isDeletedLocally(table, item.id)) {
            await this.handleCloudDelete(table, item.id);
            return;
        }

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
            private_space_items: { cache: 'privateSpaceItems', key: CACHE_KEYS.PRIVATE_SPACE_ITEMS, prefix: 'priv' },
        };

        if (tableMap[table]) {
            const config = tableMap[table];
            const list = DATA_CACHE[config.cache] as any[];
            const isNew = !list.find(i => i.id === item.id);
            const normalizedItem = table === 'envelopes' ? normalizeEnvelope(item as Envelope) : item;
            
            await this._saveInternal(config.cache, config.key, normalizedItem, config.prefix, table, 'sync');

            // Send push notification if app is in background and item is new
            if (isNew && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                let msg = '';
                if (table === 'memories') msg = 'A new memory was added to your vault!';
                else if (table === 'notes') msg = 'Your partner left you a note 💌';
                else if (table === 'daily_photos') msg = 'A new Daily Photo was shared 📸';
                else if (table === 'keepsakes') msg = 'A new keepsake arrived in your box 🎁';
                else if (table === 'comments') msg = 'Your partner commented on something 💬';
                
                if (msg) new Notification('Lior', { body: msg, icon: '/notification-icon.png' });
            }
        } else if (table === 'couple_profile') {
            const local = this.getCoupleProfile();
            if (item && typeof item === 'object') {
                // Only merge shared fields; each account keeps its own local display identity.
                const { myName: _m, partnerName: _p, __rowMeta: rowMetaFromCloud, data: _nestedData, ...sharedFromCloud } = item as any;
                const rowCoupleId = cleanString(rowMetaFromCloud?.coupleId);
                if (rowCoupleId && !cleanString(sharedFromCloud.coupleId)) {
                    sharedFromCloud.coupleId = rowCoupleId;
                }
                // ── Field-level merge (NOT a blind clobber) ─────────────────────────
                // Root cause of "anniversary disappears / couple info inconsistent":
                // the previous `{ ...local, ...sharedFromCloud }` spread let a stale or
                // empty cloud snapshot overwrite a good local value (e.g. cloud sends
                // anniversaryDate:'' while we hold a real date). We now overlay ONLY the
                // cloud fields that carry a real value, so an empty/missing remote field
                // can never wipe locally-held relationship data. Fields the cloud does
                // provide (the shared source of truth) still win — last-writer semantics
                // are preserved for meaningful values only.
                const meaningfulFromCloud: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(sharedFromCloud)) {
                    if (value == null) continue;                                   // never overwrite with null/undefined
                    if (typeof value === 'string' && value.trim() === '') continue; // nor with an empty string
                    if (Array.isArray(value) && value.length === 0) continue;       // nor with an empty array
                    meaningfulFromCloud[key] = value;
                }
                if (Object.keys(meaningfulFromCloud).length === 0) return;
                this.saveCoupleProfile({ ...local, ...meaningfulFromCloud } as CoupleProfile, 'sync');
            }
        } else if (table === 'pet_stats') {
            this.savePetStats(item, 'sync');
        } else if (table === 'user_status') {
            const profile = this.getCoupleProfile();
            const myId = this.getMyUserId();
            const incomingId = item?.id;
            // Match by stable user id first; fall back to display name so rows
            // written by older (name-keyed) clients still route correctly.
            const isMine = (!!myId && incomingId === myId) || (!!profile.myName && incomingId === profile.myName);
            const isPartner = (!!profile.partnerUserId && incomingId === profile.partnerUserId)
                || (!!profile.partnerName && incomingId === profile.partnerName);

            // Ignore a status that is older than what we already hold for that
            // slot — prevents a stale legacy (name-keyed) row from clobbering a
            // newer (id-keyed) one during reconcile.
            const isNewer = (slotKey: string): boolean => {
                try {
                    const existing = JSON.parse(localStorage.getItem(slotKey) || 'null');
                    if (!existing?.timestamp || !item?.timestamp) return true;
                    return new Date(item.timestamp).getTime() >= new Date(existing.timestamp).getTime();
                } catch { return true; }
            };

            if (isPartner && !isMine) {
                if (!isNewer(CACHE_KEYS.PARTNER_STATUS)) return;
                localStorage.setItem(CACHE_KEYS.PARTNER_STATUS, JSON.stringify(item));
                writeRaw(STORES.DATA, CACHE_KEYS.PARTNER_STATUS, item);
                notifyUpdate({ source: 'sync', action: 'save', table, id: incomingId });
            } else if (isMine) {
                if (!isNewer(CACHE_KEYS.USER_STATUS)) return;
                localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(item));
                writeRaw(STORES.DATA, CACHE_KEYS.USER_STATUS, item);
                notifyUpdate({ source: 'sync', action: 'save', table, id: incomingId });
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
        addPendingDelete(table, id);
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
            private_space_items: { cache: 'privateSpaceItems', key: CACHE_KEYS.PRIVATE_SPACE_ITEMS },
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
            if (item?.audioId) await deleteRaw(STORES.IMAGES, item.audioId);
            if (item?.storagePath) MediaStorageService.deleteMedia(item.storagePath);
            if (item?.videoStoragePath) MediaStorageService.deleteMedia(item.videoStoragePath);
            if (item?.audioStoragePath) MediaStorageService.deleteMedia(item.audioStoragePath);
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
                        const uploaded = await MediaStorageService.uploadMedia(base64, path, {
                            sourceTable: 'together_music',
                            logicalRowId: 'singleton',
                            itemId: 'singleton',
                            ownerUserId,
                            metadata: { name: file.name },
                        });
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

    getStoredTogetherMusicSource: async (): Promise<string | null> => {
        const stored = await readRaw<string | null>(STORES.IMAGES, TOGETHER_MUSIC_SOURCE_KEY);
        return stored ?? null;
    },
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
        const lockStr = getAccountScopedLocalStorageValue(CACHE_KEYS.LINK_LOCK);

        // Content-keyed cache: if all three source strings are unchanged the
        // computed profile is identical, so skip the parse/normalize/merge.
        const cacheKey = `${idStr ?? ''} ${sharedStr ?? ''} ${lockStr ?? ''}`;
        if (cacheKey === _profileCacheKey && _profileCacheVal) {
            // Shallow clone so a caller reassigning a top-level field cannot
            // corrupt the cached object shared with other readers.
            return { ..._profileCacheVal };
        }

        const rawIdentity = idStr ? JSON.parse(idStr) : { myName: '', partnerName: '' };
        const id = normalizeIdentityPair(rawIdentity);
        if (id.myName !== rawIdentity.myName || id.partnerName !== rawIdentity.partnerName) {
            localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify({ myName: id.myName, partnerName: id.partnerName }));
        }

        const shared = sharedStr ? JSON.parse(sharedStr) : { anniversaryDate: '', theme: 'rose' };

        const result = applyLockedPairLink({ ...id, ...shared });
        _profileCacheVal = result;
        // Re-key off the possibly-normalized identity string so the next call
        // hits the cache instead of missing once more after a normalization write.
        const finalIdStr = localStorage.getItem(CACHE_KEYS.IDENTITY);
        _profileCacheKey = `${finalIdStr ?? ''} ${sharedStr ?? ''} ${lockStr ?? ''}`;
        return { ...result };
    },

    activateAccount: (userId: string | null) => {
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        const previousUserId = localStorage.getItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID);
        // Only flag a real account switch when there IS a previous account
        // AND it's different from the incoming one. A null `previousUserId`
        // simply means "first activation in this session" — base data may
        // legitimately belong to the user we're about to activate (e.g.
        // persisted from a prior session that signed-out and cleared
        // `ACTIVE_USER_ID`). Treating it as a switch was firing the base
        // wipe on every fresh login and destroying the user's pair link,
        // onboarded flag, coachmark state, and seen-version state.
        const accountChanged = Boolean(previousUserId) && previousUserId !== normalizedUserId;

        if (!normalizedUserId) {
            if (previousUserId) {
                backupCurrentProfileForAccount(previousUserId);
                backupCurrentContentForAccount(previousUserId);
            }
            localStorage.removeItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID);
            clearBaseProfileForAccountSwitch();
            clearBaseContentForAccountSwitch();
            return;
        }

        if (previousUserId && previousUserId !== normalizedUserId) {
            backupCurrentProfileForAccount(previousUserId);
            backupCurrentContentForAccount(previousUserId);
        }

        if (accountChanged) {
            clearBaseProfileForAccountSwitch();
            clearBaseContentForAccountSwitch();
        }

        localStorage.setItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID, normalizedUserId);
        restoreAccountScopedFlagsForAccount(normalizedUserId);
        const restoredScopedProfile = restoreAccountScopedProfile(normalizedUserId);
        if (!restoredScopedProfile) {
            restoreAccountScopedFlagsForAccount(normalizedUserId);
            if (!accountChanged) {
                backupCurrentProfileForAccount(normalizedUserId);
            }
        }
        if (accountChanged) {
            restoreAccountScopedContent(normalizedUserId);
        }
    },

    prepareForSignOut: () => {
        const activeUserId = localStorage.getItem(ACCOUNT_LOCAL_KEYS.ACTIVE_USER_ID) || SupabaseService.getCachedUserId();
        backupCurrentProfileForAccount(activeUserId);
        backupCurrentContentForAccount(activeUserId);
    },

    hasCompletedOnboarding: (): boolean => {
        const onboardingFlag = getAccountScopedLocalStorageValue(ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE);
        if (onboardingFlag === 'true') {
            return true;
        }

        const profile = StorageService.getCoupleProfile();
        const hasProfileIdentity = typeof profile.myName === 'string' && profile.myName.trim().length > 0;
        const hasPairLink = Boolean(cleanString(profile.coupleId) && cleanString(profile.partnerUserId));
        const derivedCompletion = hasProfileIdentity || hasPairLink;

        if (derivedCompletion) {
            StorageService.markOnboardingComplete();
        }

        return derivedCompletion;
    },

    markOnboardingComplete: () => {
        setAccountScopedLocalStorageValue(ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE, 'true');
    },

    clearOnboardingCompletion: () => {
        clearAccountScopedLocalStorageValue(ACCOUNT_LOCAL_KEYS.ONBOARDING_COMPLETE);
        clearAccountScopedLocalStorageValue(ACCOUNT_LOCAL_KEYS.MANUAL_OVERRIDE);
    },

    getSeenReleaseVersion: (): string | null => getAccountScopedLocalStorageValue(CACHE_KEYS.SEEN_RELEASE_VERSION),

    setSeenReleaseVersion: (value: string) => {
        setAccountScopedLocalStorageValue(CACHE_KEYS.SEEN_RELEASE_VERSION, value);
        writeRaw(STORES.DATA, CACHE_KEYS.SEEN_RELEASE_VERSION, value);
    },

    clearSeenReleaseVersion: () => {
        clearAccountScopedLocalStorageValue(CACHE_KEYS.SEEN_RELEASE_VERSION);
        deleteRaw(STORES.DATA, CACHE_KEYS.SEEN_RELEASE_VERSION);
    },

    getSeenCoachmarks: (): string[] => {
        try {
            return JSON.parse(getAccountScopedLocalStorageValue(CACHE_KEYS.COACHMARKS_SEEN) || '[]');
        } catch {
            return [];
        }
    },

    setSeenCoachmarks: (seen: string[]) => {
        setAccountScopedLocalStorageValue(CACHE_KEYS.COACHMARKS_SEEN, JSON.stringify(seen));
        writeRaw(STORES.DATA, CACHE_KEYS.COACHMARKS_SEEN, seen);
    },

    clearSeenCoachmarks: () => {
        clearAccountScopedLocalStorageValue(CACHE_KEYS.COACHMARKS_SEEN);
        deleteRaw(STORES.DATA, CACHE_KEYS.COACHMARKS_SEEN);
    },

    saveCoupleProfile: (p: CoupleProfile, source: 'user' | 'sync' = 'user') => {
        const currentProfile = StorageService.getCoupleProfile();
        const sanitizedProfile = applyLockedPairLink(
            normalizeIdentityPair(sanitizeUserContent(p)),
            currentProfile,
        ) as CoupleProfile;
        persistLockedPairLink(sanitizedProfile);
        const identityProfile = { myName: sanitizedProfile.myName, partnerName: sanitizedProfile.partnerName };
        localStorage.setItem(CACHE_KEYS.IDENTITY, JSON.stringify(identityProfile));
        persistScopedLocalStorageJson(CACHE_KEYS.IDENTITY, identityProfile);
        writeRaw(STORES.DATA, CACHE_KEYS.IDENTITY, identityProfile);
        const sharedProfile = { ...sanitizedProfile };
        delete (sharedProfile as any).myName;
        delete (sharedProfile as any).partnerName;
        localStorage.setItem(CACHE_KEYS.SHARED_PROFILE, JSON.stringify(sharedProfile));
        persistScopedLocalStorageJson(CACHE_KEYS.SHARED_PROFILE, sharedProfile);

        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.SHARED_PROFILE, sharedProfile);

        notifyUpdate({ source, action: 'save', table: 'couple_profile', id: 'singleton', item: sanitizedProfile });
    },

    /**
     * Force-saves a new pair link, bypassing the lock guard.
     * Call this after an explicit, server-confirmed pairing action (QR scan / manual code).
     * The lock guard (applyLockedPairLink) normally blocks partner changes — this clears it
     * first so the incoming coupleId + partnerUserId are accepted unconditionally.
     */
    forceNewPairing: (coupleId: string, partnerUserId: string, partnerName?: string): void => {
        // 1. Erase the stored lock so applyLockedPairLink can't restore the old pair.
        clearAccountScopedLocalStorageValue(CACHE_KEYS.LINK_LOCK);
        localStorage.removeItem(CACHE_KEYS.LINK_LOCK);
        // 2. Scrub stale pair IDs from the persisted shared profile so that
        //    getCoupleProfile() returns no coupleId, preventing applyLockedPairLink
        //    from re-deriving an activeLock from the old values.
        scrubPairFieldsFromStorageKey(CACHE_KEYS.SHARED_PROFILE);
        const activeId = getActiveAccountScopeUserId();
        if (activeId) {
            scrubPairFieldsFromStorageKey(
                buildAccountScopedStorageKey(CACHE_KEYS.SHARED_PROFILE, activeId),
            );
        }
        // 3. saveCoupleProfile now sees no existing lock — new credentials go through.
        const profile = StorageService.getCoupleProfile();
        StorageService.saveCoupleProfile({
            ...profile,
            coupleId,
            partnerUserId,
            ...(partnerName ? { partnerName } : {}),
        });
    },

    /**
     * Clears the pair link on this device so the user can re-pair.
     * Removes the lock key and wipes coupleId / partnerUserId from the stored profile.
     * Shared data (memories, notes, etc.) is NOT deleted — only the link identifiers.
     */
    clearPairLock: (): void => {
        clearAccountScopedLocalStorageValue(CACHE_KEYS.LINK_LOCK);
        localStorage.removeItem(CACHE_KEYS.LINK_LOCK);
        scrubPairFieldsFromStorageKey(CACHE_KEYS.SHARED_PROFILE);
        const activeId = getActiveAccountScopeUserId();
        if (activeId) {
            scrubPairFieldsFromStorageKey(
                buildAccountScopedStorageKey(CACHE_KEYS.SHARED_PROFILE, activeId),
            );
        }
        // Re-read (now without pair fields) and save through the normal path so
        // IndexedDB and storage event listeners are updated.
        const profile = StorageService.getCoupleProfile();
        StorageService.saveCoupleProfile(profile);
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
        if (!str) return [];
        try {
            DATA_CACHE.moodEntries = normalizeMoodEntries(JSON.parse(str));
            localStorage.setItem(CACHE_KEYS.MOOD_ENTRIES, JSON.stringify(DATA_CACHE.moodEntries));
            writeRaw(STORES.DATA, CACHE_KEYS.MOOD_ENTRIES, DATA_CACHE.moodEntries);
            return DATA_CACHE.moodEntries;
        } catch {
            DATA_CACHE.moodEntries = [];
            localStorage.removeItem(CACHE_KEYS.MOOD_ENTRIES);
            writeRaw(STORES.DATA, CACHE_KEYS.MOOD_ENTRIES, []);
            return [];
        }
    },

    saveMoodEntry: (entry: MoodEntry, source: 'user' | 'sync' = 'user') => {
        const normalized = normalizeMoodEntry(sanitizeUserContent(entry));
        if (!normalized) return;
        const entries = StorageService.getMoodEntries();
        const existingIdx = entries.findIndex(e => e.id === normalized.id);
        if (existingIdx >= 0) {
            entries[existingIdx] = normalized;
        } else {
            entries.push(normalized);
        }
        DATA_CACHE.moodEntries = normalizeMoodEntries(entries);
        localStorage.setItem(CACHE_KEYS.MOOD_ENTRIES, JSON.stringify(DATA_CACHE.moodEntries));
        writeRaw(STORES.DATA, CACHE_KEYS.MOOD_ENTRIES, DATA_CACHE.moodEntries);
        notifyUpdate({ source, action: 'save', table: 'mood_entries', id: normalized.id, item: normalized });
    },

    getPetStats: (): PetStats => {
        const str = localStorage.getItem(CACHE_KEYS.PET_STATS);
        if (str) {
            try {
                return normalizePetStats(JSON.parse(str));
            } catch {
                return normalizePetStats(null);
            }
        }
        return normalizePetStats(null);
    },

    savePetStats: (s: PetStats, source: 'user' | 'sync' = 'user') => {
        const sanitizedStats = normalizePetStats(sanitizeUserContent(s));
        localStorage.setItem(CACHE_KEYS.PET_STATS, JSON.stringify(sanitizedStats));
        // BACKUP TO INDEXEDDB (Deep Lock)
        writeRaw(STORES.DATA, CACHE_KEYS.PET_STATS, sanitizedStats);
        notifyUpdate({ source, action: 'save', table: 'pet_stats', id: 'singleton', item: sanitizedStats });
    },

    getStatus: (): UserStatus => JSON.parse(localStorage.getItem(CACHE_KEYS.USER_STATUS) || '{"state":"awake","timestamp":"' + new Date().toISOString() + '"}'),
    // The Supabase user id is the only stable identity for a person. Display
    // names change; keying status by name made a rename silently break partner
    // status. Falls back to null when not yet signed in.
    getMyUserId: (): string | null => {
        try { return localStorage.getItem('lior_my_user_id'); } catch { return null; }
    },
    saveStatus: (s: UserStatus) => {
        localStorage.setItem(CACHE_KEYS.USER_STATUS, JSON.stringify(s));
        writeRaw(STORES.DATA, CACHE_KEYS.USER_STATUS, s);
        const profile = StorageService.getCoupleProfile();
        // Key by stable user id; fall back to name only when signed-out/legacy.
        const myId = StorageService.getMyUserId() || profile.myName;
        notifyUpdate({ source: 'user', action: 'save', table: 'user_status', id: myId, item: { id: myId, ...s } });
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
        const msg = {
            id: crypto.randomUUID(),
            target: profile.partnerName,
            timestamp: new Date().toISOString(),
            payload
        };
        // Reassign (not nested push) so the cached profile array is never mutated.
        profile.missedAuras = [...(profile.missedAuras ?? []), msg];
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

    ...createUsCollectionsStorageDomain({
        cache: DATA_CACHE,
        cacheKeys: CACHE_KEYS,
        getCoupleProfile: () => StorageService.getCoupleProfile(),
        sanitizeUserContent,
        addPendingDelete,
        notifyUpdate,
        persistData: (storageKey, value) => writeRaw(STORES.DATA, storageKey, value),
    }),

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

    ...createPersonalCollectionsStorageDomain({
        cache: DATA_CACHE,
        cacheKeys: CACHE_KEYS,
        addPendingDelete,
        notifyUpdate,
        saveInternal: (listKey, storageKey, item, prefix, table, source) =>
            StorageService._saveInternal(listKey as keyof typeof DATA_CACHE, storageKey, item, prefix, table, source),
        persistData: (storageKey, value) => writeRaw(STORES.DATA, storageKey, value),
        readMedia: async (id) => {
            const cached = await readRaw<string>(STORES.IMAGES, id);
            return cached || undefined;
        },
        writeMedia: (id, value) => writeRaw(STORES.IMAGES, id, value),
        deleteMediaBlob: (id) => deleteRaw(STORES.IMAGES, id),
        deleteMemoryCache: (id) => {
            MEDIA_MEMORY_CACHE.delete(id);
        },
        sanitizeUserContent,
        resolveOwnerUserId,
        stripInternalRowMeta,
        isInlineMediaPayload,
        extractInlineMediaMeta,
        assertManagedStorageBudget,
        nowIso: () => new Date().toISOString(),
    }),

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
                    const imageCandidates = this.getMediaReferenceCandidates(item.storagePath, item.image);
                    const videoCandidates = this.getMediaReferenceCandidates(item.videoStoragePath, item.video);
                    const imagePath = imageCandidates[0] || null;
                    const videoPath = videoCandidates[0] || null;

                    // Recover image if cloud has base64 and local IDB doesn't
                    if (item.image?.startsWith('data:')) {
                        const existing = await readRaw(STORES.IMAGES, imageId);
                        if (!existing) {
                            await writeRaw(STORES.IMAGES, imageId, item.image);
                            if (item.image.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, item.image);
                            recovered++;
                        }
                    } else if (imageCandidates.length > 0) {
                        const existing = await readRaw(STORES.IMAGES, imageId);
                        if (!existing) {
                            for (const candidate of imageCandidates) {
                                const restored = await MediaStorageService.downloadMedia(candidate);
                                if (restored) {
                                    await writeRaw(STORES.IMAGES, imageId, restored);
                                    if (restored.length < 2_000_000) MEDIA_MEMORY_CACHE.set(imageId, restored);
                                    recovered++;
                                    break;
                                }
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
                    } else if (videoCandidates.length > 0) {
                        const existing = await readRaw(STORES.IMAGES, videoId);
                        if (!existing) {
                            for (const candidate of videoCandidates) {
                                const restored = await MediaStorageService.downloadMedia(candidate);
                                if (restored) {
                                    await writeRaw(STORES.IMAGES, videoId, restored);
                                    recovered++;
                                    break;
                                }
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
