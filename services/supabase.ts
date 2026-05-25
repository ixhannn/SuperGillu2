import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { isE2EAppMode } from './e2eHarness';

const KEYS = { URL: 'lior_sb_url', KEY: 'lior_sb_key' };
const ENV_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() || '';
let cachedUserId: string | null = null;
let cachedCoupleId: string | null = null;
let sessionLookupPromise: Promise<Session | null> | null = null;
const DELETION_LEDGER_TABLE = 'sync_deletions';

const buildTenantRowId = (tenantId: string, logicalId: string) => `${tenantId}:${logicalId}`;
const buildDeletionLedgerRowId = (tenantId: string, table: string, logicalId: string) => `${tenantId}:${table}:${logicalId}`;
const isMissingTableError = (error: unknown, tableName: string) => {
    const candidate = error as { code?: string; message?: string };
    return candidate?.code === 'PGRST205'
        || candidate?.code === '42P01'
        || Boolean(candidate?.message?.includes(`public.${tableName}`));
};

const firstRpcRow = <T,>(data: T | T[] | null | undefined): T | null => (
    Array.isArray(data) ? data[0] ?? null : data ?? null
);

export interface SupabaseRowEnvelope<T = any> {
    id: string;
    user_id?: string | null;
    couple_id?: string | null;
    data: T;
    created_at?: string;
    updated_at?: string;
}

export interface SupabaseDeletionLedgerRow {
    id: string;
    user_id?: string | null;
    couple_id?: string | null;
    table_name: string;
    logical_id: string;
    deleted_at?: string;
    created_at?: string;
    updated_at?: string;
}

export interface PairInviteV2Row {
    code: string;
    expires_at: string;
    couple_id: string;
}

export interface PairingStatusV2Row {
    is_linked: boolean;
    couple_id: string | null;
    partner_user_id: string | null;
    partner_name: string | null;
    member_count: number;
}

export interface ClaimPairInviteV2Row {
    ok: boolean;
    error: string | null;
    couple_id: string | null;
    partner_user_id: string | null;
    partner_name: string | null;
}

export interface MediaAssetUploadInput {
    sourceTable: string;
    logicalRowId: string;
    itemId: string;
    feature: string;
    assetRole: string;
    r2Key: string;
    byteSize: number;
    mimeType: string;
    checksumSha256: string;
    ownerUserId?: string | null;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
}

export const SupabaseService = {
    client: null as SupabaseClient | null,

    getProjectConfig: () => ({
        url: ENV_URL || localStorage.getItem(KEYS.URL) || '',
        anonKey: ENV_KEY || localStorage.getItem(KEYS.KEY) || '',
    }),

    init: () => {
        if (isE2EAppMode()) {
            SupabaseService.client = null;
            return false;
        }

        const { url, anonKey: key } = SupabaseService.getProjectConfig();
        if (url && key && !SupabaseService.client) {
            try {
                SupabaseService.client = createClient(url, key, {
                    auth: {
                        // PKCE is the secure modern OAuth flow — returns a
                        // short-lived ?code= instead of putting access_token
                        // in the URL fragment. Required for native callbacks
                        // (Capacitor deep links) and recommended for web.
                        flowType: 'pkce',
                        // Supabase auto-detects the auth code in the return
                        // URL and exchanges it for a session.
                        detectSessionInUrl: true,
                        persistSession: true,
                        autoRefreshToken: true,
                    },
                });
                return true;
            } catch (e) { return false; }
        }
        return !!SupabaseService.client;
    },

    configure: (url: string, key: string) => {
        localStorage.setItem(KEYS.URL, url);
        localStorage.setItem(KEYS.KEY, key);
        SupabaseService.client = null;
        return SupabaseService.init();
    },

    isConfigured: () => (!!ENV_URL && !!ENV_KEY) || (!!localStorage.getItem(KEYS.URL) && !!localStorage.getItem(KEYS.KEY)),

    getCachedUserId: () => cachedUserId,

    setCachedUserId: (userId: string | null) => {
        const normalizedUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null;
        if (cachedUserId !== normalizedUserId) {
            cachedCoupleId = null;
        }
        cachedUserId = normalizedUserId;
        if (!normalizedUserId) cachedCoupleId = null;
    },

    getSession: async (): Promise<Session | null> => {
        if (!SupabaseService.client) return null;
        if (sessionLookupPromise) return sessionLookupPromise;

        sessionLookupPromise = (async () => {
            try {
                const { data, error } = await SupabaseService.client!.auth.getSession();
                if (error) return null;
                return data.session ?? null;
            } catch (e) {
                console.warn('Supabase session lookup failed:', e);
                return null;
            }
        })();

        try {
            return await sessionLookupPromise;
        } finally {
            sessionLookupPromise = null;
        }
    },

    getAccessToken: async (): Promise<string | null> => {
        const session = await SupabaseService.getSession();
        return session?.access_token ?? null;
    },

    getCurrentUserId: async (): Promise<string | null> => {
        if (cachedUserId) return cachedUserId;
        if (!SupabaseService.client) return null;

        try {
            const { data, error } = await SupabaseService.client.auth.getUser();
            if (error || !data.user) {
                cachedUserId = null;
                return null;
            }
            cachedUserId = data.user.id;
            return cachedUserId;
        } catch (e) {
            console.warn('Supabase user lookup failed:', e);
            cachedUserId = null;
            return null;
        }
    },

    getCurrentCoupleId: async (): Promise<string | null> => {
        if (cachedCoupleId) return cachedCoupleId;
        if (!SupabaseService.client) return null;

        try {
            const userId = await SupabaseService.getCurrentUserId();
            if (userId) {
                const { data: membershipRows, error: membershipError } = await SupabaseService.client
                    .from('couple_memberships')
                    .select('couple_id, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false });

                if (membershipError) {
                    console.warn('Supabase couple membership lookup failed:', membershipError);
                    return null;
                }

                const coupleIds = Array.from(new Set(
                    (membershipRows ?? [])
                        .map((row: any) => row?.couple_id ? String(row.couple_id) : '')
                        .filter(Boolean),
                ));

                if (coupleIds.length === 1) {
                    cachedCoupleId = coupleIds[0];
                    return cachedCoupleId;
                }

                if (coupleIds.length > 1) {
                    const { data: peerRows, error: peerError } = await SupabaseService.client
                        .from('couple_memberships')
                        .select('couple_id, user_id')
                        .in('couple_id', coupleIds);

                    if (!peerError && peerRows) {
                        const linkedCoupleIds = new Set(
                            peerRows
                                .filter((row: any) => row?.user_id && row.user_id !== userId)
                                .map((row: any) => String(row.couple_id)),
                        );
                        const linkedCoupleId = coupleIds.find((coupleId) => linkedCoupleIds.has(coupleId));
                        if (linkedCoupleId) {
                            cachedCoupleId = linkedCoupleId;
                            return cachedCoupleId;
                        }
                    }

                    cachedCoupleId = coupleIds[0];
                    return cachedCoupleId;
                }
            }

            const { data, error } = await SupabaseService.client.rpc('ensure_user_couple');
            if (error || !data) {
                console.warn('Supabase ensure_user_couple failed:', error);
                return null;
            }
            cachedCoupleId = String(data);
            return cachedCoupleId;
        } catch (e) {
            console.warn('Supabase ensure_user_couple exception:', e);
            return null;
        }
    },

    setCachedCoupleId: (coupleId: string | null) => {
        cachedCoupleId = coupleId;
    },

    getTenantRowId: async (logicalId: string) => {
        const coupleId = await SupabaseService.getCurrentCoupleId();
        return coupleId ? buildTenantRowId(coupleId, logicalId) : logicalId;
    },

    claimLegacyRows: async () => {
        if (!SupabaseService.client) return false;
        const userId = await SupabaseService.getCurrentUserId();
        if (!userId) return false;

        try {
            const { error } = await SupabaseService.client.rpc('claim_lior_legacy_rows');
            if (error) {
                console.warn('Supabase legacy row claim failed:', error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Supabase legacy row claim exception:', e);
            return false;
        }
    },

    upsertUserProfile: async (displayName: string | null | undefined): Promise<boolean> => {
        if (!SupabaseService.client) return false;
        const trimmedName = typeof displayName === 'string' ? displayName.trim() : '';
        if (!trimmedName) return false;

        try {
            const userId = await SupabaseService.getCurrentUserId();
            if (!userId) return false;

            const { error } = await SupabaseService.client.from('user_profiles').upsert({
                user_id: userId,
                display_name: trimmedName,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

            if (error) {
                if (isMissingTableError(error, 'user_profiles')) return false;
                console.warn('Supabase user profile upsert failed:', error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Supabase user profile upsert exception:', e);
            return false;
        }
    },

    // Fetch the signed-in user's OWN display name from the cloud.
    // Used on login to restore identity (myName) onto a fresh device where the
    // name was never stored locally — couple_profile sync strips myName/partnerName,
    // so this user_profiles read is the only way to recover one's own name.
    fetchOwnDisplayName: async (): Promise<string | null> => {
        if (!SupabaseService.client) return null;
        try {
            const userId = await SupabaseService.getCurrentUserId();
            if (!userId) return null;

            const { data, error } = await SupabaseService.client
                .from('user_profiles')
                .select('display_name')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                if (isMissingTableError(error, 'user_profiles')) return null;
                console.warn('Supabase fetchOwnDisplayName failed:', error);
                return null;
            }
            const name = data?.display_name ? String(data.display_name).trim() : '';
            return name || null;
        } catch (e) {
            console.warn('Supabase fetchOwnDisplayName exception:', e);
            return null;
        }
    },

    upsertItem: async (table: string, item: any) => {
        if (!SupabaseService.client) return;
        try {
            const userId = await SupabaseService.getCurrentUserId();
            const coupleId = await SupabaseService.getCurrentCoupleId();
            if (!userId || !coupleId) return;

            const { error } = await SupabaseService.client.from(table).upsert({
                id: buildTenantRowId(coupleId, item.id),
                user_id: userId,
                couple_id: coupleId,
                data: item
            });
            if (error) console.warn(`Supabase upsert failed for ${table}:`, error);
        } catch (e) {
            console.warn(`Supabase upsert exception for ${table}:`, e);
        }
    },

    recordDeletion: async (table: string, logicalId: string) => {
        if (!SupabaseService.client) return false;
        try {
            const userId = await SupabaseService.getCurrentUserId();
            const coupleId = await SupabaseService.getCurrentCoupleId();
            if (!userId || !coupleId) return false;

            const { error } = await SupabaseService.client.from(DELETION_LEDGER_TABLE).upsert({
                id: buildDeletionLedgerRowId(coupleId, table, logicalId),
                user_id: userId,
                couple_id: coupleId,
                table_name: table,
                logical_id: logicalId,
                deleted_at: new Date().toISOString(),
            });

            if (error) {
                console.warn(`Supabase deletion ledger upsert failed for ${table}:`, error);
                return false;
            }

            return true;
        } catch (e) {
            console.warn(`Supabase deletion ledger exception for ${table}:`, e);
            return false;
        }
    },

    deleteItem: async (table: string, id: string) => {
        if (!SupabaseService.client) return false;
        try {
            await SupabaseService.recordDeletion(table, id);
            const rowId = await SupabaseService.getTenantRowId(id);
            const { error } = await SupabaseService.client.from(table).delete().eq('id', rowId);
            if (error) {
                console.warn(`Supabase delete failed for ${table}:`, error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn(`Supabase delete exception for ${table}:`, e);
            return false;
        }
    },

    fetchAll: async (table: string): Promise<any[] | null> => {
        if (!SupabaseService.client) return [];
        const coupleId = await SupabaseService.getCurrentCoupleId();
        // Return null (not []) when coupleId is unknown — null tells reconcileCloud
        // to SKIP this table entirely, preventing CLOUD EMPTY PROTECTION from wiping
        // existing rows with empty local data.
        if (!coupleId) return null;

        const { data, error } = await SupabaseService.client.from(table).select('*').eq('couple_id', coupleId);
        if (error) return null; // Return null so we know it failed (e.g. table missing)
        if (!data) return [];
        return data.map((row: any) => row.data);
    },

    fetchAllRows: async (table: string): Promise<SupabaseRowEnvelope[] | null> => {
        if (!SupabaseService.client) return [];
        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!coupleId) return null;

        const { data, error } = await SupabaseService.client.from(table).select('*').eq('couple_id', coupleId);
        if (error) return null;
        return (data ?? []) as SupabaseRowEnvelope[];
    },

    fetchDeletionLedger: async (): Promise<SupabaseDeletionLedgerRow[] | null> => {
        if (!SupabaseService.client) return [];
        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!coupleId) return null;

        const { data, error } = await SupabaseService.client
            .from(DELETION_LEDGER_TABLE)
            .select('*')
            .eq('couple_id', coupleId)
            .order('deleted_at', { ascending: false });
        if (error) return null;
        return (data ?? []) as SupabaseDeletionLedgerRow[];
    },

    fetchSingle: async (table: string, id: string = 'singleton'): Promise<any | null> => {
        if (!SupabaseService.client) return null;
        const rowId = await SupabaseService.getTenantRowId(id);
        const { data, error } = await SupabaseService.client.from(table).select('*').eq('id', rowId).single();
        if (error || !data) return null;
        return data.data;
    },

    fetchSingleRow: async (table: string, id: string = 'singleton'): Promise<SupabaseRowEnvelope | null> => {
        if (!SupabaseService.client) return null;
        const rowId = await SupabaseService.getTenantRowId(id);
        const { data, error } = await SupabaseService.client.from(table).select('*').eq('id', rowId).single();
        if (error || !data) return null;
        return data as SupabaseRowEnvelope;
    },

    saveSingle: async (table: string, data: any) => {
        if (!SupabaseService.client) return;
        const userId = await SupabaseService.getCurrentUserId();
        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!userId || !coupleId) return;

        const { error } = await SupabaseService.client.from(table).upsert({
            id: buildTenantRowId(coupleId, 'singleton'),
            user_id: userId,
            couple_id: coupleId,
            data
        });
        if (error) throw error;
    },

    prepareMediaAssetUpload: async (input: MediaAssetUploadInput) => {
        if (!SupabaseService.client) return null;

        const { data, error } = await SupabaseService.client.rpc('prepare_media_asset_upload', {
            p_source_table: input.sourceTable,
            p_logical_row_id: input.logicalRowId,
            p_item_id: input.itemId,
            p_feature: input.feature,
            p_asset_role: input.assetRole,
            p_r2_key: input.r2Key,
            p_byte_size: input.byteSize,
            p_mime_type: input.mimeType,
            p_checksum_sha256: input.checksumSha256,
            p_owner_user_id: input.ownerUserId ?? null,
            p_expires_at: input.expiresAt ?? null,
            p_metadata: input.metadata ?? {},
        });
        if (error) throw error;
        return Array.isArray(data) ? data[0] ?? null : data;
    },

    recordStorageEvent: async (event: {
        eventType: string;
        severity?: 'info' | 'warning' | 'error' | 'critical';
        feature?: string | null;
        r2Key?: string | null;
        sourceTable?: string | null;
        logicalRowId?: string | null;
        metadata?: Record<string, unknown>;
    }) => {
        if (!SupabaseService.client) return;
        try {
            const { error } = await SupabaseService.client.rpc('record_storage_event', {
                p_event_type: event.eventType,
                p_severity: event.severity ?? 'info',
                p_feature: event.feature ?? null,
                p_r2_key: event.r2Key ?? null,
                p_source_table: event.sourceTable ?? null,
                p_logical_row_id: event.logicalRowId ?? null,
                p_metadata: event.metadata ?? {},
            });
            if (error) console.warn('Supabase record_storage_event failed:', error);
        } catch (e) {
            console.warn('Supabase record_storage_event exception:', e);
        }
    },

    fetchStorageConsoleSummary: async () => {
        if (!SupabaseService.client) return null;
        const { data, error } = await SupabaseService.client.rpc('storage_console_summary');
        if (error) throw error;
        return data;
    },

    fetchStorageConsoleRecentAssets: async (maxRows = 50) => {
        if (!SupabaseService.client) return [];
        const { data, error } = await SupabaseService.client.rpc('storage_console_recent_assets', { max_rows: maxRows });
        if (error) throw error;
        return data ?? [];
    },

    fetchStorageConsoleRecentAlerts: async (maxRows = 50) => {
        if (!SupabaseService.client) return [];
        const { data, error } = await SupabaseService.client.rpc('storage_console_recent_alerts', { max_rows: maxRows });
        if (error) throw error;
        return data ?? [];
    },

    fetchStorageConsoleRecentEvents: async (maxRows = 50) => {
        if (!SupabaseService.client) return [];
        const { data, error } = await SupabaseService.client.rpc('storage_console_recent_events', { max_rows: maxRows });
        if (error) throw error;
        return data ?? [];
    },

    fetchStorageConsoleMetrics: async (daysBack = 14) => {
        if (!SupabaseService.client) return [];
        const { data, error } = await SupabaseService.client.rpc('storage_console_metrics', { days_back: daysBack });
        if (error) throw error;
        return data ?? [];
    },

    createPairInviteV2: async (input: { forceRotate?: boolean; displayName?: string | null }): Promise<PairInviteV2Row | null> => {
        if (!SupabaseService.client) return null;
        try {
            const { data, error } = await SupabaseService.client.rpc('create_pair_invite_v2', {
                force_rotate: Boolean(input.forceRotate),
                display_name: input.displayName ?? null,
            });
            if (error) {
                console.warn('Supabase create_pair_invite_v2 failed:', error);
                return null;
            }
            return firstRpcRow<PairInviteV2Row>(data);
        } catch (e) {
            console.warn('Supabase create_pair_invite_v2 exception:', e);
            return null;
        }
    },

    claimPairInviteV2: async (input: { code: string; displayName?: string | null }): Promise<ClaimPairInviteV2Row | null> => {
        if (!SupabaseService.client) return null;
        try {
            const { data, error } = await SupabaseService.client.rpc('claim_pair_invite_v2', {
                invite_code: input.code,
                display_name: input.displayName ?? null,
            });
            if (error) {
                console.warn('Supabase claim_pair_invite_v2 failed:', error);
                return null;
            }
            return firstRpcRow<ClaimPairInviteV2Row>(data);
        } catch (e) {
            console.warn('Supabase claim_pair_invite_v2 exception:', e);
            return null;
        }
    },

    getPairingStatusV2: async (): Promise<PairingStatusV2Row | null> => {
        if (!SupabaseService.client) return null;
        try {
            const { data, error } = await SupabaseService.client.rpc('get_pairing_status_v2');
            if (error) {
                console.warn('Supabase get_pairing_status_v2 failed:', error);
                return null;
            }
            return firstRpcRow<PairingStatusV2Row>(data);
        } catch (e) {
            console.warn('Supabase get_pairing_status_v2 exception:', e);
            return null;
        }
    },

    backfillRowsToCouple: async (coupleId: string) => {
        if (!SupabaseService.client || !coupleId) return false;
        try {
            const { error } = await SupabaseService.client.rpc('backfill_user_rows_to_couple', { target_couple_id: coupleId });
            if (error) {
                console.warn('Supabase backfill_user_rows_to_couple failed:', error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Supabase backfill_user_rows_to_couple exception:', e);
            return false;
        }
    },

    getLinkedPartner: async (coupleId: string): Promise<{ partnerUserId: string | null; partnerName: string | null } | null> => {
        if (!SupabaseService.client || !coupleId) return null;
        const userId = await SupabaseService.getCurrentUserId();
        if (!userId) return null;

        try {
            const { data, error } = await SupabaseService.client
                .from('couple_memberships')
                .select('user_id')
                .eq('couple_id', coupleId)
                .neq('user_id', userId)
                .limit(1);

            if (error || !data || data.length === 0) return { partnerUserId: null, partnerName: null };

            const partnerUserId = data[0].user_id ? String(data[0].user_id) : null;
            if (!partnerUserId) return { partnerUserId: null, partnerName: null };

            const { data: profileData, error: profileError } = await SupabaseService.client
                .from('user_profiles')
                .select('display_name')
                .eq('user_id', partnerUserId)
                .maybeSingle();

            const partnerName = !profileError && profileData?.display_name
                ? String(profileData.display_name).trim() || null
                : null;

            return { partnerUserId, partnerName };
        } catch (e) {
            console.warn('Supabase getLinkedPartner exception:', e);
            return null;
        }
    },

    restorePairFromClaimedInvite: async (): Promise<{ coupleId: string; partnerUserId: string | null; partnerName: string | null } | null> => {
        if (!SupabaseService.client) return null;

        try {
            const { data, error } = await SupabaseService.client.rpc('restore_pair_from_claimed_invite');
            if (error) {
                const message = error.message || '';
                if (error.code === 'PGRST202' || isMissingTableError(error, 'restore_pair_from_claimed_invite') || message.includes('restore_pair_from_claimed_invite')) return null;
                console.warn('Supabase restore_pair_from_claimed_invite failed:', error);
                return null;
            }

            const row = Array.isArray(data) ? data[0] : data;
            const coupleId = row?.couple_id ? String(row.couple_id) : '';
            if (!coupleId) return null;

            return {
                coupleId,
                partnerUserId: row?.partner_user_id ? String(row.partner_user_id) : null,
                partnerName: row?.partner_name ? String(row.partner_name).trim() || null : null,
            };
        } catch (e) {
            console.warn('Supabase restore_pair_from_claimed_invite exception:', e);
            return null;
        }
    }
};
