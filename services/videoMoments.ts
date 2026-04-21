/**
 * Daily Video Moments service — 5-second clips, bi-weekly films.
 *
 * Key architectural choices (see plans/memoized-frolicking-wren.md):
 *  - IDB stores video/thumbnail as **Blob** (not base64). 33% smaller, no encode cost.
 *  - Cycles are ISO-week-aligned: start on a Sunday, end on the Saturday 14 days later.
 *    Anchor stored on couple profile so both partners compute identical cycles offline.
 *  - Partner clip thumbnails are gated by `partnerVisibleAt` — flipped only when the
 *    cycle's film reaches 'ready'. Timeline renders ghost frames until then.
 *  - After a film is ready, source clip Blobs are deleted (thumbnails + film retained).
 *  - Storage quota is checked before every record; block at 90%, warn at 70%.
 */

import {
  DailyVideoClip,
  VideoMomentDay,
  BiweeklyFilm,
  VideoMomentSettings,
} from '../types';
import { generateId } from '../utils/ids';

// ── Constants ─────────────────────────────────────────────────────────
const DB_NAME = 'LiorVault_v11'; // kept; migration via mediaMigration.ts
const DB_VERSION = 1;
const STORES = {
  DATA: 'metadata_store',
  IMAGES: 'image_vault',
};

const CACHE_KEYS = {
  VIDEO_CLIPS: 'lior_daily_video_clips',
  VIDEO_SETTINGS: 'lior_video_moment_settings',
  BIWEEKLY_FILMS: 'lior_biweekly_films',
  CYCLE_EPOCH: 'lior_cycle_epoch',
};

export const MAX_CLIP_MS = 5000;
export const CYCLE_DAYS = 14;

// ── Events ────────────────────────────────────────────────────────────
export const videoMomentsEventTarget = new EventTarget();
const emitUpdate = () => {
  videoMomentsEventTarget.dispatchEvent(new CustomEvent('video-moments-update'));
};

// ── IndexedDB helpers ─────────────────────────────────────────────────
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.DATA)) db.createObjectStore(STORES.DATA);
      if (!db.objectStoreNames.contains(STORES.IMAGES)) db.createObjectStore(STORES.IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const writeRaw = async (store: string, key: string, val: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const readRaw = async <T>(store: string, key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve((req.result as T) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
};

const deleteRaw = async (store: string, key: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

// ── Date / cycle helpers ──────────────────────────────────────────────

/** Local ISO date (YYYY-MM-DD) — uses device local time. */
export const getLocalDateString = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Most-recent-or-today Sunday as a YYYY-MM-DD string (local time). */
export const getSundayOnOrBefore = (date: Date = new Date()): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay() 0=Sun
  return getLocalDateString(d);
};

/** Add `days` to a YYYY-MM-DD string, returning a new YYYY-MM-DD. */
export const addDays = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalDateString(dt);
};

/**
 * Compute the cycle (start/end) containing the given date.
 * Cycle start = Sunday. Length = 14 days. Anchor = couple epoch (stored)
 * or first Sunday of 2024 as a deterministic fallback.
 */
export const getCycleFor = (date: Date = new Date()): { start: string; end: string } => {
  const anchor = getCoupleEpoch();
  const anchorDate = new Date(anchor + 'T00:00:00');
  const daysSinceAnchor = Math.floor(
    (new Date(getLocalDateString(date) + 'T00:00:00').getTime() - anchorDate.getTime()) / 86400000
  );
  const cycleIndex = Math.floor(daysSinceAnchor / CYCLE_DAYS);
  const start = addDays(anchor, cycleIndex * CYCLE_DAYS);
  const end = addDays(start, CYCLE_DAYS - 1);
  return { start, end };
};

/** Stable couple-shared epoch (first Sunday) for cycle math. */
const getCoupleEpoch = (): string => {
  const stored = localStorage.getItem(CACHE_KEYS.CYCLE_EPOCH);
  if (stored) return stored;
  // First-time setup: anchor to the Sunday on/before today.
  const epoch = getSundayOnOrBefore();
  localStorage.setItem(CACHE_KEYS.CYCLE_EPOCH, epoch);
  return epoch;
};

export const setCoupleEpoch = (ymd: string): void => {
  localStorage.setItem(CACHE_KEYS.CYCLE_EPOCH, ymd);
};

// ── Identity helpers ──────────────────────────────────────────────────
const getDeviceId = (): string => {
  let id = localStorage.getItem('lior_device_id');
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem('lior_device_id', id);
  }
  return id;
};

const getCoupleId = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return profile.odCoupleId || 'local';
  } catch {
    return 'local';
  }
};

// ── Cache ─────────────────────────────────────────────────────────────
let clipCache: DailyVideoClip[] | null = null;
let filmCache: BiweeklyFilm[] | null = null;
let ensureFilmsPromise: Promise<void> | null = null;

const loadClips = async (): Promise<DailyVideoClip[]> => {
  if (clipCache) return clipCache;
  const data = await readRaw<DailyVideoClip[]>(STORES.DATA, CACHE_KEYS.VIDEO_CLIPS);
  clipCache = data ?? [];
  return clipCache;
};

const saveClips = async (clips: DailyVideoClip[]): Promise<void> => {
  clipCache = clips;
  await writeRaw(STORES.DATA, CACHE_KEYS.VIDEO_CLIPS, clips);
  emitUpdate();
};

const loadFilms = async (): Promise<BiweeklyFilm[]> => {
  if (filmCache) return filmCache;
  const data = await readRaw<BiweeklyFilm[]>(STORES.DATA, CACHE_KEYS.BIWEEKLY_FILMS);
  filmCache = data ?? [];
  return filmCache;
};

const saveFilms = async (films: BiweeklyFilm[]): Promise<void> => {
  filmCache = films;
  await writeRaw(STORES.DATA, CACHE_KEYS.BIWEEKLY_FILMS, films);
  emitUpdate();
};

const getCoupleNames = (): [string, string] => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return [profile.myName || 'You', profile.partnerName || 'Them'];
  } catch {
    return ['You', 'Them'];
  }
};

// ── Storage quota ─────────────────────────────────────────────────────
export interface QuotaStatus {
  usageBytes: number;
  quotaBytes: number;
  ratio: number; // 0-1
  level: 'ok' | 'warn' | 'critical';
}

export const getQuotaStatus = async (): Promise<QuotaStatus> => {
  if (!navigator.storage?.estimate) {
    return { usageBytes: 0, quotaBytes: 0, ratio: 0, level: 'ok' };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const ratio = quota ? usage / quota : 0;
    const level: QuotaStatus['level'] = ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'warn' : 'ok';
    return { usageBytes: usage, quotaBytes: quota, ratio, level };
  } catch {
    return { usageBytes: 0, quotaBytes: 0, ratio: 0, level: 'ok' };
  }
};

export const requestPersistentStorage = async (): Promise<boolean> => {
  if (!navigator.storage?.persist) return false;
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

// ── Thumbnail extraction ──────────────────────────────────────────────
/**
 * Extract a JPEG thumbnail Blob from a video Blob by seeking to ~25% of its duration.
 * Returns a 320x568 vertical thumb (covers most phone aspect ratios).
 */
const extractThumbnail = async (videoBlob: Blob): Promise<Blob> => {
  const url = URL.createObjectURL(videoBlob);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('thumb load failed'));
    });

    const seekTo = Math.max(0, Math.min(video.duration * 0.25, 1));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = seekTo;
    });

    const W = 320, H = 568;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // object-fit: cover
    const vw = video.videoWidth || W;
    const vh = video.videoHeight || H;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('thumb encode failed'))),
        'image/jpeg',
        0.82
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

// ── Service ───────────────────────────────────────────────────────────
export const VideoMomentsService = {
  MAX_CLIP_MS,
  CYCLE_DAYS,

  getCycleFor,
  getSundayOnOrBefore,
  addDays,
  getLocalDateString,

  /** Record (or replace) today's clip for this device's user. */
  async recordClip(videoBlob: Blob, durationMs: number): Promise<DailyVideoClip> {
    // Quota check
    const quota = await getQuotaStatus();
    if (quota.level === 'critical') {
      throw new Error('Storage is nearly full — delete old clips before recording a new one.');
    }

    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();
    const coupleId = getCoupleId();

    // One clip per user per day — replace existing
    const existingIdx = clips.findIndex(c => c.clipDate === today && c.odUserId === userId);
    const prev = existingIdx >= 0 ? clips[existingIdx] : null;

    // If replacing, clean up old blobs first
    if (prev?.videoId) { try { await deleteRaw(STORES.IMAGES, prev.videoId); } catch {} }
    if (prev?.thumbnailId) { try { await deleteRaw(STORES.IMAGES, prev.thumbnailId); } catch {} }

    const id = prev?.id ?? generateId();
    const videoId = `video_clip_${id}`;
    const thumbnailId = `thumb_clip_${id}`;

    // Trim duration to hard cap
    const safeDuration = Math.min(durationMs, MAX_CLIP_MS);

    // Generate thumbnail from the video
    let thumbBlob: Blob | null = null;
    try { thumbBlob = await extractThumbnail(videoBlob); } catch { thumbBlob = null; }

    // Store Blobs (not base64)
    await writeRaw(STORES.IMAGES, videoId, videoBlob);
    if (thumbBlob) await writeRaw(STORES.IMAGES, thumbnailId, thumbBlob);

    const clip: DailyVideoClip = {
      id,
      odCoupleId: coupleId,
      odUserId: userId,
      clipDate: today,
      videoId,
      thumbnailId: thumbBlob ? thumbnailId : undefined,
      durationMs: safeDuration,
      recordedAt: new Date().toISOString(),
      watchedByPartner: false,
      syncPending: true,
    };

    if (existingIdx >= 0) clips[existingIdx] = clip;
    else clips.push(clip);

    await saveClips(clips);
    await this.updateStreak();

    // Opportunistic storage persistence request on first record
    requestPersistentStorage().catch(() => {});

    return clip;
  },

  /** Delete a clip (the user's own). Clean up blobs. */
  async deleteClip(id: string): Promise<void> {
    const clips = await loadClips();
    const userId = getDeviceId();
    const target = clips.find(c => c.id === id && c.odUserId === userId);
    if (!target) return;
    if (target.videoId) { try { await deleteRaw(STORES.IMAGES, target.videoId); } catch {} }
    if (target.thumbnailId) { try { await deleteRaw(STORES.IMAGES, target.thumbnailId); } catch {} }
    await saveClips(clips.filter(c => c.id !== id));
    await this.updateStreak();
  },

  async hasRecordedToday(): Promise<boolean> {
    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();
    return clips.some(c => c.clipDate === today && c.odUserId === userId);
  },

  async getTodayClips(): Promise<VideoMomentDay> {
    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();
    const todayClips = clips.filter(c => c.clipDate === today);
    const userClip = todayClips.find(c => c.odUserId === userId);
    const partnerClip = todayClips.find(c => c.odUserId !== userId);
    return { date: today, userClip, partnerClip, bothRecorded: !!(userClip && partnerClip) };
  },

  /** All clips for the cycle containing `date`, grouped by day. */
  async getClipsForCycle(date: Date = new Date()): Promise<VideoMomentDay[]> {
    const clips = await loadClips();
    const userId = getDeviceId();
    const { start, end } = getCycleFor(date);

    const days: VideoMomentDay[] = [];
    for (let i = 0; i < CYCLE_DAYS; i++) {
      const dayStr = addDays(start, i);
      const dayClips = clips.filter(c => c.clipDate === dayStr);
      const userClip = dayClips.find(c => c.odUserId === userId);
      const partnerClip = dayClips.find(c => c.odUserId !== userId);
      days.push({ date: dayStr, userClip, partnerClip, bothRecorded: !!(userClip && partnerClip) });
    }
    // end variable currently unused here but returned in getCycleFor for consumers
    void end;
    return days;
  },

  /** All clips for an arbitrary week (7 days starting from `weekStart`). Used by Weekly Recap. */
  async getClipsForWeek(weekStart: string): Promise<VideoMomentDay[]> {
    const clips = await loadClips();
    const userId = getDeviceId();
    const days: VideoMomentDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dayStr = addDays(weekStart, i);
      const dayClips = clips.filter(c => c.clipDate === dayStr);
      const userClip = dayClips.find(c => c.odUserId === userId);
      const partnerClip = dayClips.find(c => c.odUserId !== userId);
      days.push({ date: dayStr, userClip, partnerClip, bothRecorded: !!(userClip && partnerClip) });
    }
    return days;
  },

  /**
   * Is this partner clip viewable yet? Gated by the containing cycle's film being ready.
   * User's own clip is always viewable.
   */
  async isClipRevealed(clip: DailyVideoClip): Promise<boolean> {
    const userId = getDeviceId();
    if (clip.odUserId === userId) return true;
    if (clip.partnerVisibleAt) return true;
    // Also reveal if the containing cycle's film is ready
    const { start } = getCycleFor(new Date(clip.clipDate + 'T00:00:00'));
    const films = await loadFilms();
    const film = films.find(f => f.cycleStart === start && f.status === 'ready');
    return !!film;
  },

  /** Get a video Blob URL (or null). Respects partner visibility gate. */
  async getVideoUrl(clip: DailyVideoClip): Promise<string | null> {
    const revealed = await this.isClipRevealed(clip);
    if (!revealed) return null;
    if (!clip.videoId) return null;
    const blob = await readRaw<Blob>(STORES.IMAGES, clip.videoId);
    if (!blob) return null;
    if (blob instanceof Blob) return URL.createObjectURL(blob);
    // Legacy base64 path (pre-migration)
    if (typeof blob === 'string') return blob;
    return null;
  },

  /** Raw Blob access (compiler). Does NOT apply partner visibility gate. */
  async getVideoBlob(clip: DailyVideoClip): Promise<Blob | null> {
    if (!clip.videoId) return null;
    const v = await readRaw<Blob | string>(STORES.IMAGES, clip.videoId);
    if (!v) return null;
    if (v instanceof Blob) return v;
    // Legacy base64 → Blob fallback
    if (typeof v === 'string' && v.startsWith('data:')) {
      try {
        const resp = await fetch(v);
        return await resp.blob();
      } catch { return null; }
    }
    return null;
  },

  async getThumbnailUrl(clip: DailyVideoClip): Promise<string | null> {
    if (!clip.thumbnailId) return null;
    const t = await readRaw<Blob | string>(STORES.IMAGES, clip.thumbnailId);
    if (!t) return null;
    if (t instanceof Blob) return URL.createObjectURL(t);
    if (typeof t === 'string') return t;
    return null;
  },

  /** Reveal all partner clips in a cycle once its film is ready. */
  async revealCycle(cycleStart: string): Promise<void> {
    const clips = await loadClips();
    const end = addDays(cycleStart, CYCLE_DAYS - 1);
    const now = new Date().toISOString();
    let changed = false;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (c.clipDate >= cycleStart && c.clipDate <= end && !c.partnerVisibleAt) {
        clips[i] = { ...c, partnerVisibleAt: now };
        changed = true;
      }
    }
    if (changed) await saveClips(clips);
  },

  /** Mark clip as watched by partner. */
  async markWatched(clipId: string): Promise<void> {
    const clips = await loadClips();
    const idx = clips.findIndex(c => c.id === clipId);
    if (idx >= 0) {
      clips[idx] = { ...clips[idx], watchedByPartner: true, watchedAt: new Date().toISOString() };
      await saveClips(clips);
    }
  },

  // ── Bi-weekly films ─────────────────────────────────────────────────

  /** List all films for this couple, newest first. */
  async getAllFilms(): Promise<BiweeklyFilm[]> {
    const films = await loadFilms();
    return [...films].sort((a, b) => b.cycleStart.localeCompare(a.cycleStart));
  },

  async getFilmForCycle(cycleStart: string): Promise<BiweeklyFilm | null> {
    const films = await loadFilms();
    return films.find(f => f.cycleStart === cycleStart) ?? null;
  },

  async upsertFilm(film: BiweeklyFilm): Promise<void> {
    const films = await loadFilms();
    const idx = films.findIndex(f => f.cycleStart === film.cycleStart);
    if (idx >= 0) films[idx] = film;
    else films.push(film);
    await saveFilms(films);
  },

  /**
   * Generate missing films for any completed cycles that still have source
   * clips available locally. This runs lazily from the Daily Video screen.
   */
  async ensureFilmsUpToDate(referenceDate: Date = new Date()): Promise<void> {
    if (ensureFilmsPromise) return ensureFilmsPromise;

    ensureFilmsPromise = (async () => {
      const today = getLocalDateString(referenceDate);
      const clips = await loadClips();

      const completedCycles = new Map<string, string>();
      for (const clip of clips) {
        const { start, end } = getCycleFor(new Date(clip.clipDate + 'T00:00:00'));
        if (end >= today || !clip.videoId) continue;
        completedCycles.set(start, end);
      }

      if (completedCycles.size === 0) return;

      const settings = await this.getSettings();
      const coupleNames = getCoupleNames();
      const { VideoCompilerService } = await import('./videoCompiler');

      for (const [cycleStart, cycleEnd] of [...completedCycles.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const films = await loadFilms();
        const existing = films.find((film) => film.cycleStart === cycleStart);
        if (existing?.status === 'ready' || existing?.status === 'generating') continue;

        const days = await this.getClipsForCycle(new Date(cycleStart + 'T00:00:00'));
        const renderableClipCount = days.reduce(
          (count, day) => count + (day.userClip?.videoId ? 1 : 0) + (day.partnerClip?.videoId ? 1 : 0),
          0,
        );

        if (renderableClipCount === 0) continue;

        await VideoCompilerService.generateFilm({
          cycleStart,
          cycleEnd,
          days,
          coupleNames,
          musicTrackId: settings.preferredMusicTrackId,
        });
      }
    })().finally(() => {
      ensureFilmsPromise = null;
    });

    return ensureFilmsPromise;
  },

  /** Clip blobs are deleted after the film is ready — thumbnails retained. */
  async fossilizeCycleSource(cycleStart: string): Promise<void> {
    const clips = await loadClips();
    const end = addDays(cycleStart, CYCLE_DAYS - 1);
    for (const c of clips) {
      if (c.clipDate >= cycleStart && c.clipDate <= end && c.videoId) {
        try { await deleteRaw(STORES.IMAGES, c.videoId); } catch {}
      }
    }
    // Null out videoId but keep metadata + thumbnail
    const updated = clips.map(c =>
      c.clipDate >= cycleStart && c.clipDate <= end
        ? { ...c, videoId: undefined }
        : c
    );
    await saveClips(updated);
  },

  async saveFilmBlob(
    cycleStart: string,
    videoBlob: Blob,
    thumbnailBlob: Blob | null,
    durationMs: number,
    clipCount: number,
    musicTrackId?: string
  ): Promise<BiweeklyFilm> {
    const films = await loadFilms();
    const coupleId = getCoupleId();
    const existing = films.find(f => f.cycleStart === cycleStart);
    const id = existing?.id ?? generateId();
    const videoKey = `film_${cycleStart}_${id}`;
    const thumbKey = `film_thumb_${cycleStart}_${id}`;

    await writeRaw(STORES.IMAGES, videoKey, videoBlob);
    if (thumbnailBlob) await writeRaw(STORES.IMAGES, thumbKey, thumbnailBlob);

    const film: BiweeklyFilm = {
      id,
      coupleId,
      cycleStart,
      cycleEnd: addDays(cycleStart, CYCLE_DAYS - 1),
      videoId: videoKey,
      thumbnailId: thumbnailBlob ? thumbKey : undefined,
      durationMs,
      clipCount,
      musicTrackId,
      generatedAt: new Date().toISOString(),
      status: 'ready',
      progress: 1,
    };
    await this.upsertFilm(film);
    await this.revealCycle(cycleStart);
    await this.fossilizeCycleSource(cycleStart);
    return film;
  },

  async getFilmVideoUrl(film: BiweeklyFilm): Promise<string | null> {
    if (!film.videoId) return null;
    const b = await readRaw<Blob | string>(STORES.IMAGES, film.videoId);
    if (!b) return null;
    if (b instanceof Blob) return URL.createObjectURL(b);
    if (typeof b === 'string') return b;
    return null;
  },

  async getFilmThumbnailUrl(film: BiweeklyFilm): Promise<string | null> {
    if (!film.thumbnailId) return null;
    const b = await readRaw<Blob | string>(STORES.IMAGES, film.thumbnailId);
    if (!b) return null;
    if (b instanceof Blob) return URL.createObjectURL(b);
    if (typeof b === 'string') return b;
    return null;
  },

  // ── Streak + settings ───────────────────────────────────────────────

  async updateStreak(): Promise<void> {
    const settings = await this.getSettings();
    const clips = await loadClips();
    const userId = getDeviceId();

    const userClips = clips
      .filter(c => c.odUserId === userId)
      .sort((a, b) => b.clipDate.localeCompare(a.clipDate));

    if (userClips.length === 0) {
      await this.saveSettings({ ...settings, streakCount: 0, totalClips: 0 });
      return;
    }

    const today = getLocalDateString();
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
    const lastClipDate = userClips[0].clipDate;

    if (lastClipDate !== today && lastClipDate !== yesterday) {
      await this.saveSettings({
        ...settings,
        streakCount: 0,
        totalClips: userClips.length,
        lastClipDate,
      });
      return;
    }

    let streak = 0;
    const clipDates = new Set(userClips.map(c => c.clipDate));
    let checkDate = new Date(lastClipDate + 'T00:00:00');
    while (clipDates.has(getLocalDateString(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    await this.saveSettings({
      ...settings,
      streakCount: streak,
      longestStreak: Math.max(settings.longestStreak || 0, streak),
      totalClips: userClips.length,
      lastClipDate,
    });
  },

  async getSettings(): Promise<VideoMomentSettings> {
    const data = await readRaw<VideoMomentSettings>(STORES.DATA, CACHE_KEYS.VIDEO_SETTINGS);
    return data || {
      odCoupleId: getCoupleId(),
      userId: getDeviceId(),
      reminderEnabled: true,
      reminderTime: '20:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      streakCount: 0,
      longestStreak: 0,
      totalClips: 0,
    };
  },

  async saveSettings(settings: VideoMomentSettings): Promise<void> {
    await writeRaw(STORES.DATA, CACHE_KEYS.VIDEO_SETTINGS, settings);
    emitUpdate();
  },
};
