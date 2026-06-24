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
    | 'supabase_error';

export class NativeGoogleSignInError extends Error {
    readonly code: NativeGoogleErrorCode;
    constructor(code: NativeGoogleErrorCode, message: string) {
        super(message);
        this.name = 'NativeGoogleSignInError';
        this.code = code;
    }
}

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
    let idToken: string | null | undefined;
    try {
        const res = await plugin.login({
            provider: 'google',
            options: { scopes: ['email', 'profile'], nonce: hashedNonce },
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

    // 4. Exchange the ID token for a Supabase session.
    const { error } = await sb.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: rawNonce,
    });
    if (error) {
        throw new NativeGoogleSignInError(
            'supabase_error',
            error.message || 'Could not complete Google sign-in.',
        );
    }
    // Success — the Auth view's onAuthStateChange('SIGNED_IN') handler enters the app.
};
