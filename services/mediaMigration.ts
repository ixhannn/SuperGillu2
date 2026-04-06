import { StorageService } from './storage';
import { SupabaseService } from './supabase';
import { MediaStorageService } from './mediaStorage';

const MIGRATION_KEY = 'tulika_media_migrated_v2';

interface MigrationResult {
    migrated: number;
    skipped: number;
    failed: number;
}

export const MediaMigrationService = {
    isMigrated(): boolean {
        return !!localStorage.getItem(MIGRATION_KEY);
    },

    /**
     * Migrate all existing media to Supabase Storage.
     *
     * For each item with an imageId but no storagePath:
     * 1. Read base64 from IndexedDB
     * 2. If not in IndexedDB, check if cloud JSON has the image
     * 3. Upload to Supabase Storage
     * 4. Update metadata with storagePath
     *
     * Safe to run multiple times — skips already-migrated items.
     */
    async migrateAll(onProgress?: (msg: string) => void): Promise<MigrationResult> {
        if (!SupabaseService.init()) {
            return { migrated: 0, skipped: 0, failed: 0 };
        }

        await MediaStorageService.ensureBucket();

        const result: MigrationResult = { migrated: 0, skipped: 0, failed: 0 };

        const tables: { name: string; prefix: string; getItems: () => any[] }[] = [
            { name: 'memories', prefix: 'mem', getItems: () => StorageService.getMemories() },
            { name: 'daily_photos', prefix: 'daily', getItems: () => StorageService.getDailyPhotos() },
            { name: 'keepsakes', prefix: 'keep', getItems: () => StorageService.getKeepsakes() },
        ];

        for (const table of tables) {
            const items = table.getItems();
            onProgress?.(`Migrating ${table.name}: ${items.length} items...`);

            // Also fetch cloud items for this table (may have base64 we don't have locally)
            let cloudItems: any[] = [];
            try {
                const fetched = await SupabaseService.fetchAll(table.name);
                if (fetched) cloudItems = fetched;
            } catch (e) {
                // Cloud fetch failed, continue with local data
            }

            for (const item of items) {
                try {
                    let updated = false;
                    const imageNeedsScopedPath = !!item.storagePath && !(await MediaStorageService.isScopedToCurrentUser(item.storagePath));
                    const videoNeedsScopedPath = !!item.videoStoragePath && !(await MediaStorageService.isScopedToCurrentUser(item.videoStoragePath));

                    // Migrate image
                    if (item.imageId && (!item.storagePath || imageNeedsScopedPath)) {
                        const base64 = await StorageService.getImage(item.imageId);
                        // If not in local, check cloud JSON
                        const finalBase64 = base64 || findCloudBase64(cloudItems, item.id, 'image');

                        if (finalBase64 && finalBase64.startsWith('data:')) {
                            const path = await MediaStorageService.buildPath(table.prefix, item.id, 'image');
                            const uploaded = await MediaStorageService.uploadMedia(finalBase64, path);
                            if (uploaded) {
                                const previousPath = item.storagePath;
                                item.storagePath = uploaded;
                                updated = true;
                                result.migrated++;
                                onProgress?.(`Uploaded image: ${item.id}`);
                                if (previousPath && previousPath !== uploaded) {
                                    MediaStorageService.deleteMedia(previousPath);
                                }
                            } else {
                                result.failed++;
                            }
                        } else {
                            result.skipped++; // No base64 available anywhere
                        }
                    } else if (item.storagePath) {
                        result.skipped++; // Already migrated
                    }

                    // Migrate video
                    if (item.videoId && (!item.videoStoragePath || videoNeedsScopedPath)) {
                        const base64 = await StorageService.getImage(item.videoId);
                        const finalBase64 = base64 || findCloudBase64(cloudItems, item.id, 'video');

                        if (finalBase64 && finalBase64.startsWith('data:')) {
                            const path = await MediaStorageService.buildPath(table.prefix, item.id, 'video');
                            const uploaded = await MediaStorageService.uploadMedia(finalBase64, path);
                            if (uploaded) {
                                const previousPath = item.videoStoragePath;
                                item.videoStoragePath = uploaded;
                                updated = true;
                                result.migrated++;
                                if (previousPath && previousPath !== uploaded) {
                                    MediaStorageService.deleteMedia(previousPath);
                                }
                            } else {
                                result.failed++;
                            }
                        }
                    }

                    // Save updated metadata with storagePath
                    if (updated) {
                        await StorageService._saveInternal(
                            table.name === 'memories' ? 'memories' :
                                table.name === 'daily_photos' ? 'dailyPhotos' : 'keepsakes',
                            table.name === 'memories' ? 'tulika_memories' :
                                table.name === 'daily_photos' ? 'tulika_daily_photos' : 'tulika_keepsakes',
                            item, table.prefix, table.name, 'user'
                        );
                    }
                } catch (e) {
                    console.warn(`Migration failed for ${item.id}:`, e);
                    result.failed++;
                }
            }
        }

        if (result.failed === 0) {
            localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        }

        onProgress?.(`Done! Migrated: ${result.migrated}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
        return result;
    },
};

function findCloudBase64(cloudItems: any[], itemId: string, type: 'image' | 'video'): string | null {
    const cloudItem = cloudItems.find(ci => {
        const data = ci?.data || ci;
        return data?.id === itemId;
    });
    if (!cloudItem) return null;
    const data = cloudItem?.data || cloudItem;
    return type === 'video' ? (data.video || null) : (data.image || null);
}
