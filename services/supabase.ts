import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

const KEYS = { URL: 'lior_sb_url', KEY: 'lior_sb_key' };
const ENV_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() || '';
let cachedUserId: string | null = null;
let cachedCoupleId: string | null = null;
let sessionLookupPromise: Promise<Session | null> | null = null;
const DELETION_LEDGER_TABLE = 'sync_deletions';

const buildTenantRowId = (tenantId: string, logicalId: string) => `${tenantId}:${logicalId}`;
const buildDeletionLedgerRowId = (tenantId: string, table: string, logicalId: string) => `${tenantId}:${table}:${logicalId}`;

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
        const { url, anonKey: key } = SupabaseService.getProjectConfig();
        if (url && key && !SupabaseService.client) {
            try {
                SupabaseService.client = createClient(url, key);
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
        cachedUserId = userId;
        if (!userId) cachedCoupleId = null;
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

        const { data, error } = await SupabaseService.client.from(table).select('*');
        if (error) return null; // Return null so we know it failed (e.g. table missing)
        if (!data) return [];
        return data.map((row: any) => row.data);
    },

    fetchAllRows: async (table: string): Promise<SupabaseRowEnvelope[] | null> => {
        if (!SupabaseService.client) return [];
        const coupleId = await SupabaseService.getCurrentCoupleId();
        if (!coupleId) return null;

        const { data, error } = await SupabaseService.client.from(table).select('*');
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

    getLinkedPartner: async (coupleId: string): Promise<{ partnerUserId: string | null } | null> => {
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

            if (error || !data || data.length === 0) return { partnerUserId: null };
            return { partnerUserId: data[0].user_id ?? null };
        } catch (e) {
            console.warn('Supabase getLinkedPartner exception:', e);
            return null;
        }
    }
};
