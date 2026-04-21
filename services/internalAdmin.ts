import { SupabaseService } from './supabase';

const ADMIN_OVERRIDE_KEY = 'lior_internal_admin_override';
const ADMIN_EMAILS = String(import.meta.env.VITE_INTERNAL_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
const ADMIN_USER_IDS = String(import.meta.env.VITE_INTERNAL_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

let cachedDecision: boolean | null = null;

const hasOverride = () => localStorage.getItem(ADMIN_OVERRIDE_KEY) === 'true';

export const InternalAdminService = {
    isOverrideEnabled(): boolean {
        return hasOverride();
    },

    setOverride(enabled: boolean) {
        if (enabled) localStorage.setItem(ADMIN_OVERRIDE_KEY, 'true');
        else localStorage.removeItem(ADMIN_OVERRIDE_KEY);
        cachedDecision = null;
    },

    async isAllowed(): Promise<boolean> {
        if (import.meta.env.DEV || hasOverride()) return true;
        if (cachedDecision !== null) return cachedDecision;
        if (!SupabaseService.init() || !SupabaseService.client) {
            cachedDecision = false;
            return false;
        }

        try {
            const { data, error } = await SupabaseService.client.auth.getUser();
            if (error || !data.user) {
                cachedDecision = false;
                return false;
            }

            const email = String(data.user.email || '').trim().toLowerCase();
            const userId = String(data.user.id || '').trim();
            cachedDecision = ADMIN_EMAILS.includes(email) || ADMIN_USER_IDS.includes(userId);
            return cachedDecision;
        } catch {
            cachedDecision = false;
            return false;
        }
    },
};
