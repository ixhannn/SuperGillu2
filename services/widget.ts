/**
 * WidgetService — feeds the Android home-screen widget (the native `LiorWidget`
 * plugin → PartnerWidgetProvider).
 *
 * It resolves the partner's latest photo (today's daily moment → their most recent
 * memory photo → the couple profile photo) to a base64 data URI, computes
 * days-together, and pushes both to the widget. It self-subscribes to storage
 * changes so the widget refreshes when a new partner photo or profile syncs.
 *
 * No-op on web — the native plugin only exists in the Android build.
 */
import { registerPlugin, Capacitor, CapacitorHttp } from '@capacitor/core';
import { StorageService, storageEventTarget } from './storage';
import { daysTogetherFrom, parseStoredDateOnly } from '../shared/dateOnly.js';
import { selectImageStoragePath } from '../utils/mediaRefs';
import { isDailyMomentExpired } from '../shared/mediaRetention.js';
import { NativeShellService } from './nativeShell';
import type { DailyPhoto, Memory } from '../types';

interface LiorWidgetPlugin {
  /**
   * Push the day count + name. `image` is a data URI (omit to keep the current one);
   * `clearImage` explicitly drops the stored photo back to the placeholder.
   */
  update(options: { image?: string; clearImage?: boolean; days: number; partnerName?: string }): Promise<void>;
  clear(): Promise<void>;
}

const LiorWidget = registerPlugin<LiorWidgetPlugin>('LiorWidget');

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const myDeviceId = (): string => {
  try {
    return localStorage.getItem('lior_device_id') || '';
  } catch {
    return '';
  }
};

/** The stable Supabase user id — survives reinstalls, unlike the per-install device id. */
const myUserId = (): string => {
  try {
    return StorageService.getMyUserId() || '';
  } catch {
    return '';
  }
};

/**
 * A resolved partner image plus whether any candidate existed at all. This lets the
 * caller distinguish "the partner has no photo anywhere" (→ clear the widget) from
 * "a photo exists but failed to load right now" (→ keep the last-known-good rather
 * than blanking a good widget on a flaky network or an expired signed URL).
 */
interface ResolvedImage {
  image: string | null;
  hadCandidate: boolean;
}

/** Resolve a media reference to a base64 data URI (download + convert if it's an http URL). */
async function toDataUri(resolved: string | null): Promise<string | null> {
  if (!resolved) return null;
  if (resolved.startsWith('data:')) return resolved;
  if (resolved.startsWith('http')) {
    try {
      // Use the NATIVE HTTP stack, not the WebView fetch(). The partner's R2/worker
      // URL is cross-origin and, in the unsigned dual-accept rollout, carries no CORS
      // headers — so a programmatic fetch().blob() is blocked and always returned null
      // (<img> works in-app only because element loads are CORS-exempt). CapacitorHttp
      // goes through OkHttp, isn't subject to CORS, and hands back base64.
      const resp = await CapacitorHttp.get({ url: resolved, responseType: 'blob' });
      const status = typeof resp.status === 'number' ? resp.status : 0;
      const data = typeof resp.data === 'string' ? resp.data : '';
      if (status < 200 || status >= 300 || !data) return null;
      if (data.startsWith('data:')) return data;
      const headers = (resp.headers || {}) as Record<string, string>;
      const contentType = headers['Content-Type'] || headers['content-type'] || 'image/jpeg';
      return `data:${contentType};base64,${data}`;
    } catch {
      return null;
    }
  }
  return null;
}

async function resolvePhotoFromDaily(): Promise<ResolvedImage> {
  const myDev = myDeviceId();
  const myUid = myUserId();
  // With no stable identity at all we cannot tell our own moments from the
  // partner's — show nothing rather than risk surfacing the user's own face.
  if (!myDev && !myUid) return { image: null, hadCandidate: false };
  // A moment is "mine" if its stable owner id matches me, or (legacy daily photos
  // carry only a per-install device id) its senderId matches this install.
  const isMine = (p: DailyPhoto): boolean =>
    (!!p.ownerUserId && !!myUid && p.ownerUserId === myUid) || (!!myDev && p.senderId === myDev);
  const partnerMoments: DailyPhoto[] = StorageService.getDailyPhotos()
    .filter((p) => !isDailyMomentExpired(p) && !isMine(p))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  for (const p of partnerMoments) {
    const uri = await toDataUri(
      await StorageService.getImage(p.imageId || '', p.image, selectImageStoragePath(p.storagePath, p.imageMimeType)),
    );
    if (uri) return { image: uri, hadCandidate: true };
  }
  return { image: null, hadCandidate: partnerMoments.length > 0 };
}

async function resolvePhotoFromMemories(): Promise<ResolvedImage> {
  const myUid = myUserId();
  const memories: Memory[] = (StorageService.getMemories() || [])
    .filter((m) => !!(m.imageId || m.image || m.storagePath))
    // Prefer partner-authored memories so the widget honours its "their photo" intent.
    .filter((m) => !(myUid && m.ownerUserId === myUid))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  for (const m of memories) {
    const uri = await toDataUri(
      await StorageService.getImage(m.imageId || '', m.image, selectImageStoragePath(m.storagePath, m.imageMimeType)),
    );
    if (uri) return { image: uri, hadCandidate: true };
  }
  return { image: null, hadCandidate: memories.length > 0 };
}

/** Partner's latest moment → recent memory photo → couple profile photo. */
async function resolvePartnerImage(profilePhoto?: string): Promise<ResolvedImage> {
  const daily = await resolvePhotoFromDaily();
  if (daily.image) return daily;
  const memory = await resolvePhotoFromMemories();
  if (memory.image) return memory;
  const profile = profilePhoto && profilePhoto.startsWith('data:') ? profilePhoto : null;
  if (profile) return { image: profile, hadCandidate: true };
  return { image: null, hadCandidate: daily.hadCandidate || memory.hadCandidate };
}

let refreshing = false;
let listenerBound = false;

export const WidgetService = {
  async refresh(): Promise<void> {
    // Never push before StorageService has hydrated — the bootstrap cache is empty,
    // which would persist a bogus 0-days / no-photo snapshot to the widget.
    if (!isNative() || refreshing || !StorageService.isInitialized) return;
    refreshing = true;
    try {
      const profile = StorageService.getCoupleProfile();
      const start = parseStoredDateOnly(profile.anniversaryDate);
      const days = start ? daysTogetherFrom(start, new Date()) : 0;
      const resolved = await resolvePartnerImage(profile.photo);
      await LiorWidget.update({
        image: resolved.image ?? undefined,
        // Clear ONLY when the partner genuinely has no photo anywhere — never when a
        // candidate existed but failed to download (offline / expired URL), so a flaky
        // network can't blank a good widget. A since-deleted last photo (no candidate
        // left) still falls back to the placeholder.
        clearImage: (!resolved.image && !resolved.hadCandidate) ? true : undefined,
        days: Number.isFinite(days) ? days : 0,
        partnerName: profile.partnerName || '',
      });
    } catch {
      // Best-effort: a widget refresh must never disrupt the app.
    } finally {
      refreshing = false;
    }
  },

  init(): void {
    if (!isNative() || listenerBound) return;
    listenerBound = true;
    storageEventTarget.addEventListener('storage-update', (e: Event) => {
      const detail = (e as CustomEvent).detail as { table?: string } | undefined;
      const table = detail?.table;
      if (!table || table === 'daily_photos' || table === 'couple_profile' || table === 'memories' || table === 'init') {
        void WidgetService.refresh();
      }
    });
    // Refresh when the app returns to foreground — the partner may have posted while away.
    try {
      NativeShellService.onResume(() => { void WidgetService.refresh(); });
    } catch {
      // NativeShell may be unavailable in some shells; the storage listener still covers updates.
    }
    // The first push must wait for StorageService to hydrate, or it writes a bogus
    // 0-days / no-photo snapshot from the empty bootstrap cache. The 'init' storage
    // event normally drives this, but init() and StorageService.init() are unsequenced
    // at bootstrap, so the event can fire before this listener binds (no replay). Poll
    // until storage is ready, then refresh once; the storage-update listener keeps it
    // fresh after (couple_profile / daily_photos / memories syncs).
    const ensureFirstRefresh = (attempt: number): void => {
      if (StorageService.isInitialized) {
        void WidgetService.refresh();
        return;
      }
      if (attempt >= 20) return;
      setTimeout(() => ensureFirstRefresh(attempt + 1), 500);
    };
    ensureFirstRefresh(0);
  },

  /** Wipe the widget (photo + counts) — called on sign-out / account deletion so an
   *  ex-partner's face never lingers on the home screen after the data is gone. */
  async clear(): Promise<void> {
    if (!isNative()) return;
    try {
      await LiorWidget.clear();
    } catch {
      // Best-effort: clearing the widget must never block sign-out.
    }
  },
};
