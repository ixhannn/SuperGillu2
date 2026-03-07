import { createClient, SupabaseClient } from '@supabase/supabase-js';

const HARDCODED_URL = 'https://zogdcuapmnbltdvqsrga.supabase.co'; 
const HARDCODED_KEY = 'sb_publishable_KRRnxuRIWdlgHbn_g65dfQ_Mzzg5Vjl'; 

const KEYS = { URL: 'tulika_sb_url', KEY: 'tulika_sb_key' };

export const SupabaseService = {
    client: null as SupabaseClient | null,

    init: () => {
        const url = HARDCODED_URL || localStorage.getItem(KEYS.URL);
        const key = HARDCODED_KEY || localStorage.getItem(KEYS.KEY);
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
        return SupabaseService.init();
    },

    isConfigured: () => (!!HARDCODED_URL && !!HARDCODED_KEY) || (!!localStorage.getItem(KEYS.URL) && !!localStorage.getItem(KEYS.KEY)),

    upsertItem: async (table: string, item: any) => {
        if (!SupabaseService.client) return;
        const { error } = await SupabaseService.client.from(table).upsert({ id: item.id, data: item });
        if (error) throw error;
    },

    deleteItem: async (table: string, id: string) => {
        if (!SupabaseService.client) return;
        const { error } = await SupabaseService.client.from(table).delete().eq('id', id);
        if (error) throw error;
    },

    fetchAll: async (table: string): Promise<any[]> => {
        if (!SupabaseService.client) return [];
        const { data, error } = await SupabaseService.client.from(table).select('*');
        if (error || !data) return [];
        return data.map((row: any) => row.data);
    },

    fetchSingle: async (table: string, id: string = 'singleton'): Promise<any | null> => {
        if (!SupabaseService.client) return null;
        const { data, error } = await SupabaseService.client.from(table).select('*').eq('id', id).single();
        if (error || !data) return null;
        return data.data;
    },

    saveSingle: async (table: string, data: any) => {
        if (!SupabaseService.client) return;
        const { error } = await SupabaseService.client.from(table).upsert({ id: 'singleton', data });
        if (error) throw error;
    }
};