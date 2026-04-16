import { StorageService } from './storage';
import { SupabaseRowEnvelope, SupabaseService } from './supabase';
import { MediaStorageService } from './mediaStorage';

const MIGRATION_KEY = 'lior_media_migrated_v6';

interface MigrationResult {
    migrated: number;
    skipped: number;
    failed: number;
}

type VisualTableConfig = {
    name: 'memories' | 'daily_photos' | 'keepsakes' | 'time_capsules' | 'surprises';
    cache: 'memories' | 'dailyPhotos' | 'keepsakes' | 'timeCapsules' | 'surprises';
    storageKey: string;
    prefix: string;
    getItems: () => any[];
};

const VISUAL_MEDIA_TABLES: VisualTableConfig[] = [
    { name: 'memories', cache: 'memories', storageKey: 'lior_memories', prefix: 'mem', getItems: () => StorageService.getMemories() },
    { name: 'daily_photos', cache: 'dailyPhotos', storageKey: 'lior_daily_photos', prefix: 'daily', getItems: () => StorageService.getDailyPhotos() },
    { name: 'keepsakes', cache: 'keepsakes', storageKey: 'lior_keepsakes', prefix: 'keep', getItems: () => StorageService.getKeepsakes() },
    { name: 'time_capsules', cache: 'timeCapsules', storageKey: 'lior_time_capsules', prefix: 'cap', getItems: () => StorageService.getTimeCapsules() },
    { name: 'surprises', cache: 'surprises', storageKey: 'lior_surprises', prefix: 'surp', getItems: () => StorageService.getSurprises() },
];

const IMAGE_ID_SUFFIX = (prefix: string, itemId: string) => `${prefix}_${itemId}`;
const VIDEO_ID_SUFFIX = (prefix: string, itemId: string) => `${prefix}_vid_${itemId}`;

const getMediaTimestamp = (item: any): string | undefined => {
    const candidate = item?.date || item?.createdAt || item?.meta?.date;
    return typeof candidate === 'string' && candidate ? candidate : undefined;
};

const mergeItemVersions = (localItem?: any, cloudItem?: any, row?: SupabaseRowEnvelope | null) => {
    const merged = {
        ...(cloudItem || {}),
        ...(localItem || {}),
    };

    merged.imageId = localItem?.imageId || cloudItem?.imageId || merged.imageId;
    merged.videoId = localItem?.videoId || cloudItem?.videoId || merged.videoId;
    merged.audioId = localItem?.audioId || cloudItem?.audioId || merged.audioId;
    merged.storagePath = localItem?.storagePath || cloudItem?.storagePath || merged.storagePath;
    merged.videoStoragePath = localItem?.videoStoragePath || cloudItem?.videoStoragePath || merged.videoStoragePath;
    merged.audioStoragePath = localItem?.audioStoragePath || cloudItem?.audioStoragePath || merged.audioStoragePath;
    merged.image = localItem?.image || cloudItem?.image || merged.image;
    merged.video = localItem?.video || cloudItem?.video || merged.video;
    merged.ownerUserId = localItem?.ownerUserId || cloudItem?.ownerUserId || row?.user_id || merged.ownerUserId;

    return merged;
};

const getMediaFields = (kind: 'image' | 'video') => ({
    idField: kind === 'image' ? 'imageId' : 'videoId',
    dataField: kind === 'image' ? 'image' : 'video',
    pathField: kind === 'image' ? 'storagePath' : 'videoStoragePath',
});

async function needsVisualMigration(item: any, kind: 'image' | 'video'): Promise<boolean> {
    const { idField, dataField, pathField } = getMediaFields(kind);
    if (!item?.[idField] && !item?.[dataField] && !item?.[pathField]) return false;
    if (!item?.[pathField]) return true;
    return !(await MediaStorageService.isScopedToCurrentUser(item[pathField]));
}

async function resolveVisualPayload(item: any, cloudItem: any, kind: 'image' | 'video'): Promise<string | null> {
    const { idField, dataField, pathField } = getMediaFields(kind);
    const inlinePayload = item?.[dataField] || cloudItem?.[dataField];
    const inlinePayloadPath = MediaStorageService.isMediaReference(inlinePayload) ? inlinePayload : null;
    const fallbackPath = item?.[pathField] || cloudItem?.[pathField] || inlinePayloadPath;

    const mediaId = item?.[idField] || cloudItem?.[idField];
    if (mediaId) {
        const local = await StorageService.getImageLocalOnly(mediaId, inlinePayload, fallbackPath);
        if (local?.startsWith('data:')) return local;
    }

    if (typeof inlinePayload === 'string' && inlinePayload.startsWith('data:')) {
        return inlinePayload;
    }

    const paths = [fallbackPath, item?.[pathField], cloudItem?.[pathField], inlinePayloadPath].filter(Boolean);
    for (const path of paths) {
        const recovered = await MediaStorageService.downloadMedia(path);
        if (recovered?.startsWith('data:')) {
            return recovered;
        }
    }

    return null;
}

async function migrateVisualTable(table: VisualTableConfig, result: MigrationResult, onProgress?: (msg: string) => void) {
    const localItems = table.getItems();
    onProgress?.(`Auditing ${table.name}: ${localItems.length} local item(s)...`);

    let cloudRows: SupabaseRowEnvelope[] = [];
    try {
        const fetched = await SupabaseService.fetchAllRows(table.name);
        if (fetched) cloudRows = fetched;
    } catch {
        // Continue with local data only.
    }

    const cloudRowById = new Map<string, SupabaseRowEnvelope>();
    cloudRows.forEach((row) => {
        if (row?.data?.id) cloudRowById.set(row.data.id, row);
    });

    const localById = new Map<string, any>();
    localItems.forEach((item) => {
        if (item?.id) localById.set(item.id, item);
    });

    const allIds = new Set<string>([
        ...Array.from(localById.keys()),
        ...Array.from(cloudRowById.keys()),
    ]);

    for (const itemId of allIds) {
        const localItem = localById.get(itemId);
        const cloudRow = cloudRowById.get(itemId);
        const cloudItem = cloudRow?.data;
        const item = mergeItemVersions(localItem, cloudItem, cloudRow);
        if (!item?.id) continue;

        const ownerBackfilled = !localItem?.ownerUserId && !!item.ownerUserId;
        let updated = false;
        const cleanupPaths: string[] = [];

        for (const kind of ['image', 'video'] as const) {
            const { idField, dataField, pathField } = getMediaFields(kind);
            const hasMedia = !!(item[idField] || item[dataField] || item[pathField]);
            if (!hasMedia) continue;

            if (!(await needsVisualMigration(item, kind))) {
                result.skipped++;
                continue;
            }

            const payload = await resolveVisualPayload(item, cloudItem, kind);
            if (!payload) {
                result.failed++;
                onProgress?.(`Missing source payload for ${table.name}:${item.id}:${kind}`);
                continue;
            }

            const targetPath = await MediaStorageService.buildPath(table.prefix, item.id, kind, {
                coupleId: cloudRow?.couple_id,
                ownerUserId: item.ownerUserId ?? null,
                timestamp: getMediaTimestamp(item),
            });
            const uploaded = await MediaStorageService.uploadMedia(payload, targetPath);
            const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
            if (!uploaded || verified !== true) {
                result.failed++;
                onProgress?.(`Failed to upload ${table.name}:${item.id}:${kind}`);
                continue;
            }

            const previousPath = item[pathField];
            item[pathField] = uploaded;
            item[dataField] = payload;
            if (!item[idField]) {
                item[idField] = kind === 'image'
                    ? IMAGE_ID_SUFFIX(table.prefix, item.id)
                    : VIDEO_ID_SUFFIX(table.prefix, item.id);
            }

            if (previousPath && previousPath !== uploaded) {
                cleanupPaths.push(previousPath);
            }

            updated = true;
            result.migrated++;
            onProgress?.(`Migrated ${kind}: ${table.name}:${item.id}`);
        }

        if (!updated && !ownerBackfilled) continue;

        await StorageService._saveInternal(
            table.cache,
            table.storageKey,
            item,
            table.prefix,
            table.name,
            'user',
        );

        for (const path of cleanupPaths) {
            if (path && path !== item.storagePath && path !== item.videoStoragePath) {
                await MediaStorageService.deleteMedia(path);
            }
        }
    }
}

async function migrateVoiceNotes(result: MigrationResult, onProgress?: (msg: string) => void) {
    const localItems = StorageService.getVoiceNotes();
    onProgress?.(`Auditing voice_notes: ${localItems.length} local item(s)...`);

    let cloudRows: SupabaseRowEnvelope[] = [];
    try {
        const fetched = await SupabaseService.fetchAllRows('voice_notes');
        if (fetched) cloudRows = fetched;
    } catch {
        // Continue with local data only.
    }

    const cloudRowById = new Map<string, SupabaseRowEnvelope>();
    cloudRows.forEach((row) => {
        if (row?.data?.id) cloudRowById.set(row.data.id, row);
    });

    const localById = new Map<string, any>();
    localItems.forEach((item) => {
        if (item?.id) localById.set(item.id, item);
    });

    const allIds = new Set<string>([
        ...Array.from(localById.keys()),
        ...Array.from(cloudRowById.keys()),
    ]);

    for (const itemId of allIds) {
        const localItem = localById.get(itemId);
        const cloudRow = cloudRowById.get(itemId);
        const cloudItem = cloudRow?.data;
        const item = mergeItemVersions(localItem, cloudItem, cloudRow);
        if (!item?.id) continue;

        const ownerBackfilled = !localItem?.ownerUserId && !!item.ownerUserId;
        const hasAudio = !!(item.audioId || item.audioStoragePath);
        if (!hasAudio && !ownerBackfilled) continue;

        const needsMigration = hasAudio
            && (!item.audioStoragePath || !(await MediaStorageService.isScopedToCurrentUser(item.audioStoragePath)));
        let updated = false;
        let previousPath: string | undefined;

        if (needsMigration) {
            previousPath = item.audioStoragePath;
            const directAudio = await StorageService.getVoiceNoteAudio(item);
            const payload = directAudio?.startsWith('data:')
                ? directAudio
                : (previousPath ? await MediaStorageService.downloadMedia(previousPath) : null)
                    || (typeof directAudio === 'string' ? await MediaStorageService.downloadMedia(directAudio) : null);

            if (!payload) {
                result.failed++;
                onProgress?.(`Missing source payload for voice_notes:${item.id}:audio`);
                continue;
            }

            const targetPath = await MediaStorageService.buildCustomPath(item.id, 'voice-notes', 'audio', {
                coupleId: cloudRow?.couple_id,
                ownerUserId: item.ownerUserId ?? null,
                timestamp: item.createdAt,
            });
            const uploaded = await MediaStorageService.uploadMedia(payload, targetPath);
            const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
            if (!uploaded || verified !== true) {
                result.failed++;
                onProgress?.(`Failed to upload voice_notes:${item.id}:audio`);
                continue;
            }

            item.audioStoragePath = uploaded;
            updated = true;
            result.migrated++;
            onProgress?.(`Migrated audio: voice_notes:${item.id}`);
        } else {
            result.skipped++;
        }

        if (!updated && !ownerBackfilled) continue;

        await StorageService._saveInternal(
            'voiceNotes',
            'lior_voice_notes',
            item,
            'vn',
            'voice_notes',
            'user',
        );

        if (previousPath && previousPath !== item.audioStoragePath) {
            await MediaStorageService.deleteMedia(previousPath);
        }
    }
}

async function migrateTogetherMusic(result: MigrationResult, onProgress?: (msg: string) => void) {
    const localSource = await StorageService.getStoredTogetherMusicSource();
    const localMeta = StorageService.getTogetherMusicMetadata();
    const cloudRow = await SupabaseService.fetchSingleRow('together_music');
    const cloudMusic = cloudRow?.data;

    const source = localSource || cloudMusic?.music_url || cloudMusic?.music_base64;
    if (!source && !localMeta && !cloudMusic?.meta) return;

    const meta = {
        ...(cloudMusic?.meta || {}),
        ...(localMeta || {}),
        ownerUserId: localMeta?.ownerUserId || cloudMusic?.ownerUserId || cloudRow?.user_id || undefined,
    };

    const existingPath = cloudMusic?.music_url || (typeof localSource === 'string' && !localSource.startsWith('data:') ? localSource : undefined);
    const needsMigration = !!source && (!existingPath || !(await MediaStorageService.isScopedToCurrentUser(existingPath)));

    let cloudPayload: any = cloudMusic ? { ...cloudMusic, meta } : { meta, ownerUserId: meta.ownerUserId };
    let migrated = false;

    if (needsMigration) {
        const payload = typeof source === 'string' && source.startsWith('data:')
            ? source
            : (existingPath ? await MediaStorageService.downloadMedia(existingPath) : null)
                || (typeof source === 'string' ? await MediaStorageService.downloadMedia(source) : null);

        if (!payload) {
            result.failed++;
            onProgress?.('Missing source payload for together_music:singleton');
            return;
        }

        const targetPath = await MediaStorageService.buildCustomPath('singleton', 'together-music', 'track', {
            coupleId: cloudRow?.couple_id,
            ownerUserId: meta.ownerUserId ?? null,
            timestamp: meta.date,
        });
        const uploaded = await MediaStorageService.uploadMedia(payload, targetPath);
        const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
        if (!uploaded || verified !== true) {
            result.failed++;
            onProgress?.('Failed to upload together_music:singleton');
            return;
        }

        cloudPayload = {
            music_url: uploaded,
            meta,
            ownerUserId: meta.ownerUserId,
        };
        migrated = true;
        result.migrated++;
        onProgress?.('Migrated track: together_music:singleton');
    } else if (source) {
        cloudPayload = {
            music_url: existingPath || source,
            meta,
            ownerUserId: meta.ownerUserId,
        };
        result.skipped++;
    }

    if (!migrated && !meta.ownerUserId && !cloudMusic?.ownerUserId) return;

    await SupabaseService.saveSingle('together_music', cloudPayload);
    await StorageService.handleCloudUpdate('together_music', {
        data: cloudPayload,
        user_id: meta.ownerUserId || cloudRow?.user_id,
        couple_id: cloudRow?.couple_id,
    });

    if (existingPath && cloudPayload.music_url && existingPath !== cloudPayload.music_url) {
        await MediaStorageService.deleteMedia(existingPath);
    }
}

export const MediaMigrationService = {
    isMigrated(): boolean {
        return !!localStorage.getItem(MIGRATION_KEY);
    },

    async hasUnmigratedMedia(): Promise<boolean> {
        for (const table of VISUAL_MEDIA_TABLES) {
            for (const item of table.getItems()) {
                if (await needsVisualMigration(item, 'image')) return true;
                if (await needsVisualMigration(item, 'video')) return true;
            }
        }

        for (const item of StorageService.getVoiceNotes()) {
            if ((item.audioId || item.audioStoragePath)
                && (!item.audioStoragePath || !(await MediaStorageService.isScopedToCurrentUser(item.audioStoragePath)))) {
                return true;
            }
        }

        const togetherMusic = await StorageService.getStoredTogetherMusicSource();
        if (togetherMusic && !togetherMusic.startsWith('data:')
            && !(await MediaStorageService.isScopedToCurrentUser(togetherMusic))) {
            return true;
        }
        if (togetherMusic?.startsWith('data:')) {
            return true;
        }

        return false;
    },

    async migrateAll(onProgress?: (msg: string) => void): Promise<MigrationResult> {
        if (!SupabaseService.init()) {
            return { migrated: 0, skipped: 0, failed: 0 };
        }

        await MediaStorageService.ensureBucket();

        const result: MigrationResult = { migrated: 0, skipped: 0, failed: 0 };

        for (const table of VISUAL_MEDIA_TABLES) {
            await migrateVisualTable(table, result, onProgress);
        }

        await migrateVoiceNotes(result, onProgress);
        await migrateTogetherMusic(result, onProgress);

        if (result.failed === 0) {
            localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        }

        onProgress?.(`Done! Migrated: ${result.migrated}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
        return result;
    },
};
