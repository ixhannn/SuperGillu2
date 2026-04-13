import { createClient, SupabaseClient } from '@supabase/supabase-js';

const KEYS = { URL: 'lior_sb_url', KEY: 'lior_sb_key' };
const ENV_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() || '';
let cachedUserId: string | null = null;
let cachedCoupleId: string | null = null;

const buildTenantRowId = (tenantId: string, logicalId: string) => `${tenantId}:${logicalId}`;

export const SupabaseService = {
    client: null as SupabaseClient | null,

    init: () => {
        const url = ENV_URL || localStorage.getItem(KEYS.URL) || '';
        const key = ENV_KEY || localStorage.getItem(KEYS.KEY) || '';
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

    setCachedUserId: (userId: string | null) => {
        cachedUserId = userId;
        if (!userId) cachedCoupleId = null;
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

    deleteItem: async (table: string, id: string) => {
        if (!SupabaseService.client) return;
        try {
            const rowId = await SupabaseService.getTenantRowId(id);
            const { error } = await SupabaseService.client.from(table).delete().eq('id', rowId);
            if (error) console.warn(`Supabase delete failed for ${table}:`, error);
        } catch (e) {
            console.warn(`Supabase delete exception for ${table}:`, e);
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

    fetchSingle: async (table: string, id: string = 'singleton'): Promise<any | null> => {
        if (!SupabaseService.client) return null;
        const rowId = await SupabaseService.getTenantRowId(id);
        const { data, error } = await SupabaseService.client.from(table).select('*').eq('id', rowId).single();
        if (error || !data) return null;
        return data.data;
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
