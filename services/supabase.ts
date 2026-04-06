import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://zogdcuapmnbltdvqsrga.supabase.co';
const DEFAULT_KEY = 'sb_publishable_KRRnxuRIWdlgHbn_g65dfQ_Mzzg5Vjl';
const KEYS = { URL: 'tulika_sb_url', KEY: 'tulika_sb_key' };
const ENV_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() || '';
let cachedUserId: string | null = null;

const buildTenantRowId = (userId: string, logicalId: string) => `${userId}:${logicalId}`;

export const SupabaseService = {
    client: null as SupabaseClient | null,

    init: () => {
        const url = ENV_URL || localStorage.getItem(KEYS.URL) || DEFAULT_URL;
        const key = ENV_KEY || localStorage.getItem(KEYS.KEY) || DEFAULT_KEY;
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

    isConfigured: () => (!!ENV_URL && !!ENV_KEY) || (!!localStorage.getItem(KEYS.URL) && !!localStorage.getItem(KEYS.KEY)) || (!!DEFAULT_URL && !!DEFAULT_KEY),

    setCachedUserId: (userId: string | null) => {
        cachedUserId = userId;
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

    getTenantRowId: async (logicalId: string) => {
        const userId = await SupabaseService.getCurrentUserId();
        return userId ? buildTenantRowId(userId, logicalId) : logicalId;
    },

    claimLegacyRows: async () => {
        if (!SupabaseService.client) return false;
        const userId = await SupabaseService.getCurrentUserId();
        if (!userId) return false;

        try {
            const { error } = await SupabaseService.client.rpc('claim_tulika_legacy_rows');
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
            if (!userId) return;

            const { error } = await SupabaseService.client.from(table).upsert({
                id: buildTenantRowId(userId, item.id),
                user_id: userId,
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
        const userId = await SupabaseService.getCurrentUserId();
        if (!userId) return [];

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
        if (!userId) return;

        const { error } = await SupabaseService.client.from(table).upsert({
            id: buildTenantRowId(userId, 'singleton'),
            user_id: userId,
            data
        });
        if (error) throw error;
    }
};
