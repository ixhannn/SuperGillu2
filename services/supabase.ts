import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { isE2EAppMode } from './e2eHarness';

const KEYS = { URL: 'lior_sb_url', KEY: 'lior_sb_key' };
const ENV_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() || '';

// The project URL can be supplied at runtime via localStorage (manual setup
// flow). Only accept real Supabase hosts there, so a localStorage write (e.g.
// through an XSS or a malicious extension) cannot re-point all cloud sync at
// an attacker-controlled server. Plain http is allowed only for the local CLI.
const isTrustedSupabaseUrl = (value: string): boolean => {
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'https:') {
            return parsed.hostname === 'supabase.co' || parsed.hostname.endsWith('.supabase.co');
        }
        return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
        return false;
    }
};

const readStoredSupabaseUrl = (): string => {
    const stored = localStorage.getItem(KEYS.URL) || '';
    return isTrustedSupabaseUrl(stored) ? stored : '';
};
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

// ── Pre-reveal leak guard for the daily ritual (Phase 3) ────────────────────
// couple_profile is a SYNCED singleton: its `data` blob is mirrored verbatim to
// the partner's device. Daily-question answers historically live inside
// `data.questions[].answers`, so before the sealed reveal opened the partner's
// device would already RECEIVE the answer text. Once the server-enforced
// sealed-reveal table (daily_answers) is the live source — flagged sticky by
// StorageService.setRitualCloudActive — the answer TEXT must never ride along in
// the couple_profile push. We strip it here, at the single serialization point,
// keeping date/question/revealedAt so the "partner answered" + reveal-timing
// signal still propagates. Pure (clones, never mutates the caller's profile),
// scoped to couple_profile, and a no-op when the flag is off (legacy untouched).
const RITUAL_CLOUD_ACTIVE_KEY = 'lior_ritual_cloud_active';

const isRitualCloudActive = (): boolean => {
    try { return localStorage.getItem(RITUAL_CLOUD_ACTIVE_KEY) === '1'; } catch { return false; }
};

const stripCoupleProfileAnswersForPush = (data: any): any => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) return data;
    return {
        ...data,
        questions: data.questions.map((q: any) => {
            if (!q || typeof q !== 'object' || !q.answers || typeof q.answers !== 'object') return q;
            // Preserve every key (date/question/revealedAt/…) but blank the answer
            // TEXT so the seal holds on the wire. We keep the answers map's KEYS
            // (the answerer names) so the "partner answered" signal still reads,
            // while the values carry no readable content pre-reveal.
            const sealedAnswers = Object.fromEntries(
                Object.keys(q.answers).map((name) => [name, '']),
            );
            return { ...q, answers: sealedAnswers };
        }),
    };
};

// Applies the strip ONLY to the couple_profile singleton AND only once the
// sealed-reveal table is live. Any other table / inactive flag passes through.
const sanitizeSingletonForPush = (table: string, data: any): any => (
    table === 'couple_profile' && isRitualCloudActive()
        ? stripCoupleProfileAnswersForPush(data)
        : data
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

export interface MyRelationship {
    coupleId: string;
    status: string;
    role: string;
    partnerUserId: string | null;
    partnerName: string | null;
    onboardingDone: boolean;
    memberCount: number;
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
        url: ENV_URL || readStoredSupabaseUrl(),
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
        if (!isTrustedSupabaseUrl(url)) {
            console.warn('Rejected Supabase URL: only *.supabase.co (or localhost for dev) is allowed.');
            return false;
        }
        localStorage.setItem(KEYS.URL, url);
        localStorage.setItem(KEYS.KEY, key);
        SupabaseService.client = null;
        return SupabaseService.init();
    },

    isConfigured: () => (!!ENV_URL && !!ENV_KEY) || (!!readStoredSupabaseUrl() && !!localStorage.getItem(KEYS.KEY)),

    getCachedUserId: () => cachedUserId,

    setCachedUserId: (userId: string | null) => {
        const normalizedUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null;
        if (cachedUserId !== normalizedUserId) {
            cachedCoupleId = null;
        }
        cachedUserId = normalizedUserId;
        if (!normalizedUserId) cachedCoupleId = null;
        // Persist so lower-level modules (storage) can key per-user data (e.g.
        // user_status) by a STABLE id instead of the mutable display name,
        // without importing this module and creating a circular dependency.
        try {
            if (normalizedUserId) localStorage.setItem('lior_my_user_id', normalizedUserId);
            else localStorage.removeItem('lior_my_user_id');
        } catch { /* localStorage unavailable */ }
    },

    getSession: async (): Promise<Session | null> => {
        if (!SupabaseService.client) return null;
        if (sessionLookupPromise) return sessionLookupPromise;

        sessionLookupPromise = (async () => {
            try {
                // Bound the read. getSession() can trigger a token refresh, and a
                // stalled refresh on a flaky/cold network would otherwise hang app
                // launch on the loading screen forever (initializeApp awaits this).
                // On timeout, degrade to "no session" → the login screen, which is
                // always recoverable: the session is still persisted in storage and
                // resolves on the next launch with a working connection.
                const SESSION_READ_TIMEOUT_MS = 8000;
                const result = await Promise.race([
                    SupabaseService.client!.auth.getSession(),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS)),
                ]);
                if (!result) {
                    console.warn('Supabase session lookup timed out; treating as no session.');
                    return null;
                }
                const { data, error } = result;
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

    /**
     * Authoritative relationship read (server-owned).
     * Requires the 20260604_relationship_integrity migration. Throws if the RPC
     * is not present yet, so callers can fall back to legacy resolution — the
     * client is therefore safe to ship ahead of the migration.
     */
    getMyRelationship: async (): Promise<MyRelationship | null> => {
        if (!SupabaseService.client) return null;
        const { data, error } = await SupabaseService.client.rpc('get_my_relationship');
        if (error) throw error; // RPC missing / not migrated → caller falls back
        const row = firstRpcRow<any>(data);
        if (!row?.couple_id) return null;
        return {
            coupleId: String(row.couple_id),
            status: row.status ?? 'active',
            role: row.role ?? 'partner',
            partnerUserId: row.partner_user_id ? String(row.partner_user_id) : null,
            partnerName: (row.partner_name ?? '').trim() || null,
            onboardingDone: Boolean(row.onboarding_done),
            memberCount: Number(row.member_count ?? 0),
        };
    },

    /**
     * Persists onboarding completion to the server (relationship_facts), so a
     * reinstall / new device / relogin never re-triggers onboarding. Safe no-op
     * if the relationship_integrity migration is not applied yet.
     */
    markOnboardingComplete: async (): Promise<void> => {
        if (!SupabaseService.client) return;
        try {
            const coupleId = await SupabaseService.getCurrentCoupleId();
            if (!coupleId) return;
            await SupabaseService.client
                .from('relationship_facts')
                .upsert({ couple_id: coupleId, onboarding_done: true }, { onConflict: 'couple_id' });
        } catch {
            // Table not migrated yet — the device-local flag still governs.
        }
    },

    getCurrentCoupleId: async (): Promise<string | null> => {
        if (cachedCoupleId) return cachedCoupleId;
        if (!SupabaseService.client) return null;

        // Authoritative path first — eliminates the client-side heuristic that
        // let a device attach to the wrong/solo couple ("linked profiles
        // unlink"). Silently falls back to legacy resolution if the
        // get_my_relationship() migration has not been applied yet.
        try {
            const rel = await SupabaseService.getMyRelationship();
            if (rel?.coupleId) {
                cachedCoupleId = rel.coupleId;
                return cachedCoupleId;
            }
        } catch {
            // RPC not present yet — fall through to the legacy resolution below.
        }

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

                    // A peer-lookup error must NOT be swallowed into a guess: caching
                    // the wrong couple here is the "linked profiles unlink / data in
                    // the wrong tenant" failure. Fail closed so the caller retries.
                    if (peerError) {
                        console.warn('Supabase peer membership lookup failed:', peerError);
                        return null;
                    }

                    if (peerRows) {
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

                    // No partner found in any couple. Prefer the OLDEST membership
                    // (the user's original couple) over a freshly auto-created solo
                    // couple. membershipRows are ordered created_at DESC, so the last
                    // id is the oldest.
                    cachedCoupleId = coupleIds[coupleIds.length - 1];
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

    // Returns true on success, false on any failure. Existing callers that
    // ignore the return value are unaffected; the sync outbox uses it to decide
    // whether a queued write must be retried.
    upsertItem: async (table: string, item: any): Promise<boolean> => {
        if (!SupabaseService.client) return false;
        try {
            const userId = await SupabaseService.getCurrentUserId();
            const coupleId = await SupabaseService.getCurrentCoupleId();
            if (!userId || !coupleId) return false;

            const { error } = await SupabaseService.client.from(table).upsert({
                id: buildTenantRowId(coupleId, item.id),
                user_id: userId,
                couple_id: coupleId,
                // No-op for every table except an active-ritual couple_profile push,
                // so the pre-reveal strip is enforced regardless of which upsert
                // path a future caller routes the singleton through.
                data: sanitizeSingletonForPush(table, item)
            });
            if (error) {
                console.warn(`Supabase upsert failed for ${table}:`, error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn(`Supabase upsert exception for ${table}:`, e);
            return false;
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

        // Strip pre-reveal daily answers from the couple_profile push only; the
        // local profile (and every other table) is left untouched. No-op until
        // the sealed-reveal table is live (see sanitizeSingletonForPush).
        const pushData = sanitizeSingletonForPush(table, data);

        const { error } = await SupabaseService.client.from(table).upsert({
            id: buildTenantRowId(coupleId, 'singleton'),
            user_id: userId,
            couple_id: coupleId,
            data: pushData
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
