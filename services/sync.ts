import { StorageService, storageEventTarget, StorageUpdateDetail, getPendingDeletes, isDeletedLocally } from './storage';
import { SupabaseService } from './supabase';
import { MediaStorageService } from './mediaStorage';
import { MediaMigrationService } from './mediaMigration';
import { PairingService } from './pairing';
import { RealtimeChannel } from '@supabase/supabase-js';
import { isDailyMomentExpired } from '../shared/mediaRetention.js';
import { createDeletionLookup, filterUploadableItems, getRemoteDeletedIdsToPurge, hasRecordedDeletion } from './syncDeletionLedger.js';
import { runFrameBudgeted, scheduleIdleTask } from '../utils/scheduler';
import { enqueueOutbox, getOutbox, outboxSize, removeOutboxEntry } from './syncOutbox';

// Tables backed by a single shared row per couple. Their outbox dedup key is the
// table name (not a row id), since there is only ever one logical row.
const SINGLETON_TABLES = new Set(['couple_profile', 'pet_stats', 'together_music', 'our_room_state']);
// How often to run a safety-net reconcile while the app is foregrounded and
// connected. Realtime handles live updates; this only catches anything the
// socket missed (e.g. a dropped event during a brief network blip).
const PERIODIC_RECONCILE_MS = 120_000;

export const syncEventTarget = new EventTarget();

class SyncServiceClass {
    public status: string = 'Offline';
    public isConnected: boolean = false;
    public lastSyncTime: string = '';
    private channel: RealtimeChannel | null = null;
    private presenceInterval: any = null;
    private realtimeChannels: RealtimeChannel[] = [];
    private storageListener: ((e: Event) => void) | null = null;

    private isPartnerPresent = false;
    private amILeader = false;
    private activeSessionId: string | null = null;
    private reconcileInFlight: Promise<void> | null = null;
    private cancelInitialReconcile: (() => void) | null = null;

    // ── Connection health / auto-reconnect ──────────────────────────────────
    // The realtime websocket dies silently when a mobile OS backgrounds the app
    // or the network drops. Without detecting that, `isConnected` stayed true
    // forever and live updates silently stopped. These track real channel state
    // so we can flip to disconnected and rebuild the subscription.
    private channelReady = false;
    private shouldStayConnected = false;
    private reconnectTimer: any = null;
    private reconnectAttempts = 0;
    private periodicReconcileInterval: any = null;
    private resumeInFlight = false;
    private flushingOutbox = false;
    // Monotonic epoch: callbacks from a torn-down channel compare against this
    // and no-op if stale, so an old channel's CLOSED event can't trigger a
    // spurious reconnect during a normal teardown/resubscribe.
    private connectionEpoch = 0;

    private getMediaFallbackId(table: string, item: any): string {
        if (item?.imageId) return item.imageId;
        if (!item?.id) return '';
        const prefixByTable: Record<string, string> = {
            memories: 'mem',
            daily_photos: 'daily',
            keepsakes: 'keep',
            time_capsules: 'cap',
            surprises: 'surp',
            private_space_items: 'priv',
        };
        const prefix = prefixByTable[table];
        return prefix ? `${prefix}_${item.id}` : '';
    }

    private async backfillMissingCloudImagePayload(table: string, item: any): Promise<void> {
        const mediaTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'private_space_items']);
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
        // Invalidate any in-flight channel status callbacks from the channels
        // we are about to tear down so they cannot schedule a reconnect.
        this.connectionEpoch++;
        this.channelReady = false;

        this.cancelInitialReconcile?.();
        this.cancelInitialReconcile = null;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.periodicReconcileInterval) {
            clearInterval(this.periodicReconcileInterval);
            this.periodicReconcileInterval = null;
        }

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

    private scheduleInitialReconcile() {
        this.cancelInitialReconcile?.();
        this.cancelInitialReconcile = scheduleIdleTask(() => {
            this.cancelInitialReconcile = null;
            void this.reconcileCloud();
        }, { timeout: 2400, delay: 650 });
    }

    public reset() {
        // Explicit teardown (logout / not configured) — stop trying to reconnect.
        this.shouldStayConnected = false;
        this.reconnectAttempts = 0;
        this.cleanupRealtimeState();
        this.isConnected = false;
        this.status = 'Offline';
        syncEventTarget.dispatchEvent(new CustomEvent('sync-update'));
    }

    private async bootstrapProfileFromCloud() {
        const cloudProfileRows = await SupabaseService.fetchAll('couple_profile');
        if (cloudProfileRows === null) return;

        if (cloudProfileRows.length === 0) {
            const local = StorageService.getCoupleProfile();
            if (local.myName?.trim() || local.anniversaryDate?.trim() || (local.coupleId && local.partnerUserId)) {
                await SupabaseService.saveSingle('couple_profile', local);
            }
            return;
        }

        for (const cloudProfile of cloudProfileRows) {
            await StorageService.handleCloudUpdate('couple_profile', cloudProfile);
        }
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

        const localProfileBeforeCoupleLookup = StorageService.getCoupleProfile();
        // Restore the user's own identity (myName) on a fresh device. The name is
        // stored per-account in the cloud (user_profiles) but never synced via
        // couple_profile, so without this an existing account re-shows onboarding.
        if (!localProfileBeforeCoupleLookup.myName?.trim()) {
            const cloudName = await SupabaseService.fetchOwnDisplayName();
            if (cloudName) {
                StorageService.saveCoupleProfile(
                    { ...localProfileBeforeCoupleLookup, myName: cloudName },
                    'sync',
                );
            }
        } else {
            await SupabaseService.upsertUserProfile(localProfileBeforeCoupleLookup.myName);
        }
        if (localProfileBeforeCoupleLookup.coupleId && localProfileBeforeCoupleLookup.partnerUserId) {
            SupabaseService.setCachedCoupleId(localProfileBeforeCoupleLookup.coupleId);
        } else {
            SupabaseService.setCachedCoupleId(null);
        }

        // ensure_user_couple must run first so couple_memberships has a row
        // before claimLegacyRows tries to look up the couple_id
        let coupleId = await SupabaseService.getCurrentCoupleId();
        if (!coupleId) {
            this.reset();
            this.updateStatus('Offline (Couple Setup Failed)');
            return;
        }
        const pairingStatus = await PairingService.getStatus();
        if (pairingStatus?.coupleId) {
            coupleId = pairingStatus.coupleId;
            SupabaseService.setCachedCoupleId(coupleId);
        }
        await SupabaseService.claimLegacyRows();
        await SupabaseService.backfillRowsToCouple(coupleId);
        const profile = StorageService.getCoupleProfile();
        if (
            pairingStatus?.isLinked
            && pairingStatus.partnerUserId
            && (
                profile.coupleId !== coupleId
                || profile.partnerUserId !== pairingStatus.partnerUserId
                || profile.partnerName !== pairingStatus.partnerName
            )
        ) {
            StorageService.forceNewPairing(
                coupleId,
                pairingStatus.partnerUserId,
                pairingStatus.partnerName || undefined,
            );
        }
        const nextProfile = {
            ...profile,
            coupleId,
            partnerUserId: pairingStatus?.isLinked ? pairingStatus.partnerUserId || profile.partnerUserId : profile.partnerUserId,
            partnerName: pairingStatus?.isLinked ? pairingStatus.partnerName || profile.partnerName : profile.partnerName,
        };
        if (
            profile.coupleId !== nextProfile.coupleId
            || profile.partnerUserId !== nextProfile.partnerUserId
            || profile.partnerName !== nextProfile.partnerName
        ) {
            StorageService.saveCoupleProfile(nextProfile, 'sync');
        }
        await this.bootstrapProfileFromCloud();

        this.cleanupRealtimeState();
        this.isConnected = true;
        this.shouldStayConnected = true;
        this.reconnectAttempts = 0;
        this.setupRealtimeSubscription();
        this.updateStatus('Connected');
        this.lastSyncTime = new Date().toLocaleTimeString();

        // Heartbeat — presence is keyed by the stable user id (not display name)
        // so renaming yourself never makes your partner look permanently offline.
        if (this.presenceInterval) clearInterval(this.presenceInterval);
        this.presenceInterval = setInterval(() => {
            if (this.channel && this.isConnected) {
                const profile = StorageService.getCoupleProfile();
                this.channel.track({
                    user: profile.myName,
                    userId: SupabaseService.getCachedUserId() || undefined,
                    online_at: new Date().toISOString()
                });
            }
        }, 5000);

        // Safety-net reconcile: catches anything realtime missed while the app is
        // open (a dropped event, a momentary socket stall that didn't fully error).
        if (this.periodicReconcileInterval) clearInterval(this.periodicReconcileInterval);
        this.periodicReconcileInterval = setInterval(() => {
            const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
            if (this.isConnected && visible) {
                void this.reconcileCloud();
            }
        }, PERIODIC_RECONCILE_MS);

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

        // On a fresh device (empty local store) the partner's existing data,
        // media, pet levels and room live only in the cloud. Pull it down
        // immediately so logging into an existing account shows everything
        // right away. On a device that already has content, keep the deferred
        // reconcile so first paint isn't blocked.
        const hasLocalContent =
            StorageService.getMemories().length > 0
            || StorageService.getNotes().length > 0
            || StorageService.getKeepsakes().length > 0
            || StorageService.getDailyPhotos().length > 0
            || StorageService.getSpecialDates().length > 0;
        if (hasLocalContent) {
            // Reconcile cloud with protection after first paint settles.
            this.scheduleInitialReconcile();
        } else {
            void this.reconcileCloud();
        }

        // Replay any writes that were queued while offline / disconnected.
        void this.flushOutbox();
    }

    private triggerSystemNotification(detail: StorageUpdateDetail) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;

        // Don't notify during initial boot/reconciliation to avoid spam
        const profile = StorageService.getCoupleProfile();
        const partner = profile.partnerName;

        let title = "Lior";
        let body = "Something new was added!";
        let icon = "/notification-icon.png";

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
            new Notification(title, { body, icon, badge: "/notification-icon.png" });
        } catch (e) {
            // Fallback for some mobile browsers. May itself fail (no service
            // worker registered in dev) — catch so it never becomes an
            // unhandled promise rejection.
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, { body, icon, badge: "/notification-icon.png" });
            }).catch((err) => {
                console.warn('[Sync] Notification fallback failed:', err);
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

            const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'comments', 'mood_entries', 'couple_profile', 'pet_stats', 'user_status', 'together_music', 'our_room_state', 'us_bucket_items', 'us_wishlist_items', 'us_milestones', 'time_capsules', 'surprises', 'voice_notes', 'private_space_items'];
            const rowEnvelopeTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'voice_notes', 'private_space_items', 'together_music']);
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
                private_space_items: () => StorageService.getPrivateSpaceItems(),
            };
            const mediaPrefixes: Record<string, string> = {
                memories: 'mem', daily_photos: 'daily', keepsakes: 'keep',
                time_capsules: 'cap', surprises: 'surp', private_space_items: 'priv',
            };

            await runFrameBudgeted(tables, async (table) => {
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
                    if (cloudItems === null) return;

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
                                    if (!payload) return;
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
                            const myId = StorageService.getMyUserId() || profile.myName;
                            await SupabaseService.upsertItem(table, { id: myId, ...local });
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
            }, { budgetMs: 8, yieldEvery: 1 });
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

            // Safety net for the daily ritual: if realtime missed the partner's
            // answer, the periodic reconcile still surfaces the reveal. This is a
            // no-op pre-migration (daily_answers absent → getTodayPair stays local
            // and unrevealed) and self-dedupes via getDailyRevealNotified.
            await this.reconcileDailyAnswers();
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

    /** Stable outbox dedup key for a change (singletons collapse to the table). */
    private outboxIdFor(detail: StorageUpdateDetail): string {
        if (SINGLETON_TABLES.has(detail.table)) return detail.table;
        return String(detail.id ?? detail.item?.id ?? 'singleton');
    }

    /** Drop large base64 payloads before queueing; re-hydrated from local IDB at flush. */
    private stripMediaPayload(item: any): any {
        if (!item || typeof item !== 'object') return item;
        const out = { ...item };
        // Only strip when there's a reference (id / storagePath) to re-hydrate from,
        // so an inline-only data URI is preserved in the queue.
        if (out.imageId || out.storagePath) delete out.image;
        if (out.videoId || out.videoStoragePath) delete out.video;
        if (out.audioId || out.audioStoragePath) delete out.audio;
        return out;
    }

    /** Record a change for later replay when offline / disconnected / on failure. */
    private enqueueChange(detail: StorageUpdateDetail) {
        enqueueOutbox({
            table: detail.table,
            id: this.outboxIdFor(detail),
            action: detail.action === 'delete' ? 'delete' : 'save',
            item: detail.action === 'delete' ? undefined : this.stripMediaPayload(detail.item),
        });
        // Surface the pending count to the connection UI.
        syncEventTarget.dispatchEvent(new Event('sync-update'));
    }

    private async handleLocalChange(detail: StorageUpdateDetail) {
        // Durably queue first if we can't push right now — never silently drop.
        if (!this.isConnected) {
            this.enqueueChange(detail);
            return;
        }
        try {
            await this.pushChange(detail);
        } catch (e) {
            console.warn('Cloud push failed; queued for retry', e);
            this.enqueueChange(detail);
        }
    }

    /** Replay queued offline writes. Stops on the first failure to retry later. */
    private async flushOutbox(): Promise<void> {
        if (this.flushingOutbox || !this.isConnected) return;
        if (outboxSize() === 0) return;
        this.flushingOutbox = true;
        try {
            for (const entry of getOutbox()) {
                try {
                    await this.pushChange({
                        table: entry.table,
                        id: entry.id,
                        action: entry.action,
                        item: entry.item,
                        source: 'user',
                    } as StorageUpdateDetail);
                    removeOutboxEntry(entry.table, entry.id);
                } catch (e) {
                    console.warn('Outbox flush stalled; will retry', e);
                    break; // keep this and following entries for the next attempt
                }
            }
        } finally {
            this.flushingOutbox = false;
            this.lastSyncTime = new Date().toLocaleTimeString();
            syncEventTarget.dispatchEvent(new Event('sync-update'));
        }
    }

    /** Push a single change to the cloud. Throws on failure (callers may re-queue). */
    private async pushChange(detail: StorageUpdateDetail) {
        {
            if (detail.action === 'save' && detail.item) {
                if (['couple_profile', 'pet_stats', 'together_music', 'our_room_state'].includes(detail.table)) {
                    await SupabaseService.saveSingle(detail.table, detail.item);
                } else {
                    const cleanItem = { ...detail.item };

                    // Once media lives in R2, Supabase keeps metadata only.
                    // That prevents the canonical copy from drifting back into JSON rows.
                    if (cleanItem.storagePath) delete cleanItem.image;
                    if (cleanItem.videoStoragePath) delete cleanItem.video;
                    if (cleanItem.audioStoragePath) delete cleanItem.audio;

                    // Guarantee image base64 is in Supabase as a partner fallback.
                    // Only do this while an item is still pending migration to R2.
                    const mediaTables = new Set(['memories', 'daily_photos', 'keepsakes', 'time_capsules', 'surprises', 'private_space_items']);
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
                    if (mediaTables.has(detail.table) && !cleanItem.audioStoragePath && !cleanItem.audio && cleanItem.audioId) {
                        try {
                            const stored = await StorageService.getPrivateSpaceAudio(cleanItem);
                            if (stored) {
                                cleanItem.audio = stored;
                            }
                        } catch {
                            // Best-effort — cloud push continues without audio fallback
                        }
                    }

                    const ok = await SupabaseService.upsertItem(detail.table, cleanItem);
                    if (ok === false) throw new Error(`upsert failed for ${detail.table}`);
                }
            } else if (detail.action === 'delete') {
                const ok = await SupabaseService.deleteItem(detail.table, detail.id);
                if (ok === false) throw new Error(`delete failed for ${detail.table}`);
                // Intentionally NOT calling removePendingDelete — tombstone stays forever
            }
            this.lastSyncTime = new Date().toLocaleTimeString();
            syncEventTarget.dispatchEvent(new Event('sync-update'));
        }
    }

    // ── Connection health, reconnect & resume ───────────────────────────────
    private handleChannelStatus(status: string) {
        if (status === 'SUBSCRIBED') {
            this.channelReady = true;
            this.reconnectAttempts = 0;
            if (!this.isConnected) {
                this.isConnected = true;
                this.updateStatus('Connected');
            }
            // We're live again — drain anything queued while we were down.
            void this.flushOutbox();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.channelReady = false;
            if (this.isConnected) {
                this.isConnected = false;
                this.updateStatus('Reconnecting…');
            }
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        // Only auto-reconnect for an unexpected drop, never after an explicit reset.
        if (!this.shouldStayConnected) return;
        if (this.reconnectTimer) return;
        // Exponential backoff, capped at 30s.
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts, 5));
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.reconnect();
        }, delay);
    }

    private async reconnect() {
        if (!this.shouldStayConnected) return;
        if (!SupabaseService.init()) return;
        const profile = StorageService.getCoupleProfile();
        if (!profile.coupleId) return;

        // Tear down the dead channels (this bumps the epoch, invalidating their
        // stale status callbacks) and build a fresh subscription.
        this.realtimeChannels.forEach((channel) => {
            try { channel.unsubscribe(); } catch { /* already gone */ }
        });
        this.realtimeChannels = [];
        this.channel = null;
        this.connectionEpoch++;
        this.setupRealtimeSubscription();

        // Pull anything missed while the socket was down, then flush queued writes.
        await this.reconcileCloud();
        await this.flushOutbox();
    }

    /**
     * Called when the app returns to the foreground or the network comes back.
     * The realtime socket is routinely killed while backgrounded, so we rebuild
     * it if it isn't healthy, then reconcile and flush queued writes. This is the
     * fix for "the app feels stale after reopening / switching devices".
     */
    public async resume() {
        if (!SupabaseService.init()) return;
        if (this.resumeInFlight) return;
        this.resumeInFlight = true;
        try {
            const profile = StorageService.getCoupleProfile();
            if (!profile.coupleId) return; // not set up yet — normal init will handle it
            this.shouldStayConnected = true;
            // Trust the channel's real state, not just our flag: a backgrounded
            // OS often kills the socket without firing CHANNEL_ERROR, leaving a
            // "zombie" channel that still reports ready. If it isn't genuinely
            // joined, rebuild it; otherwise just catch up + drain the outbox.
            const channelAlive = !!this.channel
                && (this.channel as any).state === 'joined'
                && this.channelReady;
            if (!channelAlive) {
                await this.reconnect();
            } else {
                await this.reconcileCloud();
                await this.flushOutbox();
            }
        } finally {
            this.resumeInFlight = false;
        }
    }

    private setupRealtimeSubscription() {
        if (!SupabaseService.client) return;
        const profile = StorageService.getCoupleProfile();
        const coupleId = profile.coupleId;
        if (!coupleId) return;

        const epoch = this.connectionEpoch;

        this.channel = SupabaseService.client
            .channel(`lior_room:${coupleId}`)
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
            .subscribe((status) => {
                // Ignore status from a channel we've already torn down.
                if (epoch !== this.connectionEpoch) return;
                this.handleChannelStatus(status);
            });
        this.realtimeChannels.push(this.channel);

        const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'comments', 'mood_entries', 'couple_profile', 'pet_stats', 'user_status', 'together_music', 'our_room_state', 'us_bucket_items', 'us_wishlist_items', 'us_milestones', 'time_capsules', 'surprises', 'voice_notes', 'private_space_items'];
        tables.forEach(table => {
            const tableChannel = SupabaseService.client?.channel(`public:${table}`)
                .on('postgres_changes', { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` }, (payload) => {
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_deletions', filter: `couple_id=eq.${coupleId}` }, (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
                const table = payload.new?.table_name;
                const logicalId = payload.new?.logical_id;
                if (table && logicalId) {
                    StorageService.handleCloudDelete(table, logicalId);
                }
            })
            .subscribe();
        if (deletionChannel) this.realtimeChannels.push(deletionChannel);

        // daily_answers is NOT a {couple_id, data} collection table (flat columns,
        // sealed-reveal RLS), so it must NOT route through handleCloudUpdate. A
        // partner's freshly-inserted row arrives here; we just nudge the ritual UI
        // to re-read through the sealed-reveal service (getTodayPair), which does
        // the gating. Guarded: if the table/publication is absent the subscribe is
        // a harmless no-op (no rows ever arrive). See migration 20260612000000.
        const dailyAnswersChannel = SupabaseService.client?.channel(`public:daily_answers:${coupleId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_answers', filter: `couple_id=eq.${coupleId}` }, (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
                const promptDate = (payload.new as { prompt_date?: string } | undefined)?.prompt_date;
                void this.onDailyAnswerChange(promptDate);
            })
            .subscribe();
        if (dailyAnswersChannel) this.realtimeChannels.push(dailyAnswersChannel);
    }

    // Reconcile-cadence pull for the daily ritual (realtime safety net). Re-reads
    // through the sealed-reveal service and, if today is now revealed, drives the
    // same UI-nudge + local-notification path as the realtime handler. Idempotent
    // (getDailyRevealNotified de-dupes) and fully guarded — never throws.
    private async reconcileDailyAnswers() {
        try {
            const profile = StorageService.getCoupleProfile();
            if (!profile?.myName || !profile?.partnerName) return;
            const { getTodayPair } = await import('./dailyRitual');
            const pair = await getTodayPair({ myName: profile.myName, partnerName: profile.partnerName });
            // Only act on a genuine cloud-backed reveal that the UI may not have
            // seen yet; the local fallback path already covers same-device answers.
            if (pair.source !== 'cloud' || !pair.revealed) return;
            if (StorageService.getDailyRevealNotified() === pair.date) return;
            await this.onDailyAnswerChange(pair.date);
        } catch {
            /* best-effort — a missing table just means nothing to reconcile */
        }
    }

    // A daily_answers row changed (partner answered, or a backfilled own row).
    // Tell the ritual UI to re-read through the sealed-reveal service, and — when
    // the pair just COMPLETED today and a server push can't reach this device —
    // raise a local notification so the loop closes without server push.
    private async onDailyAnswerChange(promptDate?: string) {
        // Always nudge the UI: getTodayPair is sealed-reveal-gated, so this never
        // leaks a partner answer early; it just refreshes if the seal is open.
        syncEventTarget.dispatchEvent(new CustomEvent('daily-answers-update', { detail: { promptDate } }));
        await this.maybeNotifyDailyReveal();
    }

    // Local-notification fallback for the daily reveal. Only fires when:
    //   - today's pair is genuinely revealed (both answered) per the sealed
    //     service, AND we haven't already notified for this day, AND
    //   - a server push can't be delivered from here (pushBackendAvailable=false),
    //     so a push would no-op and the partner's device would otherwise stay
    //     silent.
    // Best-effort and fully guarded — never throws, no-ops pre-migration.
    private async maybeNotifyDailyReveal() {
        try {
            const profile = StorageService.getCoupleProfile();
            if (!profile?.myName || !profile?.partnerName) return;

            // Lazy imports mirror the dailyRitual pattern: keep the notification +
            // toast modules out of the eager sync graph and dodge any import cycle.
            const [{ getTodayPair }, { NotificationsService }, { toast }] = await Promise.all([
                import('./dailyRitual'),
                import('./notifications'),
                import('../utils/toast'),
            ]);
            const pair = await getTodayPair({ myName: profile.myName, partnerName: profile.partnerName });
            if (!pair.revealed) return;

            // De-dupe per calendar day so a re-subscribe / reconcile can't re-fire.
            if (StorageService.getDailyRevealNotified() === pair.date) return;

            // If a server push can reach this couple, let it own the alert to avoid
            // a double notification; only step in when push is a guaranteed no-op.
            const pushUp = await NotificationsService.pushBackendAvailable();
            StorageService.setDailyRevealNotified(pair.date);

            // In-app toast always (the foreground signal). The DailyQuestion card
            // also celebrates on its own re-read; this covers the case where the
            // user is elsewhere in the app when the partner answers.
            toast.show('Your story grew — today’s answers are in', 'heart');

            if (!pushUp) {
                await NotificationsService.fireImmediate(
                    'Today’s question is complete',
                    `${profile.partnerName} answered too — see what you both wrote.`,
                    'daily-ritual',
                );
            }
        } catch {
            /* best-effort — never break sync over a notification */
        }
    }

    private handlePresenceUpdate(state: any, profile: any) {
        const myUserId = SupabaseService.getCachedUserId();
        const partnerUserId = profile.partnerUserId as string | undefined;
        let partnerFound = false;
        // Identity tokens for stable leader election: prefer user id, fall back
        // to display name for clients that predate userId presence payloads.
        const identities: string[] = [];
        if (state) {
            Object.values(state).forEach((presences: any) => {
                presences.forEach((p: any) => {
                    identities.push(p.userId || p.user);
                    const isPartnerById = partnerUserId && p.userId === partnerUserId;
                    const isPartnerByName = !p.userId && p.user === profile.partnerName;
                    if (isPartnerById || isPartnerByName) partnerFound = true;
                });
            });
        }
        this.isPartnerPresent = partnerFound;
        const sortedIdentities = [...identities].sort();
        const myIdentity = myUserId || profile.myName;
        this.amILeader = sortedIdentities[0] === myIdentity;
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
