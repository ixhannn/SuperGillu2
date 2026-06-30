/**
 * Notifications service — wraps `@capacitor/local-notifications` when running
 * natively, falls back to the Web Notifications API + in-app banners on web.
 *
 * The four schedule types we support:
 *   - `daily-clip`        : every evening at user's reminder time
 *   - `film-ready`        : fire-and-forget after film compilation
 *   - `recap-sunday`      : every Sunday at reminder time for Weekly Recap
 *   - `cycle-3-days`      : remind once when 3 days remain in cycle
 *
 * Partner nudges are server-triggered via the `send-partner-nudge` Edge Function.
 * `registerPushToken()` must be called after auth to enable them.
 */

import { Capacitor } from '@capacitor/core';
import { NotificationPrefs, NotificationSchedule } from '../types';
import { SupabaseService } from './supabase';
import { DiagnosticsService } from './diagnostics';
import { toast } from '../utils/toast';
import { notificationCopyFor } from './notificationCopy';

type PluginListenerHandle = { remove: () => Promise<void> };

type LocalNotifications = {
  checkPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  schedule: (opts: { notifications: unknown[] }) => Promise<unknown>;
  cancel: (opts: { notifications: { id: number }[] }) => Promise<void>;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
  addListener?: (
    event: 'localNotificationActionPerformed',
    handler: (action: { notification?: { extra?: { view?: string } } }) => void,
  ) => Promise<PluginListenerHandle>;
  createChannel?: (channel: {
    id: string;
    name: string;
    description?: string;
    importance?: 1 | 2 | 3 | 4 | 5;
    visibility?: -1 | 0 | 1;
    sound?: string;
    vibration?: boolean;
    lights?: boolean;
    lightColor?: string;
  }) => Promise<void>;
};

// High-importance channel so reminders appear as a heads-up banner (Android 8+
// requires a channel; the plugin's default channel is only IMPORTANCE_DEFAULT,
// which can land silently in the shade and read as "notifications don't work").
const ANDROID_CHANNEL_ID = 'lior-reminders';
let channelEnsured = false;

// Branding for every native notification: the Lior heart as the app icon, the
// way every app does it. Android renders this as a flat alpha silhouette it
// tints brand-pink (ICON_COLOR) — it cannot be the full-colour logo, so it's a
// clean heart glyph (exactly like WhatsApp's white phone, Instagram's camera).
// We deliberately set NO largeIcon: that's the big colour block on the right,
// which doesn't belong on these notifications.
const NOTIFICATION_SMALL_ICON = 'ic_notification';
const NOTIFICATION_ICON_COLOR = '#E91E8C';

// Web-fallback notification timers (no native scheduler available): tracked so a
// re-arm — applySchedule runs on startup AND on every savePrefs / permission
// grant — clears the previous ones instead of stacking duplicate setTimeouts that
// fire the same reminder multiple times and keep running after a logical cancel.
let webNotificationTimers: ReturnType<typeof setTimeout>[] = [];
const clearWebNotificationTimers = () => {
  for (const t of webNotificationTimers) clearTimeout(t);
  webNotificationTimers = [];
};

async function ensureChannel(local: LocalNotifications): Promise<void> {
  if (channelEnsured || typeof local.createChannel !== 'function') return;
  try {
    await local.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Lior reminders',
      description: 'Daily moments, weekly recaps and partner alerts',
      importance: 5,       // IMPORTANCE_HIGH → heads-up banner + sound
      visibility: 1,       // VISIBILITY_PUBLIC
      vibration: true,
      lights: true,
      lightColor: '#E91E8C',
    });
    channelEnsured = true;
  } catch {
    /* createChannel unsupported on this platform — default channel is used */
  }
}

type PushNotifications = {
  checkPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  requestPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  register: () => Promise<void>;
  addListener: ((event: 'registration', handler: (data: { value: string }) => void) => Promise<unknown>)
    & ((event: 'registrationError', handler: (error: unknown) => void) => Promise<unknown>)
    & ((
      event: 'pushNotificationReceived',
      handler: (notification: { title?: string; body?: string }) => void,
    ) => Promise<PluginListenerHandle>)
    & ((
      event: 'pushNotificationActionPerformed',
      handler: (action: { notification?: { data?: { view?: string } } }) => void,
    ) => Promise<PluginListenerHandle>);
};

// Where a tap on each notification kind should land. Native apps take you
// TO the thing, not just into the app.
const KIND_VIEWS: Record<NotificationSchedule['kind'], string> = {
  'daily-clip': 'daily-moments',
  'recap-sunday': 'weekly-recap',
  'film-ready': 'daily-video',
  'cycle-3-days': 'us',
  'daily-ritual': 'home',
  'daily-drop': 'daily-drop',
  // A received Pulse (aura) — tapping the OS notification opens the Pulse screen.
  aura: 'aura-signal',
};

type NativePermissionState = 'granted' | 'denied' | 'prompt';

function isNativeNotificationRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Capacitor plugin proxies are *thenable*: reading `.then` returns a callable
 * native-method stub (the proxy turns any property into a native call). When a
 * thenable is the resolution value of a Promise — e.g. returned from an async
 * getter and then `await`ed — the Promise machinery "assimilates" it and invokes
 * its `.then(resolve, reject)`. On Android that dispatches a bogus
 * `LocalNotifications.then()` / `PushNotifications.then()` call, which the native
 * layer rejects with `"…then()" is not implemented on android`. That rejection
 * escapes the getter's try/catch (assimilation happens during the async return,
 * outside the body) and silently kills the whole flow — no permission request,
 * no schedule, not even the in-app toast that runs after the await.
 *
 * Wrapping the proxy so `then` reads back as `undefined` makes it non-thenable,
 * so a Promise resolves with the plugin as-is. Every other property (the real
 * plugin methods) forwards straight through to the underlying Capacitor proxy.
 */
function asNonThenable<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      return Reflect.get(target, prop);
    },
  });
}

async function getCapacitorLocalNotifications(): Promise<LocalNotifications | null> {
  if (!isNativeNotificationRuntime()) return null;
  try {
    // Static specifier so Vite/Rollup bundles the plugin — a bare specifier
    // left unbundled (e.g. via @vite-ignore) fails to resolve in the WebView
    // at runtime, silently disabling all native notifications.
    const mod = (await import('@capacitor/local-notifications')) as { LocalNotifications?: LocalNotifications };
    // asNonThenable: never let the (thenable) plugin proxy be the promise's
    // resolution value — see the helper above.
    return mod.LocalNotifications ? asNonThenable(mod.LocalNotifications) : null;
  } catch {
    return null;
  }
}

async function getCapacitorPushNotifications(): Promise<PushNotifications | null> {
  if (!isNativeNotificationRuntime()) return null;
  try {
    const mod = (await import('@capacitor/push-notifications')) as { PushNotifications?: PushNotifications };
    // asNonThenable: see getCapacitorLocalNotifications above.
    return mod.PushNotifications ? asNonThenable(mod.PushNotifications) : null;
  } catch {
    return null;
  }
}

const PREFS_KEY = 'lior_notification_prefs';
const SCHEDULES_KEY = 'lior_notification_schedules';

const DEFAULT_PREFS: NotificationPrefs = {
  dailyClipEnabled: true,
  dailyClipTime: '20:00',
  recapEnabled: true,
  recapTime: '19:00',
  filmReadyEnabled: true,
  partnerNudgeEnabled: true,
  ritualEnabled: true,
  ritualTime: '20:00',
  dropEnabled: true,
  dropTime: '19:30',
};

let pushRegistrationListenerBound = false;

// Client-side cooldown so a rapid burst of heartbeat taps can't spam the
// partner with a push storm (the server has no per-couple throttle yet).
let lastHeartbeatPushAt = 0;
const HEARTBEAT_PUSH_COOLDOWN_MS = 3000;

function mergePermissionStates(...states: Array<NativePermissionState | null | undefined>): NativePermissionState {
  if (states.some((state) => state === 'denied')) return 'denied';
  if (states.some((state) => state === 'prompt')) return 'prompt';
  return 'granted';
}

function toNotificationPermission(state: NativePermissionState): NotificationPermission {
  if (state === 'prompt') return 'default';
  return state;
}

function readPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: NotificationPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function readSchedules(): NotificationSchedule[] {
  try {
    const raw = localStorage.getItem(SCHEDULES_KEY);
    return raw ? (JSON.parse(raw) as NotificationSchedule[]) : [];
  } catch {
    return [];
  }
}

function writeSchedules(list: NotificationSchedule[]) {
  try { localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list)); } catch {}
}

// Parse "HH:MM" defensively — a malformed/NaN value must not produce an
// Invalid Date (which would throw on toISOString and silently kill ALL
// scheduling). Falls back to 20:00.
function parseHm(timeStr: string): { hour: number; minute: number } {
  const [hh, mm] = (timeStr || '').split(':').map(Number);
  return {
    hour: Number.isFinite(hh) ? hh : 20,
    minute: Number.isFinite(mm) ? mm : 0,
  };
}

function nextOccurrenceOf(timeStr: string, targetWeekday?: number): Date {
  const { hour, minute } = parseHm(timeStr);
  const now = new Date();
  const candidate = new Date();
  candidate.setHours(hour, minute, 0, 0);
  if (targetWeekday === undefined) {
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  } else {
    const diff = (targetWeekday - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (diff === 0 && candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

function hashId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = ((h << 5) - h) + key.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 2_000_000_000;
}

export const NotificationsService = {
  getPrefs(): NotificationPrefs {
    return readPrefs();
  },

  savePrefs(prefs: NotificationPrefs) {
    writePrefs(prefs);
    // Re-arm the schedule so a changed reminder time / toggle takes effect now,
    // not on the next cold launch.
    void this.applySchedule().catch(() => {});
  },

  async getPermissionStatus(): Promise<NotificationPermission> {
    const native = await getCapacitorLocalNotifications();
    if (native) {
      const local = await native.checkPermissions().catch(() => ({ display: 'denied' as const }));
      const push = await getCapacitorPushNotifications();
      if (!push) return toNotificationPermission(local.display);
      const remote = await push.checkPermissions().catch(() => ({ receive: 'denied' as const }));
      return toNotificationPermission(mergePermissionStates(local.display, remote.receive));
    }
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission> {
    const native = await getCapacitorLocalNotifications();
    if (native) {
      const local = await native.requestPermissions().catch(() => ({ display: 'denied' as const }));
      const push = await getCapacitorPushNotifications();
      const remote = push
        ? await push.requestPermissions().catch(() => ({ receive: 'denied' as const }))
        : null;
      const permission = remote ? mergePermissionStates(local.display, remote.receive) : local.display;
      if (permission === 'granted') {
        // Register for push AND arm the recurring local schedule now —
        // otherwise reminders aren't queued until the next cold launch.
        await this.registerPushToken().catch(() => {});
        await this.applySchedule().catch(() => {});
      }
      return toNotificationPermission(permission);
    }
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await this.registerPushToken().catch(() => {});
      await this.applySchedule().catch(() => {});
    }
    return result;
  },

  /**
   * Plan the recurring schedule based on current prefs. Should be called
   * on app start and whenever prefs change.
   *
   * `prompt` controls whether a never-decided ('prompt') permission state is
   * allowed to trigger the OS permission dialog. App startup MUST pass
   * `false` so reopening the app never fires a cold OS prompt; an explicit
   * user gesture (e.g. accepting the priming modal) may pass `true`. When
   * permission is already granted this schedules/registers regardless.
   */
  async applySchedule({ prompt = false }: { prompt?: boolean } = {}): Promise<void> {
    const prefs = readPrefs();

    // Cancel previous
    await this.cancelAll();

    const queued: NotificationSchedule[] = [];

    if (prefs.dailyClipEnabled) {
      const when = nextOccurrenceOf(prefs.dailyClipTime);
      queued.push({
        // Stable id (not date-based): the native schedule is now recurring, so
        // re-running applySchedule must replace the same entry, not stack a new one.
        id: 'daily-clip',
        kind: 'daily-clip',
        fireAt: when.toISOString(),
        // Copy is personalised + rotates daily — see notificationCopy.ts.
        ...notificationCopyFor('daily-clip'),
      });
    }

    if (prefs.recapEnabled) {
      const when = nextOccurrenceOf(prefs.recapTime, 0 /* Sunday */);
      queued.push({
        id: 'recap-sunday',
        kind: 'recap-sunday',
        fireAt: when.toISOString(),
        ...notificationCopyFor('recap-sunday'),
      });
    }

    if (prefs.ritualEnabled) {
      const when = nextOccurrenceOf(prefs.ritualTime);
      queued.push({
        // Stable id (not date-based): native schedule repeats, so re-running
        // applySchedule must replace the same entry, not orphan a date-stamped
        // recurring notification that cancelAll can no longer cancel by id.
        id: 'daily-ritual',
        kind: 'daily-ritual',
        fireAt: when.toISOString(),
        ...notificationCopyFor('daily-ritual'),
      });
    }

    if (prefs.dropEnabled) {
      const when = nextOccurrenceOf(prefs.dropTime);
      queued.push({
        // Stable id (not date-based): see daily-ritual above — a repeating
        // notification must keep a constant id so each re-schedule overwrites it.
        id: 'daily-drop',
        kind: 'daily-drop',
        fireAt: when.toISOString(),
        ...notificationCopyFor('daily-drop'),
      });
    }

    writeSchedules(queued);

    const native = await getCapacitorLocalNotifications();
    if (native) {
      // Make sure we actually hold permission — otherwise the scheduled
      // notifications are silently dropped. Only prompt when the caller opted
      // in AND the user hasn't decided yet (status 'prompt'); never re-nag a
      // denial, and never prompt cold at startup (prompt === false).
      const status = await native.checkPermissions().catch(() => ({ display: 'denied' as const }));
      if (prompt && status.display === 'prompt') {
        await native.requestPermissions().catch(() => undefined);
      }
      await ensureChannel(native);
      const payload = queued.map((s) => {
        // Recurring rule so the OS re-fires daily/weekly WITHOUT the app being
        // relaunched. A bare `{ at }` is one-shot and stops after the first
        // fire — the previous behaviour meant reminders silently died until the
        // next cold launch re-armed them.
        const timeForKind =
          s.kind === 'recap-sunday' ? prefs.recapTime
          : s.kind === 'daily-ritual' ? prefs.ritualTime
          : s.kind === 'daily-drop' ? prefs.dropTime
          : prefs.dailyClipTime;
        const hm = parseHm(timeForKind);
        const on = s.kind === 'recap-sunday'
          ? { weekday: 1, ...hm } // Capacitor weekday: 1 = Sunday
          : hm;
        return {
          id: hashId(s.id),
          title: s.title,
          body: s.body,
          // `largeBody` expands to a fuller second line via BigTextStyle.
          ...(s.largeBody ? { largeBody: s.largeBody } : {}),
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: NOTIFICATION_SMALL_ICON,
          iconColor: NOTIFICATION_ICON_COLOR,
          schedule: { on, repeats: true, allowWhileIdle: true },
          // `view` routes the tap to the relevant screen (see bindTapRouting).
          extra: { kind: s.kind, view: KIND_VIEWS[s.kind], ...s.payload },
        };
      });
      if (payload.length > 0) await native.schedule({ notifications: payload });
    }
    // Web fallback: we can't pre-schedule beyond session. Use setTimeout
    // only for notifications firing in the next 2 hours (session-bound).
    else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      clearWebNotificationTimers(); // supersede any timers from a prior re-arm
      for (const s of queued) {
        const delta = new Date(s.fireAt).getTime() - Date.now();
        if (delta > 0 && delta < 2 * 60 * 60 * 1000) {
          webNotificationTimers.push(setTimeout(() => {
            try { new Notification(s.title, { body: s.body }); } catch {}
          }, delta));
        }
      }
    }
  },

  async cancelAll(): Promise<void> {
    clearWebNotificationTimers();
    const existing = readSchedules();
    writeSchedules([]);
    const native = await getCapacitorLocalNotifications();
    if (native && existing.length > 0) {
      await native.cancel({ notifications: existing.map((s) => ({ id: hashId(s.id) })) });
    }
  },

  /** Fire an immediate local notification (e.g. "Your film is ready"). */
  async fireImmediate(title: string, body: string, kind: NotificationSchedule['kind']): Promise<void> {
    const prefs = readPrefs();
    if (kind === 'film-ready' && !prefs.filmReadyEnabled) return;

    const native = await getCapacitorLocalNotifications();
    if (native) {
      await ensureChannel(native);
      await native.schedule({
        notifications: [{
          id: hashId(`${kind}-${Date.now()}`),
          title,
          body,
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: NOTIFICATION_SMALL_ICON,
          iconColor: NOTIFICATION_ICON_COLOR,
          schedule: { at: new Date(Date.now() + 500) },
          extra: { kind, view: KIND_VIEWS[kind] },
        }],
      });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch {}
    }
  },

  listPending(): NotificationSchedule[] {
    return readSchedules();
  },

  /**
   * Route notification taps to the relevant screen. Local reminders carry
   * `extra.view` (set by applySchedule/fireImmediate); partner pushes may
   * carry `data.view` from the Edge Function, defaulting to home. The
   * caller validates the view name before navigating.
   * Returns a cleanup function; resolves to a no-op on web.
   */
  async bindTapRouting(onNavigate: (view: string) => void): Promise<() => void> {
    const handles: PluginListenerHandle[] = [];

    const local = await getCapacitorLocalNotifications();
    if (local && typeof local.addListener === 'function') {
      try {
        handles.push(await local.addListener('localNotificationActionPerformed', (action) => {
          const view = action.notification?.extra?.view;
          if (view) onNavigate(view);
        }));
      } catch { /* listener unsupported on this platform */ }
    }

    const push = await getCapacitorPushNotifications();
    if (push) {
      try {
        // A push delivered while the app is FOREGROUNDED is not auto-shown by
        // the OS — surface it as an in-app toast so it isn't silently dropped.
        handles.push(await push.addListener('pushNotificationReceived', (notification) => {
          const message = notification?.title || notification?.body;
          if (message) toast.show(message, 'heart');
        }));
      } catch { /* listener unsupported on this platform */ }
      try {
        handles.push(await push.addListener('pushNotificationActionPerformed', (action) => {
          onNavigate(action.notification?.data?.view || 'home');
        }));
      } catch { /* listener unsupported on this platform */ }
    }

    return () => {
      handles.forEach((handle) => { void handle.remove(); });
    };
  },

  /**
   * Register this device for push notifications.
   * - Native (Android/iOS): uses @capacitor/push-notifications → FCM token
   * - Web PWA: uses VAPID Web Push subscription
   * The token is stored in Supabase `device_push_tokens` so the
   * `send-partner-nudge` Edge Function can reach either partner's device.
   *
   * `prompt` controls whether a never-decided permission state may trigger the
   * OS dialog. App startup MUST pass `false`: the device is only registered
   * when permission is ALREADY granted, never firing a cold OS prompt. An
   * explicit user gesture may pass `true` to request-then-register.
   */
  async registerPushToken({ prompt = false }: { prompt?: boolean } = {}): Promise<void> {
    if (!SupabaseService.isConfigured()) return;

    const deviceId = localStorage.getItem('lior_device_id') || 'unknown';

    // ── Native path: Capacitor PushNotifications ─────────────────────
    const nativePush = await getCapacitorPushNotifications();
    if (nativePush) {
      // Non-prompting startup must NOT trigger the OS dialog — only inspect the
      // current state. Prompting callers (explicit consent) may request it.
      const { receive } = prompt
        ? await nativePush.requestPermissions().catch(() => ({ receive: 'denied' as const }))
        : await nativePush.checkPermissions().catch(() => ({ receive: 'denied' as const }));
      if (receive !== 'granted') return;

      // Pre-create the high-importance channel so a remote push that arrives
      // before any local-notification scheduling still shows as a heads-up
      // banner (otherwise it lands on the default channel, silently).
      const localForChannel = await getCapacitorLocalNotifications();
      if (localForChannel) await ensureChannel(localForChannel);

      if (!pushRegistrationListenerBound) {
        await nativePush.addListener('registration', (token: { value: string }) => {
          void savePushToken(token.value, 'fcm', deviceId);
        });
        // Surface FCM token-acquisition failures instead of swallowing them —
        // otherwise "no push on this device" is impossible to diagnose.
        await nativePush.addListener('registrationError', (err: unknown) => {
          DiagnosticsService.recordError('notifications.push_registration_error', err);
        });
        pushRegistrationListenerBound = true;
      }

      await nativePush.register();
      return; // native path handled
    }

    // ── Web PWA path: VAPID subscription ─────────────────────────────
    const vapidKey = (import.meta as { env?: Record<string, string> }).env?.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      await savePushToken(JSON.stringify(subscription.toJSON()), 'web', deviceId);
    } catch { /* permission denied or not supported */ }
  },

  /**
   * Trigger the server-side partner nudge after recording a pulse check.
   * Fire-and-forget — does not block the recording flow.
   * Forwards `{ type, senderName }` so the edge function can tailor the
   * notification and (for non-pulse types) the partner sees who it's from.
   */
  async triggerPartnerNudge(type = 'pulse_check', senderName = ''): Promise<void> {
    if (!readPrefs().partnerNudgeEnabled) return;
    if (!SupabaseService.isConfigured() || !SupabaseService.client) return;
    try {
      const token = await SupabaseService.getAccessToken();
      if (!token) return;
      const { url } = SupabaseService.getProjectConfig();
      if (!url) return;

      await fetch(`${url}/functions/v1/send-partner-nudge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, senderName }),
      });
    } catch { /* fire-and-forget */ }
  },

  /**
   * Whether a server-side partner push can actually be delivered from THIS
   * client. Mirrors the exact preconditions `triggerPartnerNudge` needs to do
   * anything: Supabase configured + a live client + an access token + a project
   * URL. When this is false the push is a guaranteed no-op, so callers (e.g. the
   * daily-ritual reveal) fall back to a LOCAL notification instead. Never throws.
   */
  async pushBackendAvailable(): Promise<boolean> {
    try {
      if (!SupabaseService.isConfigured() || !SupabaseService.client) return false;
      const { url } = SupabaseService.getProjectConfig();
      if (!url) return false;
      const token = await SupabaseService.getAccessToken();
      return Boolean(token);
    } catch {
      return false;
    }
  },

  /**
   * Send the partner a push when the heartbeat button is tapped, so it lands
   * even if their app is closed. Fire-and-forget — never blocks the UI.
   * `senderName` is the current user's display name (the partner sees it).
   */
  async triggerHeartbeatPush(senderName: string): Promise<void> {
    if (!readPrefs().partnerNudgeEnabled) return;
    const now = Date.now();
    if (now - lastHeartbeatPushAt < HEARTBEAT_PUSH_COOLDOWN_MS) return;
    if (!SupabaseService.isConfigured() || !SupabaseService.client) return;
    try {
      const token = await SupabaseService.getAccessToken();
      if (!token) return;
      const { url } = SupabaseService.getProjectConfig();
      if (!url) return;

      // Stamp the cooldown only once a send is actually about to fire — burning
      // it on a skipped/failed precondition would silently rate-limit a real
      // heartbeat for up to 3s even though no push went out.
      lastHeartbeatPushAt = now;
      await fetch(`${url}/functions/v1/send-partner-nudge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'heartbeat', senderName }),
      });
    } catch { /* fire-and-forget */ }
  },

  /**
   * Push the partner about today's Daily Drop. Fire-and-forget.
   *  - 'dropped'  : I answered first → "{me} dropped something for you"
   *  - 'nudge'    : I'm waiting on them → "{me} is waiting on you"
   *  - 'unsealed' : I answered second → "{me} answered — your drop unsealed"
   */
  async triggerDropPush(subtype: 'dropped' | 'nudge' | 'unsealed', senderName: string): Promise<void> {
    if (!SupabaseService.isConfigured() || !SupabaseService.client) return;
    try {
      const token = await SupabaseService.getAccessToken();
      if (!token) return;
      const { url } = SupabaseService.getProjectConfig();
      if (!url) return;

      await fetch(`${url}/functions/v1/send-partner-nudge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'daily_drop', subtype, senderName }),
      });
    } catch { /* fire-and-forget */ }
  },
};

async function savePushToken(token: string, platform: 'fcm' | 'web', deviceId: string): Promise<void> {
  try {
    const [userId, coupleId] = await Promise.all([
      SupabaseService.getCurrentUserId(),
      SupabaseService.getCurrentCoupleId(),
    ]);
    if (!userId || !coupleId || !SupabaseService.client) return;

    await SupabaseService.client.from('device_push_tokens').upsert({
      id: `${userId}:${deviceId}`,
      user_id: userId,
      couple_id: coupleId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch { /* best-effort */ }
}
