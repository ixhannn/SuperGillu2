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

const CAP_NS = '@capacitor/local-notifications';

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
};

type NativePermissionState = 'granted' | 'denied' | 'prompt';

function isNativeNotificationRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function getCapacitorLocalNotifications(): Promise<LocalNotifications | null> {
  if (!isNativeNotificationRuntime()) return null;
  try {
    // Dynamic import — safe when plugin is not installed
    const mod = (await import(/* @vite-ignore */ CAP_NS)) as { LocalNotifications?: LocalNotifications };
    return mod.LocalNotifications ?? null;
  } catch {
    return null;
  }
}

async function getCapacitorPushNotifications(): Promise<PushNotifications | null> {
  if (!isNativeNotificationRuntime()) return null;
  try {
    const mod = (await import(/* @vite-ignore */ '@capacitor/push-notifications')) as { PushNotifications?: PushNotifications };
    return mod.PushNotifications ?? null;
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
};

let pushRegistrationListenerBound = false;

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

function nextOccurrenceOf(timeStr: string, targetWeekday?: number): Date {
  const [hh, mm] = timeStr.split(':').map(Number);
  const now = new Date();
  const candidate = new Date();
  candidate.setHours(hh ?? 20, mm ?? 0, 0, 0);
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
      if (!push) return toNotificationPermission(local.display);
      const remote = await push.requestPermissions().catch(() => ({ receive: 'denied' as const }));
      const permission = mergePermissionStates(local.display, remote.receive);
      if (permission === 'granted') {
        await this.registerPushToken().catch(() => {});
      }
      return toNotificationPermission(permission);
    }
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await this.registerPushToken().catch(() => {});
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
        id: `daily-clip-${when.toISOString().slice(0, 10)}`,
        kind: 'daily-clip',
        fireAt: when.toISOString(),
        title: 'Five seconds of right now',
        body: 'Capture today’s clip before bed.',
      });
    }

    if (prefs.recapEnabled) {
      const when = nextOccurrenceOf(prefs.recapTime, 0 /* Sunday */);
      queued.push({
        id: `recap-${when.toISOString().slice(0, 10)}`,
        kind: 'recap-sunday',
        fireAt: when.toISOString(),
        title: 'Your week, in a page',
        body: 'Open your weekly recap — it only takes a minute.',
      });
    }

    if (prefs.ritualEnabled) {
      const when = nextOccurrenceOf(prefs.ritualTime);
      queued.push({
        id: `daily-ritual-${when.toISOString().slice(0, 10)}`,
        kind: 'daily-ritual',
        fireAt: when.toISOString(),
        title: 'Today’s question is waiting',
        body: 'Answer together — they won’t see yours until they answer too.',
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
      const payload = queued.map((s) => ({
        id: hashId(s.id),
        title: s.title,
        body: s.body,
        channelId: ANDROID_CHANNEL_ID,
        smallIcon: 'ic_notification',
        schedule: { at: new Date(s.fireAt), allowWhileIdle: true },
        // `view` routes the tap to the relevant screen (see bindTapRouting).
        extra: { kind: s.kind, view: KIND_VIEWS[s.kind], ...s.payload },
      }));
      if (payload.length > 0) await native.schedule({ notifications: payload });
    }
    // Web fallback: we can't pre-schedule beyond session. Use setTimeout
    // only for notifications firing in the next 2 hours (session-bound).
    else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const s of queued) {
        const delta = new Date(s.fireAt).getTime() - Date.now();
        if (delta > 0 && delta < 2 * 60 * 60 * 1000) {
          setTimeout(() => {
            try { new Notification(s.title, { body: s.body }); } catch {}
          }, delta);
        }
      }
    }
  },

  async cancelAll(): Promise<void> {
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
          smallIcon: 'ic_notification',
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

      if (!pushRegistrationListenerBound) {
        await nativePush.addListener('registration', (token: { value: string }) => {
          void savePushToken(token.value, 'fcm', deviceId);
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
        body: JSON.stringify({ type: 'heartbeat', senderName }),
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
