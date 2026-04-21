import { StorageService, storageEventTarget, StorageUpdateDetail, getPendingDeletes, isDeletedLocally } from './storage';
import { SupabaseService } from './supabase';
import { MediaStorageService } from './mediaStorage';
import { MediaMigrationService } from './mediaMigration';
import { RealtimeChannel } from '@supabase/supabase-js';
import { isDailyMomentExpired } from '../shared/mediaRetention.js';
import { createDeletionLookup, filterUploadableItems, getRemoteDeletedIdsToPurge, hasRecordedDeletion } from './syncDeletionLedger.js';

export const syncEventTarget = new EventTarget();

class SyncServiceClass {
    public status: string = 'Offline';
    public isConnected: boolean = false;
    public lastSyncTime: string = '';
    private channel: RealtimeChannel | null = null;
    private ROOM_ID = 'lior_global_room';
    private presenceInterval: any = null;
    private realtimeChannels: RealtimeChannel[] = [];
    private storageListener: ((e: Event) => void) | null = null;

    private isPartnerPresent = false;
    private amILeader = false;
    private activeSessionId: string | null = null;
    private reconcileInFlight: Promise<void> | null = null;

    private getMediaFallbackId(table: string, item: any): string {
        if (item?.imageId) return item.imageId;
        if (!item?.id) return '';
        const prefixByTable: Record<string, string> = {
            memories: 'mem',
            daily_photos: 'daily',
            keepsakes: 'keep',
            time_capsules: 'cap',
            surprises: 'surp',
        };
        const prefix = prefixByTable[table];
        return prefix ? `${prefix}_${item.id}` : '';
    }

    private async backfillMissingCloudImagePayload(table: string, item: any): Promise<void> {
        const mediaTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises']);
        if (!mediaTables.has(table) || !item?.id || item.image || item.storagePath) return;
        if (table === 'daily_photos' && isDailyMomentExpired(item)) return;

        const mediaId = this.getMediaFallbackId(table, item);
        if (!mediaId) return;

        try {
            const localImage = await StorageService.getImageLocalOnly(mediaId);
            if (!localImage) return;
            await SupabaseService.upsertItem(table, { ...item, image: localImage, imageId: mediaId });
        } catch {
            // Best-effort cloud healing.
        }
    }

    private cleanupRealtimeState() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }

        if (this.storageListener) {
            storageEventTarget.removeEventListener('storage-update', this.storageListener);
            this.storageListener = null;
        }

        this.realtimeChannels.forEach((channel) => {
            try {
                channel.unsubscribe();
            } catch (e) {
                console.warn('Channel unsubscribe failed', e);
            }
        });
        this.realtimeChannels = [];
        this.channel = null;
    }

    public reset() {
        this.cleanupRealtimeState();
        this.isConnected = false;
        this.status = 'Offline';
        syncEventTarget.dispatchEvent(new CustomEvent('sync-update'));
    }

    public async init() {
        if (!SupabaseService.init()) {
            this.reset();
            this.updateStatus('Offline (Not Configured)');
            return;
        }

        const userId = await SupabaseService.getCurrentUserId();
        if (!userId) {
            this.reset();
            this.updateStatus('Offline (Login Required)');
            return;
        }

        // ensure_user_couple must run first so couple_memberships has a row
        // before claimLegacyRows tries to look up the couple_id
        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!coupleId) {
            this.reset();
            this.updateStatus('Offline (Couple Setup Failed)');
            return;
        }
        await SupabaseService.claimLegacyRows();
        await SupabaseService.backfillRowsToCouple(coupleId);
        const profile = StorageService.getCoupleProfile();
        const linked = await SupabaseService.getLinkedPartner(coupleId);
        const nextProfile = {
            ...profile,
            coupleId,
            partnerUserId: linked?.partnerUserId || profile.partnerUserId,
        };
        if (profile.coupleId !== nextProfile.coupleId || profile.partnerUserId !== nextProfile.partnerUserId) {
            StorageService.saveCoupleProfile(nextProfile, 'sync');
        }

        this.cleanupRealtimeState();
        this.isConnected = true;
        this.setupRealtimeSubscription();
        this.updateStatus('Connected');
        this.lastSyncTime = new Date().toLocaleTimeString();

        // Heartbeat
        if (this.presenceInterval) clearInterval(this.presenceInterval);
        this.presenceInterval = setInterval(() => {
            if (this.channel && this.isConnected) {
                const profile = StorageService.getCoupleProfile();
                this.channel.track({
                    user: profile.myName,
                    online_at: new Date().toISOString()
                });
            }
        }, 5000);

        // BIND LOCAL CHANGES TO CLOUD PUSH
        this.storageListener = (e: Event) => {
            const detail = (e as any).detail as StorageUpdateDetail;
            if (detail.source === 'user') {
                this.handleLocalChange(detail);
            } else if (detail.source === 'sync' && detail.action === 'save') {
                // NOTIFICATION TRIGGER: Only for synced items from partner
                this.triggerSystemNotification(detail);
            }
        };
        storageEventTarget.addEventListener('storage-update', this.storageListener);

        // Reconcile cloud with protection
        this.reconcileCloud();
    }

    private triggerSystemNotification(detail: StorageUpdateDetail) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        // Don't notify during initial boot/reconciliation to avoid spam
        const profile = StorageService.getCoupleProfile();
        const partner = profile.partnerName;

        let title = "Lior";
        let body = "Something new was added!";
        let icon = "/icon.svg";

        switch (detail.table) {
            case 'memories':
                body = `${partner} shared a new memory in your timeline. ❤️`;
                break;
            case 'daily_photos':
                body = `New Moment! ${partner} posted a disappearing photo. 📸`;
                break;
            case 'envelopes':
                body = `You have a new "Open When" letter from ${partner}. 💌`;
                break;
            case 'notes':
                body = `${partner} left you a love note. 📝`;
                break;
            case 'keepsakes':
                body = `A special gift just arrived in your Keepsake Box! 🎁`;
                break;
            case 'comments':
                body = `${partner} left a comment on a moment. 💬`;
                break;
            case 'dates':
                body = `${partner} added a new landmark in Downtown. 🏙️`;
                break;
            case 'time_capsules':
                body = `${partner} sealed a Time Capsule for you. 💌`;
                break;
            case 'surprises':
                body = `${partner} planned a surprise for you! 🎉`;
                break;
            case 'voice_notes':
                body = `${partner} sent you a voice note. 🎙️`;
                break;
            default:
                return; // Don't notify for profile/status/init/etc
        }

        // Avoid notifying if the app is currently open and active in the foreground
        if (document.visibilityState === 'visible') return;

        try {
            new Notification(title, { body, icon, badge: "/icon.svg" });
        } catch (e) {
            // Fallback for some mobile browsers
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, { body, icon, badge: "/icon.svg" });
            });
        }
    }

    private async reconcileCloud() {
        if (this.reconcileInFlight) {
            return this.reconcileInFlight;
        }

        this.reconcileInFlight = (async () => {
        try {
            await StorageService.cleanupDailyPhotos();
            const deletionLookup = createDeletionLookup(await SupabaseService.fetchDeletionLedger() ?? []);

            // Re-send any deletions that may have failed previously (offline, crash, etc.)
            // Tombstones are NEVER removed — they permanently block resurrection from partner's cache
            const pending = getPendingDeletes();
            for (const { table, id } of pending) {
                try {
                    await SupabaseService.deleteItem(table, id);
                    // Intentionally NOT calling removePendingDelete — tombstone stays forever
                } catch {
                    // Keep in queue — will retry next reconcile
                }
            }

            const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'comments', 'mood_entries', 'couple_profile', 'pet_stats', 'user_status', 'together_music', 'our_room_state', 'us_bucket_items', 'us_wishlist_items', 'us_milestones', 'time_capsules', 'surprises', 'voice_notes'];
            const rowEnvelopeTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'voice_notes', 'together_music']);
            const localCollectionAccessors: Record<string, () => any[]> = {
                memories: () => StorageService.getMemories(),
                notes: () => StorageService.getNotes(),
                dates: () => StorageService.getSpecialDates(),
                envelopes: () => StorageService.getEnvelopes(),
                daily_photos: () => StorageService.getDailyPhotos(),
                keepsakes: () => StorageService.getKeepsakes(),
                dinner_options: () => StorageService.getDinnerOptions(),
                comments: () => StorageService.getComments(),
                mood_entries: () => StorageService.getMoodEntries(),
                us_bucket_items: () => StorageService.getUsBucketItems(),
                us_wishlist_items: () => StorageService.getUsWishlistItems(),
                us_milestones: () => StorageService.getUsMilestones(),
                time_capsules: () => StorageService.getTimeCapsules(),
                surprises: () => StorageService.getSurprises(),
                voice_notes: () => StorageService.getVoiceNotes(),
            };
            const mediaPrefixes: Record<string, string> = {
                memories: 'mem', daily_photos: 'daily', keepsakes: 'keep',
                time_capsules: 'cap', surprises: 'surp',
            };

            for (const table of tables) {
                try {
                    const getLocalItems = localCollectionAccessors[table];
                    const localItems = getLocalItems ? getLocalItems() : [];
                    for (const deletedId of getRemoteDeletedIdsToPurge(localItems, table, deletionLookup)) {
                        await StorageService.handleCloudDelete(table, deletedId);
                    }

                    const cloudItems = rowEnvelopeTables.has(table)
                        ? await SupabaseService.fetchAllRows(table)
                        : await SupabaseService.fetchAll(table);
                    // Null signifies a fetch error, meaning the table likely doesn't exist
                    if (cloudItems === null) continue;

                    if (cloudItems.length === 0) {
                        // CLOUD EMPTY PROTECTION: Push local data to cloud instead of pulling
                        if (table === 'couple_profile') {
                            const local = StorageService.getCoupleProfile();
                            await SupabaseService.saveSingle(table, local);
                        } else if (table === 'pet_stats') {
                            const local = StorageService.getPetStats();
                            await SupabaseService.saveSingle(table, local);
                        } else if (table === 'together_music') {
                            const local = await StorageService.getStoredTogetherMusicSource();
                            const meta = StorageService.getTogetherMusicMetadata();
                            if (local) {
                                const needsMigration = local.startsWith('data:')
                                    || !(await MediaStorageService.isScopedToCurrentUser(local));
                                if (needsMigration) {
                                    // base64 still in IDB — upload to R2 first
                                    const payload = local.startsWith('data:')
                                        ? local
                                        : await MediaStorageService.downloadMedia(local);
                                    if (!payload) continue;
                                    const path = await MediaStorageService.buildCustomPath('singleton', 'together-music', 'track', {
                                        ownerUserId: meta?.ownerUserId,
                                        timestamp: meta?.date,
                                    });
                                    const uploaded = await MediaStorageService.uploadMedia(payload, path);
                                    const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
                                    const cloudPayload = uploaded
                                        && verified === true
                                        ? { music_url: uploaded, meta, ownerUserId: meta?.ownerUserId }
                                        : { music_base64: payload, meta, ownerUserId: meta?.ownerUserId };
                                    await SupabaseService.saveSingle(table, cloudPayload);
                                } else {
                                    await SupabaseService.saveSingle(table, { music_url: local, meta, ownerUserId: meta?.ownerUserId });
                                }
                            }
                        } else if (table === 'our_room_state') {
                            const local = StorageService.getCoupleRoomState();
                            await SupabaseService.saveSingle(table, local);
                        } else if (table === 'user_status') {
                            const local = StorageService.getStatus();
                            const profile = StorageService.getCoupleProfile();
                            await SupabaseService.upsertItem(table, { id: profile.myName, ...local });
                        } else {
                            const uploadableItems = filterUploadableItems(localItems, table, deletionLookup, isDeletedLocally);
                            for (const it of uploadableItems) {
                                const toUpload = mediaPrefixes[table]
                                    ? await StorageService._getItemWithImages(it, mediaPrefixes[table])
                                    : it;
                                await SupabaseService.upsertItem(table, toUpload);
                            }
                        }
                    } else {
                        // CLOUD HAS DATA: Pull it down, skipping locally-deleted items
                        for (const item of cloudItems) {
                            const logicalId = item?.data?.id || item?.id;
                            if (logicalId && hasRecordedDeletion(deletionLookup, table, logicalId)) {
                                await StorageService.handleCloudDelete(table, logicalId);
                                await SupabaseService.deleteItem(table, logicalId);
                                continue;
                            }
                            if (logicalId && isDeletedLocally(table, logicalId)) {
                                // Re-send delete to cloud in case it didn't go through
                                await SupabaseService.deleteItem(table, logicalId);
                                // Intentionally NOT calling removePendingDelete — tombstone stays forever
                                continue;
                            }
                            await StorageService.handleCloudUpdate(table, item);
                            await this.backfillMissingCloudImagePayload(table, item?.data ?? item);
                        }
                    }
                } catch (tableError) {
                    console.warn(`Sync skipped for table ${table}:`, tableError);
                }
            }
            this.updateStatus('Cloud Synced');

            // Ensure Storage bucket exists
            await MediaStorageService.ensureBucket();

            // Auto-migrate existing base64 data to Supabase Storage.
            // Also runs when new content is added that doesn't have a storagePath yet.
            if (!MediaMigrationService.isMigrated() || await MediaMigrationService.hasUnmigratedMedia()) {
                this.updateStatus('Migrating media...');
                await MediaMigrationService.migrateAll();
                this.updateStatus('Cloud Synced');
            }

            // Retry any R2 uploads that failed in a previous session
            // (e.g. user was offline when they saved a memory)
            await StorageService.retryPendingUploads();

            // Rebuild any missing local media cache from the latest cloud metadata
            // so blank cards heal during normal sync, not only on specific screens.
            await StorageService.recoverImagesFromCloud();
        } catch (e) {
            console.warn("Reconciliation failed", e);
        } finally {
            this.reconcileInFlight = null;
        }
        })();

        return this.reconcileInFlight;
    }

    public async refreshFromCloud() {
        if (!SupabaseService.init()) {
            this.updateStatus('Offline (Not Configured)');
            return;
        }

        this.updateStatus('Refreshing from Cloud...');
        await this.reconcileCloud();
        this.lastSyncTime = new Date().toLocaleTimeString();
        syncEventTarget.dispatchEvent(new Event('sync-update'));
    }

    private async handleLocalChange(detail: StorageUpdateDetail) {
        if (!this.isConnected) return;
        try {
            if (detail.action === 'save' && detail.item) {
                if (['couple_profile', 'pet_stats', 'together_music', 'our_room_state'].includes(detail.table)) {
                    await SupabaseService.saveSingle(detail.table, detail.item);
                } else {
                    const cleanItem = { ...detail.item };

                    // Once media lives in R2, Supabase keeps metadata only.
                    // That prevents the canonical copy from drifting back into JSON rows.
                    if (cleanItem.storagePath) delete cleanItem.image;
                    if (cleanItem.videoStoragePath) delete cleanItem.video;

                    // Guarantee image base64 is in Supabase as a partner fallback.
                    // Only do this while an item is still pending migration to R2.
                    const mediaTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises']);
                    if (mediaTables.has(detail.table) && !cleanItem.storagePath && !cleanItem.image && cleanItem.imageId) {
                        try {
                            const stored = await StorageService.getImageLocalOnly(cleanItem.imageId);
                            if (stored) {
                                cleanItem.image = stored;
                            }
                        } catch {
                            // Best-effort — cloud push continues without image fallback
                        }
                    }
                    if (mediaTables.has(detail.table) && !cleanItem.videoStoragePath && !cleanItem.video && cleanItem.videoId) {
                        try {
                            const stored = await StorageService.getImageLocalOnly(cleanItem.videoId);
                            if (stored) {
                                cleanItem.video = stored;
                            }
                        } catch {
                            // Best-effort — cloud push continues without video fallback
                        }
                    }

                    await SupabaseService.upsertItem(detail.table, cleanItem);
                }
            } else if (detail.action === 'delete') {
                await SupabaseService.deleteItem(detail.table, detail.id);
                // Intentionally NOT calling removePendingDelete — tombstone stays forever
            }
            this.lastSyncTime = new Date().toLocaleTimeString();
            syncEventTarget.dispatchEvent(new Event('sync-update'));
        } catch (e) {
            console.error("Cloud push failed", e);
        }
    }

    private setupRealtimeSubscription() {
        if (!SupabaseService.client) return;
        const profile = StorageService.getCoupleProfile();

        this.channel = SupabaseService.client
            .channel(this.ROOM_ID)
            .on('presence', { event: 'sync' }, () => {
                const state = this.channel?.presenceState();
                this.handlePresenceUpdate(state, profile);
            })
            .on('broadcast', { event: 'session_start' }, (payload) => {
                this.handleIncomingSession(payload.payload);
            })
            .on('broadcast', { event: 'signal' }, (payload) => {
                syncEventTarget.dispatchEvent(new CustomEvent('signal-received', { detail: payload.payload }));
            })
            .subscribe();
        this.realtimeChannels.push(this.channel);

        const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'comments', 'mood_entries', 'couple_profile', 'pet_stats', 'user_status', 'together_music', 'our_room_state', 'us_bucket_items', 'us_wishlist_items', 'us_milestones', 'time_capsules', 'surprises', 'voice_notes'];
        tables.forEach(table => {
            const tableChannel = SupabaseService.client?.channel(`public:${table}`)
                .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const logicalId = payload.new?.data?.id || payload.new?.id;
                        // Skip if locally tombstoned — the delete is still propagating to cloud
                        if (logicalId && isDeletedLocally(table, logicalId)) return;
                        StorageService.handleCloudUpdate(table, payload.new);
                    } else if (payload.eventType === 'DELETE') {
                        const rawId = payload.old?.data?.id || payload.old?.id;
                        const logicalId = (typeof rawId === 'string' && rawId.includes(':'))
                            ? rawId.slice(rawId.indexOf(':') + 1)
                            : rawId;
                        if (logicalId) StorageService.handleCloudDelete(table, logicalId);
                    }
                })
                .subscribe();
            if (tableChannel) this.realtimeChannels.push(tableChannel);
        });

        const deletionChannel = SupabaseService.client?.channel('public:sync_deletions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_deletions' }, (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
                const table = payload.new?.table_name;
                const logicalId = payload.new?.logical_id;
                if (table && logicalId) {
                    StorageService.handleCloudDelete(table, logicalId);
                }
            })
            .subscribe();
        if (deletionChannel) this.realtimeChannels.push(deletionChannel);
    }

    private handlePresenceUpdate(state: any, profile: any) {
        let partnerFound = false;
        const users: string[] = [];
        if (state) {
            Object.values(state).forEach((presences: any) => {
                presences.forEach((p: any) => {
                    users.push(p.user);
                    if (p.user === profile.partnerName) partnerFound = true;
                });
            });
        }
        this.isPartnerPresent = partnerFound;
        const sortedUsers = users.sort();
        this.amILeader = sortedUsers[0] === profile.myName;
        if (this.isPartnerPresent && this.amILeader) {
            this.initiateSession();
        } else if (!this.isPartnerPresent) {
            this.endSession();
        }
        syncEventTarget.dispatchEvent(new CustomEvent('presence-update', { detail: state }));
    }

    private initiateSession() {
        if (this.activeSessionId) return;
        const sessionId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        this.activeSessionId = sessionId;
        this.channel?.send({
            type: 'broadcast',
            event: 'session_start',
            payload: { sessionId, startTime, track: 'together_theme' }
        });
        this.handleIncomingSession({ sessionId, startTime });
    }

    private handleIncomingSession(data: any) {
        this.activeSessionId = data.sessionId;
        syncEventTarget.dispatchEvent(new CustomEvent('together-session-start', { detail: data }));
    }

    private endSession() {
        if (!this.activeSessionId) return;
        this.activeSessionId = null;
        syncEventTarget.dispatchEvent(new Event('together-session-end'));
    }

    public sendSignal(type: string, payload?: any) {
        if (!this.isConnected || !this.channel) return;
        const msg = { signalType: type, payload, timestamp: new Date().toISOString() };
        this.channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: msg
        });

        // Offline Inbox
        if (type === 'AURA_SIGNAL') {
            StorageService.addMissedAura(payload);
        }
    }

    private updateStatus(msg: string) {
        this.status = msg;
        syncEventTarget.dispatchEvent(new Event('sync-update'));
    }
}

export const SyncService = new SyncServiceClass();
