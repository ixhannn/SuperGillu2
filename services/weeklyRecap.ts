/**
 * Weekly Recap service — editorial document, assembled on-device every Sunday.
 *
 * The recap is *data* (`WeeklyRecap.sections: RecapSection[]`), not JSX.
 * That makes it serializable (archivable), exportable (PNG), and replayable.
 *
 * Privacy model:
 *  - ALL aggregation is local (no message content ever leaves the device).
 *  - AI insight receives ONLY anonymised aggregate stats.
 */

import {
  WeeklyRecap,
  WeeklyRecapStats,
  WeeklyRecapInsight,
  RecapSection,
  RecapPalette,
  RecapMoodBucket,
  RecapStat,
  RecapHighlight,
  RecapMemoryRef,
  MoodPoint,
  StreakDay,
  MoodEntry,
  Memory,
  Note,
  SpecialDate,
  VoiceNote,
  Keepsake,
  DailyVideoClip,
  VideoMomentDay,
} from '../types';
import { StorageService } from './storage';
import { VideoMomentsService } from './videoMoments';
import { generateId } from '../utils/ids';

// ── Storage keys ─────────────────────────────────────────────────────
const DB_NAME = 'LiorVault_v11';
const DB_VERSION = 1;
const STORE = 'metadata_store';
const ARCHIVE_KEY = 'lior_weekly_recap_archive';
const INSIGHT_CACHE_KEY = 'lior_weekly_recap_insight_cache';

const RECAP_SCHEMA_VERSION = 1;

// ── IDB helpers ───────────────────────────────────────────────────────
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const readRaw = async <T>(key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => { db.close(); resolve((r.result as T) ?? null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
};

const writeRaw = async (key: string, val: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

// ── Week math ─────────────────────────────────────────────────────────
const localIso = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fromIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const addDays = (iso: string, days: number): string => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return localIso(d);
};

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // nearest Sunday
  return localIso(d);
}

export function getWeekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

// ── Mood mapping ──────────────────────────────────────────────────────
const MOOD_TO_SCORE: Record<string, number> = {
  // 5 — high-warm
  loved: 5, romantic: 5, grateful: 5, joyful: 5,
  // 4 — bright
  happy: 4, excited: 4, playful: 4, peaceful: 4,
  // 3 — neutral/tender
  calm: 3, content: 3, thoughtful: 3, reflective: 3, tender: 3,
  // 2 — low
  tired: 2, quiet: 2, meh: 2, stressed: 2,
  // 1 — hard
  sad: 1, anxious: 1, frustrated: 1, lonely: 1, angry: 1,
};

const MOOD_TO_BUCKET: Record<string, RecapMoodBucket> = {
  loved: 'tender', romantic: 'tender', grateful: 'tender',
  happy: 'warm', joyful: 'warm', excited: 'playful', playful: 'playful',
  peaceful: 'quiet', calm: 'quiet', content: 'quiet',
  thoughtful: 'contemplative', reflective: 'contemplative', tender: 'tender',
  tired: 'quiet', quiet: 'quiet', meh: 'quiet',
  stressed: 'intense', anxious: 'intense', frustrated: 'intense', angry: 'intense',
  sad: 'contemplative', lonely: 'contemplative',
};

export const moodToScore = (mood: string): number | null => {
  const key = (mood || '').toLowerCase();
  const score = MOOD_TO_SCORE[key];
  return score ?? null;
};

// ── Palette catalogue ─────────────────────────────────────────────────
/**
 * Designer-authored palettes (not HSL interpolation). Each palette has its
 * own quiet personality — they shouldn't feel like sliders.
 */
export const RECAP_PALETTES: Record<RecapMoodBucket, RecapPalette> = {
  warm: {
    id: 'warm',
    base: '#FDF3E7',
    accent: '#D97757',
    vignette: 'radial-gradient(120% 80% at 50% 0%, rgba(217,119,87,0.18), transparent 70%)',
    textOnBase: '#2B1A12',
    muted: '#7A5840',
  },
  quiet: {
    id: 'quiet',
    base: '#EEF1F4',
    accent: '#516A83',
    vignette: 'radial-gradient(120% 80% at 50% 0%, rgba(81,106,131,0.14), transparent 70%)',
    textOnBase: '#1B222B',
    muted: '#5F6B7A',
  },
  playful: {
    id: 'playful',
    base: '#FFF2E8',
    accent: '#E24B8A',
    vignette: 'radial-gradient(120% 80% at 30% 0%, rgba(226,75,138,0.18), transparent 65%)',
    textOnBase: '#2A0E1E',
    muted: '#7A4058',
  },
  contemplative: {
    id: 'contemplative',
    base: '#E9E7EF',
    accent: '#5A4D8C',
    vignette: 'radial-gradient(120% 80% at 50% 0%, rgba(90,77,140,0.16), transparent 70%)',
    textOnBase: '#19162A',
    muted: '#4E4864',
  },
  intense: {
    id: 'intense',
    base: '#1E1A22',
    accent: '#E84D3C',
    vignette: 'radial-gradient(120% 80% at 50% 0%, rgba(232,77,60,0.22), transparent 65%)',
    textOnBase: '#F7ECEA',
    muted: '#B7A9A6',
  },
  tender: {
    id: 'tender',
    base: '#FBEFEF',
    accent: '#C06079',
    vignette: 'radial-gradient(120% 80% at 50% 0%, rgba(192,96,121,0.16), transparent 70%)',
    textOnBase: '#2E1820',
    muted: '#7A5461',
  },
};

export function pickPalette(moods: MoodEntry[], fallback: RecapMoodBucket = 'quiet'): RecapPalette {
  if (moods.length === 0) return RECAP_PALETTES[fallback];
  const counts: Record<string, number> = {};
  for (const m of moods) {
    const bucket = MOOD_TO_BUCKET[(m.mood || '').toLowerCase()] ?? 'quiet';
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  let winner: RecapMoodBucket = fallback;
  let best = -1;
  (Object.keys(counts) as RecapMoodBucket[]).forEach((k) => {
    if (counts[k] > best) {
      best = counts[k];
      winner = k;
    }
  });
  return RECAP_PALETTES[winner];
}

// ── Aggregation ───────────────────────────────────────────────────────
interface AggregatedData {
  weekStart: string;
  weekEnd: string;
  moods: MoodEntry[];
  memories: Memory[];
  notes: Note[];
  specialDates: SpecialDate[];
  voiceNotes: VoiceNote[];
  keepsakes: Keepsake[];
  clips: DailyVideoClip[];
  videoDays: VideoMomentDay[];
}

async function collectWeekData(weekStart: string): Promise<AggregatedData> {
  const weekEnd = getWeekEnd(weekStart);
  const startMs = fromIso(weekStart).getTime();
  const endMs = fromIso(weekEnd).setHours(23, 59, 59, 999);

  const inRange = (iso?: string): boolean => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t <= endMs;
  };

  const moods = (StorageService.getMoodEntries?.() ?? []).filter((m) => inRange(m.timestamp));
  const memories = (StorageService.getMemories?.() ?? []).filter((m) => inRange(m.date));
  const notes = (StorageService.getNotes?.() ?? []).filter((n) => inRange(n.createdAt));
  const specialDates = (StorageService.getSpecialDates?.() ?? []).filter((s) => {
    // Check anniversaries — month+day falls within the week
    const d = new Date(s.date);
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return weekDates.some((wd) => {
      const w = fromIso(wd);
      return d.getMonth() === w.getMonth() && d.getDate() === w.getDate();
    });
  });
  const voiceNotes = (StorageService.getVoiceNotes?.() ?? []).filter((v) => inRange(v.createdAt));
  const keepsakes = (StorageService.getKeepsakes?.() ?? []).filter(
    (k: any) => inRange(k.openedAt) || inRange(k.createdAt),
  );

  const videoDays = await VideoMomentsService.getClipsForWeek(weekStart);
  const clips: DailyVideoClip[] = [];
  for (const d of videoDays) {
    if (d.userClip) clips.push(d.userClip);
    if (d.partnerClip) clips.push(d.partnerClip);
  }

  return { weekStart, weekEnd, moods, memories, notes, specialDates, voiceNotes, keepsakes, clips, videoDays };
}

function computeStats(data: AggregatedData): WeeklyRecapStats {
  const { moods, memories, notes, specialDates, voiceNotes, keepsakes, videoDays } = data;
  const scores = moods.map((m) => moodToScore(m.mood)).filter((x): x is number => x !== null);
  const avgMoodScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));
  const firstAvg = firstHalf.length ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : avgMoodScore;
  const secondAvg = secondHalf.length ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : avgMoodScore;
  const trend: WeeklyRecapStats['moodTrend'] =
    secondAvg - firstAvg > 0.4 ? 'up' : secondAvg - firstAvg < -0.4 ? 'down' : 'stable';

  const bothRecordedDays = videoDays.filter((d) => d.bothRecorded).length;
  const dailyClipsCount = videoDays.reduce(
    (sum, d) => sum + (d.userClip ? 1 : 0) + (d.partnerClip ? 1 : 0),
    0,
  );

  const keepsakesOpened = keepsakes.filter((k: any) => !!k.openedAt).length;

  return {
    memoriesCount: memories.length,
    notesCount: notes.length,
    moodsLogged: moods.length,
    avgMoodScore: Math.round(avgMoodScore * 10) / 10,
    moodTrend: trend,
    specialDatesCount: specialDates.length,
    dailyClipsCount,
    heartbeatsSent: 0, // Wired by the caller (future: read from presence service)
    heartbeatsReceived: 0,
    voiceNotesCount: voiceNotes.length,
    keepsakesOpened,
    petCareDays: 0,
    bothRecordedDays,
    highlightMoments: [],
  };
}

// ── Mood journey (both partners plotted) ──────────────────────────────
function buildMoodPoints(data: AggregatedData, meUserId: string): MoodPoint[] {
  const points: MoodPoint[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dayIso = addDays(data.weekStart, i);
    const dayLabel = fromIso(dayIso).toLocaleDateString(undefined, { weekday: 'short' });
    const dayStart = fromIso(dayIso).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;

    const sameDay = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= dayStart && t <= dayEnd;
    };

    const myScores = data.moods
      .filter((m) => m.userId === meUserId && sameDay(m.timestamp))
      .map((m) => moodToScore(m.mood))
      .filter((x): x is number => x !== null);
    const partnerScores = data.moods
      .filter((m) => m.userId !== meUserId && sameDay(m.timestamp))
      .map((m) => moodToScore(m.mood))
      .filter((x): x is number => x !== null);

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    points.push({
      day: dayIso,
      dayLabel,
      me: avg(myScores),
      partner: avg(partnerScores),
    });
  }
  return points;
}

function describeMoodInsight(points: MoodPoint[], trend: WeeklyRecapStats['moodTrend']): string {
  const haveMyPoints = points.filter((p) => p.me !== null).length;
  const havePartnerPoints = points.filter((p) => p.partner !== null).length;
  if (haveMyPoints === 0 && havePartnerPoints === 0) {
    return 'No moods were logged this week.';
  }
  if (trend === 'up') return 'The week ended warmer than it began.';
  if (trend === 'down') return 'The week softened toward the end.';
  return 'A steady rhythm — no sharp turns.';
}

// ── Highlight moment pick ─────────────────────────────────────────────
function pickHighlight(data: AggregatedData, palette: RecapPalette): RecapHighlight | null {
  // Strategy: prefer a memory on the highest-mood day; fall back to first
  // memory; fall back to special date.
  const { memories, moods, specialDates } = data;

  if (specialDates.length > 0) {
    const s = specialDates[0];
    return {
      title: s.title,
      body: 'A date that mattered.',
      accentColor: palette.accent,
      date: s.date,
    };
  }
  if (memories.length === 0) return null;

  const byDay = new Map<string, number>();
  moods.forEach((m) => {
    const day = m.timestamp.slice(0, 10);
    const score = moodToScore(m.mood) ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, score));
  });

  let bestMem: Memory = memories[0];
  let bestScore = -1;
  memories.forEach((m) => {
    const day = m.date.slice(0, 10);
    const s = byDay.get(day) ?? 0;
    if (s > bestScore) { bestScore = s; bestMem = m; }
  });

  return {
    title: bestMem.text.split('.')[0].slice(0, 80) || 'A quiet moment',
    body: bestMem.text.slice(0, 240),
    accentColor: palette.accent,
    date: bestMem.date,
  };
}

// ── Streak chain ──────────────────────────────────────────────────────
function buildStreakDays(data: AggregatedData): StreakDay[] {
  const days: StreakDay[] = [];
  const clipsByDay = new Map<string, boolean>();
  data.clips.forEach((c) => clipsByDay.set(c.clipDate, true));

  for (let i = 0; i < 7; i += 1) {
    const iso = addDays(data.weekStart, i);
    const hasMood = data.moods.some((m) => m.timestamp.slice(0, 10) === iso);
    const hasMemory = data.memories.some((m) => m.date.slice(0, 10) === iso);
    const hasClip = clipsByDay.has(iso);
    days.push({ date: iso, filled: hasMood || hasMemory || hasClip });
  }
  return days;
}

function computeStreaks(days: StreakDay[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  let running = 0;
  days.forEach((d) => {
    if (d.filled) { running += 1; best = Math.max(best, running); }
    else { running = 0; }
  });
  // current = trailing run
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].filled) current += 1;
    else break;
  }
  return { current, best };
}

// ── Stats → typography moments ────────────────────────────────────────
function buildRecapStats(stats: WeeklyRecapStats, palette: RecapPalette): RecapStat[] {
  const items: RecapStat[] = [];
  if (stats.memoriesCount > 0) items.push({ label: 'memories', value: stats.memoriesCount, accent: palette.accent });
  if (stats.dailyClipsCount > 0) items.push({ label: 'clips', value: stats.dailyClipsCount, accent: palette.accent });
  if (stats.notesCount > 0) items.push({ label: 'notes', value: stats.notesCount, accent: palette.accent });
  if (stats.voiceNotesCount > 0) items.push({ label: 'voice notes', value: stats.voiceNotesCount, accent: palette.accent });
  if (stats.bothRecordedDays > 0) items.push({ label: 'shared days', value: stats.bothRecordedDays, accent: palette.accent });
  if (stats.keepsakesOpened > 0) items.push({ label: 'keepsakes', value: stats.keepsakesOpened, accent: palette.accent });
  if (items.length === 0) {
    items.push({ label: 'a quiet week', value: 0, accent: palette.accent });
  }
  return items;
}

// ── Headline Moment — best memory as hero card ────────────────────────
function buildHeadlineMemory(data: AggregatedData, moods: MoodEntry[]): RecapMemoryRef | null {
  const { memories } = data;
  if (memories.length === 0) return null;

  const byDay = new Map<string, number>();
  moods.forEach((m) => {
    const day = m.timestamp.slice(0, 10);
    const score = moodToScore(m.mood) ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, score));
  });

  let bestMem: Memory = memories[0];
  let bestScore = -1;
  memories.forEach((m) => {
    const day = m.date.slice(0, 10);
    const s = byDay.get(day) ?? 0;
    // Prefer memories with images
    const bonus = (m.image || m.storagePath) ? 1 : 0;
    if (s + bonus > bestScore) { bestScore = s + bonus; bestMem = m; }
  });

  const d = fromIso(bestMem.date.slice(0, 10));
  return {
    id: bestMem.id,
    text: bestMem.text,
    date: bestMem.date,
    mood: bestMem.mood,
    dayLabel: d.toLocaleDateString(undefined, { weekday: 'long' }),
    hasImage: !!(bestMem.image || bestMem.storagePath),
    hasAudio: !!(bestMem.audioId || bestMem.audioStoragePath),
  };
}

// ── Best Of Carousel — top memories ranked by mood score ──────────────
function buildCarouselMemories(data: AggregatedData, moods: MoodEntry[]): RecapMemoryRef[] {
  const { memories } = data;
  if (memories.length <= 1) return [];

  const byDay = new Map<string, number>();
  moods.forEach((m) => {
    const day = m.timestamp.slice(0, 10);
    const score = moodToScore(m.mood) ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, score));
  });

  const scored = memories.map((m) => ({
    memory: m,
    score: (byDay.get(m.date.slice(0, 10)) ?? 3) + ((m.image || m.storagePath) ? 0.5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map(({ memory }) => {
    const d = fromIso(memory.date.slice(0, 10));
    return {
      id: memory.id,
      text: memory.text,
      date: memory.date,
      mood: memory.mood,
      dayLabel: d.toLocaleDateString(undefined, { weekday: 'short' }),
      hasImage: !!(memory.image || memory.storagePath),
      hasAudio: !!(memory.audioId || memory.audioStoragePath),
    };
  });
}

// ── Our Prompt — data-driven conversation starter ─────────────────────
function buildPrompt(data: AggregatedData, moods: MoodEntry[]): { text: string; promptType: 'shared_mood' | 'gap' | 'milestone' | 'general' } {
  // Check for shared high-mood day
  const dayMoods = new Map<string, string[]>();
  moods.forEach((m) => {
    const day = m.timestamp.slice(0, 10);
    const existing = dayMoods.get(day) ?? [];
    existing.push(m.mood.toLowerCase());
    dayMoods.set(day, existing);
  });

  // Find days where both logged similar high moods
  for (const [day, moodList] of dayMoods.entries()) {
    const highMoods = moodList.filter((m) => (moodToScore(m) ?? 0) >= 4);
    if (highMoods.length >= 2) {
      const d = fromIso(day);
      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
      return {
        text: `You both felt great on ${dayName} — what made it so good?`,
        promptType: 'shared_mood',
      };
    }
  }

  // Check for quiet days (no activity)
  const activeDays = new Set<string>();
  data.memories.forEach((m) => activeDays.add(m.date.slice(0, 10)));
  data.notes.forEach((n) => activeDays.add(n.createdAt.slice(0, 10)));
  moods.forEach((m) => activeDays.add(m.timestamp.slice(0, 10)));

  const quietDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayIso = addDays(data.weekStart, i);
    if (!activeDays.has(dayIso)) quietDays.push(dayIso);
  }

  if (quietDays.length >= 3) {
    return {
      text: `${quietDays.length} quiet days this week — sometimes silence says a lot. What were you thinking about?`,
      promptType: 'gap',
    };
  }

  // Special date prompt
  if (data.specialDates.length > 0) {
    return {
      text: `${data.specialDates[0].title} happened this week. How did it feel?`,
      promptType: 'milestone',
    };
  }

  // General fallback
  const prompts = [
    'What was one thing you almost said this week but didn\'t?',
    'If this week had a soundtrack, what song would it be?',
    'What\'s something small your partner did that you noticed?',
    'Describe this week in three words — no explaining.',
  ];
  return {
    text: prompts[Math.floor(Math.random() * prompts.length)],
    promptType: 'general',
  };
}

// ── Insight (AI) — aggregate-only, never message content ──────────────
export interface InsightInput {
  weekStart: string;
  stats: WeeklyRecapStats;
  moodTrend: WeeklyRecapStats['moodTrend'];
  paletteBucket: RecapMoodBucket;
  coupleNames: [string, string];
}

async function generateInsight(input: InsightInput): Promise<WeeklyRecapInsight> {
  // Offline / no-key fallback: produce a warm, deterministic tagline.
  const fallback: WeeklyRecapInsight = {
    coupleId: 'local',
    weekStart: input.weekStart,
    tagline: fallbackTagline(input),
    paragraph: fallbackParagraph(input),
    nextWeekPrompt: fallbackPrompt(input),
    schemaVersion: RECAP_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  };

  // Cache check
  const cached = await readRaw<Record<string, WeeklyRecapInsight>>(INSIGHT_CACHE_KEY);
  if (cached && cached[input.weekStart]) return cached[input.weekStart];

  // NOTE: Live Gemini call is wired in a follow-up. The fallback is a
  // first-class product — users who disable AI still get a beautiful recap.
  const store = cached ?? {};
  store[input.weekStart] = fallback;
  await writeRaw(INSIGHT_CACHE_KEY, store);
  return fallback;
}

function fallbackTagline(input: InsightInput): string {
  const { stats, paletteBucket } = input;
  if (stats.moodsLogged === 0 && stats.memoriesCount === 0) return 'A quiet chapter.';
  if (paletteBucket === 'tender') return 'The week leaned in.';
  if (paletteBucket === 'playful') return 'Lighter than you remember.';
  if (paletteBucket === 'intense') return 'Steadier than it felt.';
  if (paletteBucket === 'contemplative') return 'Slow, on purpose.';
  if (paletteBucket === 'warm') return 'Held in golden light.';
  return 'An ordinary, ordinary week.';
}

function fallbackParagraph(input: InsightInput): string {
  const { stats } = input;
  const parts: string[] = [];
  if (stats.bothRecordedDays >= 3) parts.push('You showed up for each other almost every day.');
  else if (stats.bothRecordedDays > 0) parts.push('You met in a few small, steady moments.');
  if (stats.moodTrend === 'up') parts.push('The week softened upward.');
  if (stats.moodTrend === 'down') parts.push('It asked for a little more gentleness by the end.');
  if (stats.memoriesCount > 0) parts.push(`You kept ${stats.memoriesCount} ${stats.memoriesCount === 1 ? 'memory' : 'memories'} close.`);
  if (parts.length === 0) parts.push('It was a quiet week — sometimes that is the whole point.');
  return parts.join(' ');
}

function fallbackPrompt(_input: InsightInput): string {
  return 'Next week, send one small thing you’d usually keep to yourself.';
}

// ── Assemble sections (Weekly Story 6-beat) ───────────────────────────
function assembleSections(params: {
  data: AggregatedData;
  palette: RecapPalette;
  stats: WeeklyRecapStats;
  moodPoints: MoodPoint[];
  insight: WeeklyRecapInsight;
  highlight: RecapHighlight | null;
  streakDays: StreakDay[];
  streaks: { current: number; best: number };
  coupleNames: [string, string];
}): RecapSection[] {
  const { data, palette, stats, moodPoints, insight, highlight, coupleNames } = params;

  const dateRange = formatDateRange(data.weekStart, data.weekEnd);
  const sections: RecapSection[] = [];

  // Beat 1: Cover
  sections.push({
    kind: 'cover',
    palette,
    headline: insight.tagline,
    dateRange,
    names: coupleNames,
  });

  // Beat 2: Headline Moment (best memory as hero)
  const headlineMemory = buildHeadlineMemory(data, data.moods);
  if (headlineMemory) {
    sections.push({ kind: 'headline', memory: headlineMemory, palette });
  } else if (highlight) {
    // Fallback to text-based highlight if no memories
    sections.push({ kind: 'highlight', highlight });
  }

  // Beat 3: Best Of Carousel
  const carouselMemories = buildCarouselMemories(data, data.moods);
  if (carouselMemories.length >= 2) {
    sections.push({ kind: 'carousel', memories: carouselMemories, palette });
  }

  // Beat 4: Stats Grid (redesigned)
  sections.push({
    kind: 'numbers',
    stats: buildRecapStats(stats, palette),
  });

  // Beat 5: Mood Arc + Narrative
  sections.push({
    kind: 'moodJourney',
    points: moodPoints,
    insight: describeMoodInsight(moodPoints, stats.moodTrend),
    palette,
  });

  // Beat 6: Our Prompt (conversation starter)
  const prompt = buildPrompt(data, data.moods);
  sections.push({
    kind: 'prompt',
    text: prompt.text,
    promptType: prompt.promptType,
  });

  return sections;
}

function formatDateRange(start: string, end: string): string {
  const s = fromIso(start);
  const e = fromIso(end);
  const sLbl = s.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const eLbl = e.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return `${sLbl} – ${eLbl}`;
}

// ── Public API ────────────────────────────────────────────────────────
export interface BuildRecapOptions {
  weekStart?: string; // defaults to this week's Sunday
  coupleNames?: [string, string];
  meUserId?: string;
  coupleId?: string;
  force?: boolean; // ignore cache
}

export const WeeklyRecapService = {
  getWeekStart,
  getWeekEnd,

  async build(options: BuildRecapOptions = {}): Promise<WeeklyRecap> {
    const weekStart = options.weekStart ?? getWeekStart();
    const weekEnd = getWeekEnd(weekStart);
    const coupleId = options.coupleId ?? 'local';
    const coupleNames: [string, string] = options.coupleNames ?? ['You', 'Them'];
    const meUserId = options.meUserId ?? StorageService.getDeviceId?.() ?? 'me';

    if (!options.force) {
      const existing = await this.getArchived(weekStart);
      if (existing) return existing;
    }

    const data = await collectWeekData(weekStart);
    const palette = pickPalette(data.moods);
    const stats = computeStats(data);
    const moodPoints = buildMoodPoints(data, meUserId);
    const streakDays = buildStreakDays(data);
    const streaks = computeStreaks(streakDays);
    const highlight = pickHighlight(data, palette);

    const insight = await generateInsight({
      weekStart,
      stats,
      moodTrend: stats.moodTrend,
      paletteBucket: palette.id,
      coupleNames,
    });

    const sections = assembleSections({
      data, palette, stats, moodPoints, insight, highlight, streakDays, streaks, coupleNames,
    });

    const recap: WeeklyRecap = {
      id: generateId(),
      coupleId,
      weekStart,
      weekEnd,
      palette,
      tagline: insight.tagline,
      sections,
      generatedAt: new Date().toISOString(),
      stats,
      schemaVersion: RECAP_SCHEMA_VERSION,
    };

    await this.archive(recap);
    return recap;
  },

  async archive(recap: WeeklyRecap): Promise<void> {
    const list = (await readRaw<WeeklyRecap[]>(ARCHIVE_KEY)) ?? [];
    const idx = list.findIndex((r) => r.weekStart === recap.weekStart);
    if (idx >= 0) list[idx] = recap;
    else list.push(recap);
    // Keep newest first, cap to 52
    list.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    await writeRaw(ARCHIVE_KEY, list.slice(0, 52));
  },

  async getArchived(weekStart: string): Promise<WeeklyRecap | null> {
    const list = (await readRaw<WeeklyRecap[]>(ARCHIVE_KEY)) ?? [];
    return list.find((r) => r.weekStart === weekStart) ?? null;
  },

  async listArchived(): Promise<WeeklyRecap[]> {
    const list = (await readRaw<WeeklyRecap[]>(ARCHIVE_KEY)) ?? [];
    return [...list].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  },

  async deleteArchived(weekStart: string): Promise<void> {
    const list = (await readRaw<WeeklyRecap[]>(ARCHIVE_KEY)) ?? [];
    await writeRaw(ARCHIVE_KEY, list.filter((r) => r.weekStart !== weekStart));
  },
};
