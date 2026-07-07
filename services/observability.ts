/**
 * Crash / error monitoring via Sentry — fully OPTIONAL and no-op until a DSN is
 * configured.
 *
 * Loaded lazily through Sentry's official Loader Script (CDN), so it adds
 * nothing to the app bundle and requires no npm dependency. When
 * VITE_SENTRY_DSN is unset this module does nothing at runtime.
 *
 * The Loader Script auto-installs global handlers for uncaught errors and
 * unhandled promise rejections, so those are captured automatically once it
 * loads. React render errors don't reach window.onerror, so ErrorBoundary calls
 * captureException() below to forward them too.
 *
 * Privacy: sendDefaultPii is false, session replay is disabled, and we never
 * attach relationship content. The CSP in index.html allows the Sentry CDN +
 * ingest hosts (already added).
 *
 * Upgrade path: for native Android crash capture, install @sentry/capacitor +
 * @sentry/react and swap this loader for Sentry.init() at boot — the public API
 * (initObservability / captureException) stays the same.
 */

interface SentryLike {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    Sentry?: SentryLike;
    sentryOnLoad?: () => void;
  }
}

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let started = false;

/** The public key is the DSN's userinfo segment: https://<publicKey>@host/id */
function publicKeyFromDsn(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    return url.username || null;
  } catch {
    return null;
  }
}

/** Call once at app boot. Loads Sentry only if a DSN is configured. */
export function initObservability(): void {
  if (started || typeof window === 'undefined') return;
  if (!DSN) return; // no DSN → Sentry disabled entirely
  const publicKey = publicKeyFromDsn(DSN);
  if (!publicKey) return;
  started = true;

  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';

  // The Loader Script calls window.sentryOnLoad (if defined) instead of
  // auto-initialising, letting us pass our own privacy-tuned config.
  window.sentryOnLoad = () => {
    const Sentry = window.Sentry;
    if (!Sentry?.init) return;
    Sentry.init({
      dsn: DSN,
      release: `lior@${appVersion}`,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
    });
  };

  try {
    const script = document.createElement('script');
    script.src = `https://js.sentry-cdn.com/${publicKey}.min.js`;
    script.crossOrigin = 'anonymous';
    script.async = true;
    document.head.appendChild(script);
  } catch {
    /* a loader failure must never break boot */
  }
}

/** Forward a caught error (e.g. from ErrorBoundary) to Sentry. Never throws. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const Sentry = window.Sentry;
  if (Sentry && typeof Sentry.captureException === 'function') {
    try {
      Sentry.captureException(error, context ? { extra: context } : undefined);
    } catch {
      /* best-effort */
    }
  }
}
