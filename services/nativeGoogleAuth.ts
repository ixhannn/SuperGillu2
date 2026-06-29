import { SupabaseService } from './supabase';

// ════════════════════════════════════════════════════════════════════════════
// Native Google Sign-In (Android/iOS) via the OS-level account picker.
//
// On native we DON'T use the browser OAuth redirect flow (Supabase
// signInWithOAuth → system browser → deep link). Google forbids embedded
// WebViews and the redirect round-trip is fragile (it depends on the Supabase
// "Redirect URLs" allow-list; a missing entry silently bounces the user to the
// project Site URL — typically http://localhost — and the session is lost).
//
// Instead we call the platform Credential Manager through
// @capgo/capacitor-social-login. That shows the system Google account chooser
// IN the app (no browser), returns a signed ID token, and we exchange that token
// for a Supabase session with signInWithIdToken(). No redirect, no deep link.
// ════════════════════════════════════════════════════════════════════════════

// OAuth 2.0 "Web application" client ID from Google Cloud Console. Public by
// design (it ships inside the app binary). It is consumed in two places that
// MUST agree: the native plugin (as the Credential Manager serverClientId) and
// the Supabase Google provider (listed first in its "Client IDs"). Supabase
// validates the ID token's `aud` against this value, so a mismatch fails auth.
const GOOGLE_WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim();

const isNativePlatform = (): boolean =>
    typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());

/** True only when running natively AND a web client id has been configured. */
export const isNativeGoogleSignInAvailable = (): boolean =>
    isNativePlatform() && Boolean(GOOGLE_WEB_CLIENT_ID);

// ── Typed error so the UI can distinguish a user cancellation (silent) from a
//    real failure (surfaced in the banner). ───────────────────────────────────
export type NativeGoogleErrorCode =
    | 'not_configured'
    | 'cancelled'
    | 'no_account'
    | 'no_id_token'
    | 'plugin_error'
    | 'supabase_error'
    | 'timeout';

export class NativeGoogleSignInError extends Error {
    readonly code: NativeGoogleErrorCode;
    constructor(code: NativeGoogleErrorCode, message: string) {
        super(message);
        this.name = 'NativeGoogleSignInError';
        this.code = code;
    }
}

/**
 * Maps a sign-in failure code to a calm, user-facing message. Lives here (the
 * lazy-loaded module) rather than in the Auth view so none of these strings
 * land in the startup bundle. 'cancelled' is handled by the caller as a silent
 * no-op and never passed here.
 */
export const friendlyNativeGoogleError = (code: NativeGoogleErrorCode): string => {
    switch (code) {
        case 'not_configured':
            return 'Google sign-in isn’t set up yet on this build.';
        case 'no_account':
            // NoCredentialException means EITHER no Google account on the device
            // OR no Android OAuth client matching this build's package + signing
            // SHA-1 (the classic "developer error"). Cover both so a signed-in
            // user isn't told they have no account.
            return 'Couldn’t use Google sign-in. Make sure you’re signed in to a Google account on this device — and if you are, this app build may not be registered for Google sign-in yet.';
        case 'timeout':
            return 'Sign-in timed out. Check your connection and try again.';
        case 'no_id_token':
            return 'Google didn’t return a sign-in token. Please try again.';
        case 'supabase_error':
            return 'Couldn’t finish signing in. Please try again in a moment.';
        default:
            return 'Google sign-in didn’t complete. Please try again.';
    }
};

// ── Minimal structural typing for the plugin surface we use. We cast the
//    dynamically-imported module to this so the web bundle never hard-depends on
//    the native plugin's full type graph. ──────────────────────────────────────
interface SocialLoginPlugin {
    initialize(opts: { google: { webClientId: string; mode?: 'online' | 'offline' } }): Promise<void>;
    login(opts: {
        provider: 'google';
        options: { scopes?: string[]; nonce?: string };
    }): Promise<{ provider: string; result: { idToken?: string | null } & Record<string, unknown> }>;
}

// ── Nonce helpers (replay protection) ────────────────────────────────────────
// Google's Credential Manager embeds whatever string we pass to setNonce()
// VERBATIM into the ID token's `nonce` claim — it does not hash it. Supabase, in
// turn, SHA-256-hashes the nonce we give signInWithIdToken() before comparing it
// to that claim. So the contract is: hand the HASH to Google, hand the RAW value
// to Supabase. (crypto.subtle requires a secure context; the native WebView runs
// on the https androidScheme, so it is available.)
const generateRawNonce = (): string => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const sha256Hex = async (input: string): Promise<string> => {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

// Bounds a promise so a stalled network can never hold the sign-in spinner open
// forever. The token exchange (signInWithIdToken) goes through supabase-js's
// default fetch, which has NO read timeout — if the socket connects then hangs
// (captive portal, DNS/TLS black-hole), the await would never settle and the
// caller's loading state would stay true with no error and no way to cancel.
// On timeout we reject with a typed error the caller already handles.
const withTimeout = <T>(promise: Promise<T>, ms: number, onTimeout: () => NativeGoogleSignInError): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
};

// Token exchange ceiling. The exchange normally completes in well under a
// second; 20s is a generous upper bound that still fails fast on a dead network.
const EXCHANGE_TIMEOUT_MS = 20_000;

// ── Plugin load + one-time initialize (idempotent, retry-safe) ────────────────
let initialized = false;
let initPromise: Promise<void> | null = null;

const loadPlugin = async (): Promise<SocialLoginPlugin> => {
    const mod = await import('@capgo/capacitor-social-login');
    return mod.SocialLogin as unknown as SocialLoginPlugin;
};

const ensureInitialized = async (plugin: SocialLoginPlugin): Promise<void> => {
    if (initialized) return;
    if (!initPromise) {
        initPromise = plugin
            .initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } })
            .then(() => { initialized = true; })
            .catch((e) => { initPromise = null; throw e; });
    }
    return initPromise;
};

/**
 * Warm the native path ahead of the first tap: load the plugin chunk and run
 * its one-time initialize() in the background, so the OS account picker opens
 * INSTANTLY on tap instead of paying the dynamic-import + init latency inline.
 * Idempotent (ensureInitialized latches), native-only, and never throws — a
 * failed pre-warm just means the first real tap initializes normally. Call it
 * when the auth screen mounts.
 */
export const prewarmNativeGoogle = (): void => {
    if (!isNativeGoogleSignInAvailable()) return;
    void (async () => {
        try {
            const plugin = await loadPlugin();
            await ensureInitialized(plugin);
        } catch { /* harmless — the first tap will initialize */ }
    })();
};

const errorMessage = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();

const isUserCancellation = (err: unknown): boolean => {
    const msg = errorMessage(err);
    return msg.includes('cancel')              // "canceled" / "cancelled" / "user cancelled"
        || msg.includes('12501')               // Google Sign-In SIGN_IN_CANCELLED status
        || msg.includes('activity is cancelled'); // Credential Manager: user dismissed the sheet
};

// Credential Manager throws NoCredentialException ("No credentials available")
// when the device has NO Google account OR no Android OAuth client matches the
// app's package + signing SHA-1. Both are actionable (not a silent dismissal),
// so we surface them as their own code instead of swallowing them.
const isNoCredential = (err: unknown): boolean => {
    const msg = errorMessage(err);
    return msg.includes('no credential') || msg.includes('no matching credential');
};

/**
 * Full native flow: show the OS Google account picker, get an ID token, and
 * exchange it for a Supabase session. Resolves once the session is set
 * (Supabase then fires onAuthStateChange 'SIGNED_IN', which the Auth view's
 * listener turns into onLogin()). Throws NativeGoogleSignInError on failure;
 * callers should treat code === 'cancelled' as a silent no-op.
 */
export const signInWithNativeGoogle = async (): Promise<void> => {
    if (!isNativeGoogleSignInAvailable()) {
        throw new NativeGoogleSignInError('not_configured', 'Native Google sign-in is not configured.');
    }
    const sb = SupabaseService.client;
    if (!sb) {
        throw new NativeGoogleSignInError('supabase_error', 'Supabase client is not configured.');
    }

    // 1. Load + initialize the plugin.
    let plugin: SocialLoginPlugin;
    try {
        plugin = await loadPlugin();
        await ensureInitialized(plugin);
    } catch (e) {
        throw new NativeGoogleSignInError(
            'plugin_error',
            e instanceof Error ? e.message : 'Could not start Google sign-in.',
        );
    }

    // 2. Build the nonce pair.
    let rawNonce: string;
    let hashedNonce: string;
    try {
        rawNonce = generateRawNonce();
        hashedNonce = await sha256Hex(rawNonce);
    } catch (e) {
        throw new NativeGoogleSignInError(
            'plugin_error',
            e instanceof Error ? e.message : 'Could not prepare Google sign-in.',
        );
    }

    // 3. Native account picker → ID token.
    // NOTE: do NOT pass `scopes`. The plugin always requests email/profile/openid
    // by default, and supplying a `scopes` array forces an extra Google-API
    // authorization flow that REQUIRES a modified MainActivity — without it the
    // plugin rejects with "You CANNOT use scopes without modifying the main
    // activity". We only need the ID token for Supabase, so the default flow
    // (no scopes) is exactly right and needs no native MainActivity changes.
    let idToken: string | null | undefined;
    try {
        const res = await plugin.login({
            provider: 'google',
            options: { nonce: hashedNonce },
        });
        idToken = res?.result?.idToken;
    } catch (e) {
        if (isUserCancellation(e)) {
            throw new NativeGoogleSignInError('cancelled', 'Sign-in cancelled.');
        }
        if (isNoCredential(e)) {
            throw new NativeGoogleSignInError(
                'no_account',
                e instanceof Error ? e.message : 'No Google account available.',
            );
        }
        throw new NativeGoogleSignInError(
            'plugin_error',
            e instanceof Error ? e.message : 'Google sign-in failed.',
        );
    }

    if (!idToken) {
        throw new NativeGoogleSignInError('no_id_token', 'Google did not return an ID token.');
    }

    // 4. Exchange the ID token for a Supabase session (bounded — see withTimeout).
    // signInWithIdToken exposes no per-call abort signal, so on timeout the
    // background exchange keeps racing. If it later succeeds it sets a session and
    // fires onAuthStateChange('SIGNED_IN'), which would silently enter the app
    // after we already told the user sign-in failed. Make the timeout authoritative
    // by tearing down any late session so that confusing entry can't happen.
    let timedOut = false;
    try {
        const { error } = await withTimeout(
            sb.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce }),
            EXCHANGE_TIMEOUT_MS,
            () => { timedOut = true; return new NativeGoogleSignInError('timeout', 'Timed out finishing sign-in.'); },
        );
        if (error) {
            throw new NativeGoogleSignInError(
                'supabase_error',
                error.message || 'Could not complete Google sign-in.',
            );
        }
    } catch (e) {
        if (timedOut) {
            sb.auth.signOut().catch(() => { /* ignore — best-effort teardown */ });
        }
        throw e;
    }
    // Success — the Auth view's onAuthStateChange('SIGNED_IN') handler enters the app.
};
