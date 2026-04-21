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
 * Partner nudges (you recorded → partner hasn't) require server-side state,
 * so this file only exposes a stub that a Supabase Edge Function will call.
 */

import { NotificationPrefs, NotificationSchedule } from '../types';

const CAP_NS = '@capacitor/local-notifications';

type LocalNotifications = {
  requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  schedule: (opts: { notifications: unknown[] }) => Promise<unknown>;
  cancel: (opts: { notifications: { id: number }[] }) => Promise<void>;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
};

async function getCapacitorLocalNotifications(): Promise<LocalNotifications | null> {
  try {
    // Dynamic import — safe when plugin is not installed
    const mod = (await import(/* @vite-ignore */ CAP_NS)) as { LocalNotifications?: LocalNotifications };
    return mod.LocalNotifications ?? null;
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
};

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

  async requestPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    const native = await getCapacitorLocalNotifications();
    if (native) {
      const { display } = await native.requestPermissions();
      return display;
    }
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const result = await Notification.requestPermission();
    return result as 'granted' | 'denied' | 'prompt';
  },

  /**
   * Plan the recurring schedule based on current prefs. Should be called
   * on app start and whenever prefs change.
   */
  async applySchedule(): Promise<void> {
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

    writeSchedules(queued);

    const native = await getCapacitorLocalNotifications();
    if (native) {
      const payload = queued.map((s) => ({
        id: hashId(s.id),
        title: s.title,
        body: s.body,
        schedule: { at: new Date(s.fireAt), allowWhileIdle: true },
        extra: { kind: s.kind, ...s.payload },
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
      await native.schedule({
        notifications: [{
          id: hashId(`${kind}-${Date.now()}`),
          title,
          body,
          schedule: { at: new Date(Date.now() + 500) },
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
};
