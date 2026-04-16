import {
  DailyVideoClip,
  VideoMomentDay,
  MonthlyVideoCompilation,
  VideoMomentSettings
} from '../types';
import { generateId } from '../utils/ids';
import { SupabaseService } from './supabase';

// ── Constants ─────────────────────────────────────────────────────────
const DB_NAME = 'LiorVault_v11';
const DB_VERSION = 1;
const STORES = {
  DATA: 'metadata_store',
  IMAGES: 'image_vault' // Also used for video blobs
};

const CACHE_KEYS = {
  VIDEO_CLIPS: 'lior_daily_video_clips',
  VIDEO_SETTINGS: 'lior_video_moment_settings',
  MONTHLY_COMPILATIONS: 'lior_monthly_compilations'
};

// ── Event Target for reactivity ───────────────────────────────────────
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
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
};

// ── Local date helpers ────────────────────────────────────────────────
const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// ── Data cache ────────────────────────────────────────────────────────
let clipCache: DailyVideoClip[] | null = null;
let compilationCache: MonthlyVideoCompilation[] | null = null;

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

const loadCompilations = async (): Promise<MonthlyVideoCompilation[]> => {
  if (compilationCache) return compilationCache;
  const data = await readRaw<MonthlyVideoCompilation[]>(STORES.DATA, CACHE_KEYS.MONTHLY_COMPILATIONS);
  compilationCache = data ?? [];
  return compilationCache;
};

const saveCompilations = async (compilations: MonthlyVideoCompilation[]): Promise<void> => {
  compilationCache = compilations;
  await writeRaw(STORES.DATA, CACHE_KEYS.MONTHLY_COMPILATIONS, compilations);
  emitUpdate();
};

// ── Helpers ───────────────────────────────────────────────────────────
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

// ── Video Moments Service ─────────────────────────────────────────────
export const VideoMomentsService = {
  /**
   * Record a new daily video clip
   */
  async recordClip(
    videoBlob: Blob,
    durationMs: number,
    thumbnail: string
  ): Promise<DailyVideoClip> {
    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();
    const coupleId = getCoupleId();

    // Check if user already recorded today
    const existingIdx = clips.findIndex(
      c => c.clipDate === today && c.odUserId === userId
    );

    const id = existingIdx >= 0 ? clips[existingIdx].id : generateId();
    const videoId = `video_clip_${id}`;
    const thumbnailId = `thumb_clip_${id}`;

    // Convert blob to base64 for storage
    const videoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(videoBlob);
    });

    // Save video and thumbnail to IndexedDB
    await writeRaw(STORES.IMAGES, videoId, videoBase64);
    await writeRaw(STORES.IMAGES, thumbnailId, thumbnail);

    const clip: DailyVideoClip = {
      id,
      odCoupleId: coupleId,
      odUserId: userId,
      clipDate: today,
      videoId,
      thumbnailId,
      durationMs,
      recordedAt: new Date().toISOString(),
      watchedByPartner: false
    };

    // Try to upload to cloud (not implemented yet, future enhancement)
    // Cloud sync for video storage would require adding uploadMedia/getMediaUrl to SupabaseService

    // Update or add clip
    if (existingIdx >= 0) {
      clips[existingIdx] = clip;
    } else {
      clips.push(clip);
    }

    await saveClips(clips);
    await this.updateStreak();

    return clip;
  },

  /**
   * Check if user has recorded today
   */
  async hasRecordedToday(): Promise<boolean> {
    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();
    return clips.some(c => c.clipDate === today && c.odUserId === userId);
  },

  /**
   * Get today's clips for both partners
   */
  async getTodayClips(): Promise<VideoMomentDay> {
    const clips = await loadClips();
    const today = getLocalDateString();
    const userId = getDeviceId();

    const todayClips = clips.filter(c => c.clipDate === today);
    const userClip = todayClips.find(c => c.odUserId === userId);
    const partnerClip = todayClips.find(c => c.odUserId !== userId);

    return {
      date: today,
      userClip,
      partnerClip,
      bothRecorded: !!(userClip && partnerClip)
    };
  },

  /**
   * Get clips for a specific month
   */
  async getClipsForMonth(year: number, month: number): Promise<Map<string, VideoMomentDay>> {
    const clips = await loadClips();
    const userId = getDeviceId();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const result = new Map<string, VideoMomentDay>();
    const monthClips = clips.filter(c => c.clipDate.startsWith(monthStr));

    // Group by date
    const byDate = new Map<string, DailyVideoClip[]>();
    for (const clip of monthClips) {
      const existing = byDate.get(clip.clipDate) || [];
      existing.push(clip);
      byDate.set(clip.clipDate, existing);
    }

    for (const [date, dayClips] of byDate) {
      const userClip = dayClips.find(c => c.odUserId === userId);
      const partnerClip = dayClips.find(c => c.odUserId !== userId);
      result.set(date, {
        date,
        userClip,
        partnerClip,
        bothRecorded: !!(userClip && partnerClip)
      });
    }

    return result;
  },

  /**
   * Get video URL for playback
   */
  async getVideoUrl(clip: DailyVideoClip): Promise<string | null> {
    // Try local first
    if (clip.videoId) {
      const local = await readRaw<string>(STORES.IMAGES, clip.videoId);
      if (local) return local;
    }

    // Try cloud (not implemented yet)
    // Future: if (clip.videoStoragePath && SupabaseService.isConfigured()) {...}

    return null;
  },

  /**
   * Get thumbnail URL
   */
  async getThumbnailUrl(clip: DailyVideoClip): Promise<string | null> {
    if (clip.thumbnailId) {
      const local = await readRaw<string>(STORES.IMAGES, clip.thumbnailId);
      if (local) return local;
    }

    if (clip.thumbnailStoragePath && SupabaseService.isConfigured()) {
      // Future: cloud thumbnail retrieval
    }

    return null;
  },

  /**
   * Mark clip as watched by partner
   */
  async markWatched(clipId: string): Promise<void> {
    const clips = await loadClips();
    const idx = clips.findIndex(c => c.id === clipId);
    if (idx >= 0) {
      clips[idx] = {
        ...clips[idx],
        watchedByPartner: true,
        watchedAt: new Date().toISOString()
      };
      await saveClips(clips);
    }
  },

  /**
   * Get all clips for monthly compilation
   */
  async getClipsForCompilation(month: string): Promise<DailyVideoClip[]> {
    const clips = await loadClips();
    return clips
      .filter(c => c.clipDate.startsWith(month))
      .sort((a, b) => a.clipDate.localeCompare(b.clipDate) || a.recordedAt.localeCompare(b.recordedAt));
  },

  /**
   * Save a generated monthly compilation
   */
  async saveCompilation(
    month: string,
    videoBlob: Blob,
    thumbnail: string,
    durationMs: number,
    clipCount: number
  ): Promise<MonthlyVideoCompilation> {
    const compilations = await loadCompilations();
    const coupleId = getCoupleId();
    const id = generateId();
    const videoId = `compilation_${month}_${id}`;
    const thumbnailId = `compilation_thumb_${month}_${id}`;

    // Convert and save
    const videoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(videoBlob);
    });

    await writeRaw(STORES.IMAGES, videoId, videoBase64);
    await writeRaw(STORES.IMAGES, thumbnailId, thumbnail);

    const compilation: MonthlyVideoCompilation = {
      id,
      coupleId,
      month,
      videoId,
      thumbnailId,
      durationMs,
      clipCount,
      generatedAt: new Date().toISOString(),
      status: 'ready'
    };

    // Remove any existing compilation for this month
    const filtered = compilations.filter(c => c.month !== month);
    filtered.push(compilation);
    await saveCompilations(filtered);

    return compilation;
  },

  /**
   * Get compilation for a month
   */
  async getCompilation(month: string): Promise<MonthlyVideoCompilation | null> {
    const compilations = await loadCompilations();
    return compilations.find(c => c.month === month) || null;
  },

  /**
   * Get all compilations
   */
  async getAllCompilations(): Promise<MonthlyVideoCompilation[]> {
    return loadCompilations();
  },

  /**
   * Get compilation video URL
   */
  async getCompilationVideoUrl(compilation: MonthlyVideoCompilation): Promise<string | null> {
    if (compilation.videoId) {
      const local = await readRaw<string>(STORES.IMAGES, compilation.videoId);
      if (local) return local;
    }
    return null;
  },

  /**
   * Get compilation thumbnail URL
   */
  async getCompilationThumbnailUrl(compilation: MonthlyVideoCompilation): Promise<string | null> {
    if (compilation.thumbnailId) {
      const local = await readRaw<string>(STORES.IMAGES, compilation.thumbnailId);
      if (local) return local;
    }
    return null;
  },

  /**
   * Update streak information
   */
  async updateStreak(): Promise<void> {
    const settings = await this.getSettings();
    const clips = await loadClips();
    const userId = getDeviceId();

    // Get user's clips sorted by date
    const userClips = clips
      .filter(c => c.odUserId === userId)
      .sort((a, b) => b.clipDate.localeCompare(a.clipDate));

    if (userClips.length === 0) {
      await this.saveSettings({ ...settings, streakCount: 0, totalClips: 0 });
      return;
    }

    // Calculate streak
    let streak = 0;
    const today = getLocalDateString();
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));

    // Streak only counts if recorded today or yesterday
    const lastClipDate = userClips[0].clipDate;
    if (lastClipDate !== today && lastClipDate !== yesterday) {
      await this.saveSettings({
        ...settings,
        streakCount: 0,
        totalClips: userClips.length,
        lastClipDate
      });
      return;
    }

    // Count consecutive days
    let checkDate = new Date(lastClipDate);
    const clipDates = new Set(userClips.map(c => c.clipDate));

    while (clipDates.has(getLocalDateString(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    await this.saveSettings({
      ...settings,
      streakCount: streak,
      longestStreak: Math.max(settings.longestStreak || 0, streak),
      totalClips: userClips.length,
      lastClipDate
    });
  },

  /**
   * Get current streak
   */
  async getCurrentStreak(): Promise<number> {
    const settings = await this.getSettings();
    return settings.streakCount || 0;
  },

  /**
   * Get settings
   */
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
      totalClips: 0
    };
  },

  /**
   * Save settings
   */
  async saveSettings(settings: VideoMomentSettings): Promise<void> {
    await writeRaw(STORES.DATA, CACHE_KEYS.VIDEO_SETTINGS, settings);
    emitUpdate();
  },

  /**
   * Check if partner's clip is unlocked (user must record first)
   */
  async isPartnerClipUnlocked(): Promise<boolean> {
    const today = await this.getTodayClips();
    return !!today.userClip;
  },

  /**
   * Get months with recordings
   */
  async getMonthsWithRecordings(): Promise<string[]> {
    const clips = await loadClips();
    const months = new Set<string>();
    for (const clip of clips) {
      months.add(clip.clipDate.substring(0, 7));
    }
    return Array.from(months).sort().reverse();
  }
};
