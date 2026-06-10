import { SupabaseService } from './supabase';

// UI gating for internal-only screens (storage console, profile admin row).
//
// SECURITY NOTE: this check runs in the browser, so it can only ever hide UI —
// it must never be the sole guard for a privileged operation. Every privileged
// action must also be enforced server-side (Supabase RLS / worker admin token).
// The previous implementation had two client-side bypasses (a blanket
// `import.meta.env.DEV` allow and a localStorage override toggle); both were
// removed because either one let any user unlock the admin UI from DevTools.
const ADMIN_EMAILS = String(import.meta.env.VITE_INTERNAL_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
const ADMIN_USER_IDS = String(import.meta.env.VITE_INTERNAL_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

let cachedDecision: boolean | null = null;

export const InternalAdminService = {
    async isAllowed(): Promise<boolean> {
        if (cachedDecision !== null) return cachedDecision;
        if (ADMIN_EMAILS.length === 0 && ADMIN_USER_IDS.length === 0) {
            cachedDecision = false;
            return false;
        }
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
