/**
 * Product analytics — a thin, privacy-conscious event layer.
 *
 * Two independent destinations, both fully OPTIONAL and no-op until configured:
 *
 *  1. First-party `app_events` (Supabase). Your own private ledger — nothing
 *     leaves your infrastructure. Mirrors services/errorSink.ts: best-effort,
 *     fire-and-forget, capped per session, and silently no-ops when Supabase
 *     isn't configured, the migration hasn't been applied, or the user is signed
 *     out (RLS requires a user). So it is safe to ship ahead of the migration.
 *
 *  2. PostHog (funnels / retention / cohorts). Loaded lazily from its CDN via the
 *     official loader snippet, ONLY when VITE_POSTHOG_KEY is set. Autocapture,
 *     pageviews and session recording are all disabled — we send exactly the
 *     named events below and nothing else. Anonymous by default (no identify()
 *     with PII), so it also captures the pre-sign-in funnel that the first-party
 *     sink cannot (RLS needs a signed-in user).
 *
 * The CSP in index.html must allow the PostHog asset + ingest hosts (already
 * added). If neither VITE_POSTHOG_KEY nor the migration is present, this module
 * does nothing at runtime.
 */

import { SupabaseService } from './supabase';

/** The full, closed set of product events. Keep this list short and meaningful. */
export type AnalyticsEvent =
  | 'app_open'
  | 'onboarding_complete'
  | 'pair_invite_sent'
  | 'pair_joined'
  | 'ritual_completed'
  | 'premium_tap'
  | 'screen_view'
  | 'screen_leave'
  | 'app_background';

type EventProps = Record<string, unknown>;

interface PostHogLike {
  __SV?: number;
  _i?: unknown[];
  init?: (token: string, config: EventProps, name?: string) => void;
  capture?: (event: string, props?: EventProps) => void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

const APP_EVENTS_TABLE = 'app_events';
const MAX_PER_SESSION = 200; // hard cap on first-party rows shipped per session
const MAX_PROPS_BYTES = 4_000;

let sentThisSession = 0;
let posthogStarted = false;

// ── PostHog loader (official snippet, typed) ────────────────────────────────
// Faithful to PostHog's documented install snippet: it creates a stubbed
// `window.posthog` that queues calls, then loads the real library from
// `<api_host>/static/array.js`, which replays the queue. We only ever call
// init() + capture(), and only when a key is configured.
function loadPostHog(apiKey: string, apiHost: string): void {
  const posthog: PostHogLike = window.posthog || [] as unknown as PostHogLike;
  window.posthog = posthog;
  if (!posthog.__SV) {
    posthog._i = [];
    posthog.init = function (token: string, config: EventProps, name?: string) {
      const queued = ['init', 'capture', 'identify', 'register', 'register_once',
        'unregister', 'opt_in_capturing', 'opt_out_capturing',
        'has_opted_out_capturing', 'group', 'reset', 'setPersonProperties'];
      const inst = (name ? ((posthog as Record<string, unknown>)[name] = []) : posthog) as Record<string, unknown> & unknown[];
      for (const method of queued) {
        inst[method] = function () {
          (inst as unknown[]).push([method].concat(Array.prototype.slice.call(arguments, 0)));
        };
      }
      (posthog._i as unknown[]).push([token, config, name]);

      const assetSrc =
        String(config.api_host).replace('.i.posthog.com', '-assets.i.posthog.com') +
        '/static/array.js';
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = assetSrc;
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(script, first);
    };
    posthog.__SV = 1;
  }
  posthog.init?.(apiKey, {
    api_host: apiHost,
    autocapture: false,
    capture_pageview: false, // we send $pageview manually per view (this is an SPA)
    capture_pageleave: true, // enables time-on-page, bounce rate + a terminal $pageleave on hard exit
    disable_session_recording: true,
    persistence: 'localStorage',
    // Never create a person profile for an anonymous device; only if we ever
    // choose to identify (we don't send PII today).
    person_profiles: 'identified_only',
  });
}

function posthogCapture(event: string, props?: EventProps): void {
  const ph = window.posthog;
  if (ph && typeof ph.capture === 'function') {
    try {
      ph.capture(event, props);
    } catch {
      /* best-effort: analytics must never break the app */
    }
  }
}

// ── First-party sink (Supabase app_events) ──────────────────────────────────
function safeProps(props?: EventProps): EventProps | null {
  if (!props) return null;
  try {
    const json = JSON.stringify(props);
    if (json.length > MAX_PROPS_BYTES) return null; // drop oversized payloads
    return props;
  } catch {
    return null;
  }
}

async function shipFirstParty(event: AnalyticsEvent, props?: EventProps): Promise<void> {
  if (!SupabaseService.init() || !SupabaseService.client) return;
  const userId = SupabaseService.getCachedUserId();
  if (!userId) return; // RLS requires a signed-in user; the anon funnel lands in PostHog

  let coupleId: string | null = null;
  try {
    coupleId = await SupabaseService.getCurrentCoupleId();
  } catch {
    /* couple is optional */
  }

  await SupabaseService.client.from(APP_EVENTS_TABLE).insert({
    user_id: userId,
    couple_id: coupleId,
    name: event,
    props: safeProps(props),
    app_version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null,
    occurred_at: new Date().toISOString(),
  });
}

/** First-party only (skips PostHog). Capped per session. Never throws. */
function trackLocal(event: AnalyticsEvent, props?: EventProps): void {
  if (sentThisSession >= MAX_PER_SESSION) return;
  sentThisSession++;
  void shipFirstParty(event, props).catch(() => {
    /* best-effort: offline, missing table, RLS, signed-out — all fine */
  });
}

export const Analytics = {
  /** Call once at app boot. Loads PostHog only if a key is configured. */
  init(): void {
    if (posthogStarted || typeof window === 'undefined') return;
    if (!POSTHOG_KEY) return; // no key → PostHog disabled entirely
    posthogStarted = true;
    try {
      loadPostHog(POSTHOG_KEY, POSTHOG_HOST);
    } catch {
      /* a loader failure must never break boot */
    }
  },

  /**
   * Record a product event to BOTH PostHog (if loaded) and the first-party
   * app_events table (if signed in + migrated). Never throws.
   */
  track(event: AnalyticsEvent, props?: EventProps): void {
    posthogCapture(event, props);
    trackLocal(event, props);
  },

  /**
   * A screen/view was entered. Sends PostHog's `$pageview` (with a synthetic
   * `/app/<view>` URL so PostHog Web Analytics, Paths and time-on-page light
   * up) plus a first-party `screen_view`. The custom event is first-party only
   * to avoid double-counting alongside `$pageview` in PostHog.
   */
  screenEnter(
    view: string,
    props?: { previous?: string | null; is_root_tab?: boolean; session_screen_index?: number },
  ): void {
    const url = `/app/${view}`;
    posthogCapture('$pageview', { $current_url: url, $pathname: url, screen: view, is_root_tab: props?.is_root_tab });
    trackLocal('screen_view', {
      screen: view,
      previous_screen: props?.previous ?? null,
      is_root_tab: props?.is_root_tab,
      session_screen_index: props?.session_screen_index,
    });
  },

  /**
   * A screen/view was left. Sends PostHog `$pageleave` (powers dwell + bounce)
   * plus a first-party `screen_leave` carrying the dwell time.
   */
  screenLeave(
    view: string,
    props?: { next?: string | null; dwell_ms?: number; reason?: 'navigate' | 'background' },
  ): void {
    posthogCapture('$pageleave', { $current_url: `/app/${view}`, screen: view, dwell_ms: props?.dwell_ms });
    trackLocal('screen_leave', {
      screen: view,
      next_screen: props?.next ?? null,
      dwell_ms: props?.dwell_ms,
      reason: props?.reason,
    });
  },
};
