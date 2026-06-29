import type { Memory, QuestionEntry } from '../../../types';
import { StorageService } from '../../../services/storage';
import {
    daysTogetherFrom,
    daysUntilDate,
    formatStoredDate,
    getNextAnnualOccurrence,
} from '../../../shared/dateOnly.js';

/**
 * OUR STORY — chapter builder.
 * Turns the couple's real, locally-stored data into an ordered list of
 * film chapters. Chapters whose data is missing are skipped entirely.
 * Pure + synchronous: call once when the view mounts.
 */

export const CHAPTER_MS = 6000;
export const FREE_CHAPTER_LIMIT = 3;
/** Cap on revealed-ritual scenes spliced into the film (keeps the player fast). */
export const RITUAL_SCENE_CAP = 16;

/* ── Chapter model ──────────────────────────────────────────────────── */

interface ChapterBase {
    id: string;
    /** Short slate title shown in the reel strip and scene eyebrow. */
    slate: string;
}

export interface TitleChapter extends ChapterBase { kind: 'title'; myName: string; partnerName: string; days: number; }
export interface BeganChapter extends ChapterBase { kind: 'began'; dateLabel: string; days: number; }
export interface FirstMemoryChapter extends ChapterBase { kind: 'first-memory'; excerpt: string; dateLabel: string; }
export interface NumbersChapter extends ChapterBase { kind: 'numbers'; stats: Array<{ value: number; label: string }>; }
export interface MoodWeatherChapter extends ChapterBase { kind: 'mood-weather'; tops: Array<{ name: string; emoji: string; count: number }>; report: string; }
export interface StreakChapter extends ChapterBase { kind: 'streak'; best: number; current: number; }
export interface VoicesChapter extends ChapterBase { kind: 'voices'; count: number; minutes: number; seconds: number; }
export interface LineChapter extends ChapterBase { kind: 'line'; excerpt: string; dateLabel: string; }
export interface DatesChapter extends ChapterBase { kind: 'dates'; count: number; nextTitle: string; nextLabel: string; daysUntil: number; }
export interface LatestChapter extends ChapterBase { kind: 'latest'; excerpt: string; dateLabel: string; daysAgo: number; }
export interface DailyRitualChapter extends ChapterBase { kind: 'daily-ritual'; date: string; question: string; myAnswer: string; partnerAnswer: string; revealedAt: string; daysAgo: number; }
export interface TonightChapter extends ChapterBase { kind: 'tonight'; }
export interface OutroChapter extends ChapterBase { kind: 'outro'; myName: string; partnerName: string; }
/** Injected by the player for free accounts — never part of the built reel. */
export interface GateChapter extends ChapterBase { kind: 'gate'; remaining: number; }

export type StoryChapter =
    | TitleChapter
    | BeganChapter
    | FirstMemoryChapter
    | NumbersChapter
    | MoodWeatherChapter
    | StreakChapter
    | VoicesChapter
    | LineChapter
    | DatesChapter
    | LatestChapter
    | DailyRitualChapter
    | TonightChapter
    | OutroChapter;

export type PlayableChapter = StoryChapter | GateChapter;

export interface StoryFilm {
    chapters: StoryChapter[];
    myName: string;
    partnerName: string;
    days: number;
}

/* ── Mood metadata (mirrors the Mood Calendar palette) ──────────────── */

type MoodFamily = 'tender' | 'warm' | 'bright' | 'calm' | 'low';

const MOOD_META: Record<string, { emoji: string; family: MoodFamily }> = {
    loved: { emoji: '🥰', family: 'tender' },
    romantic: { emoji: '💕', family: 'tender' },
    tender: { emoji: '💗', family: 'tender' },
    grateful: { emoji: '🙏', family: 'warm' },
    joyful: { emoji: '✨', family: 'bright' },
    happy: { emoji: '😊', family: 'bright' },
    excited: { emoji: '🤩', family: 'bright' },
    playful: { emoji: '😝', family: 'bright' },
    peaceful: { emoji: '☮️', family: 'calm' },
    calm: { emoji: '😌', family: 'calm' },
    relaxed: { emoji: '😌', family: 'calm' },
    content: { emoji: '😊', family: 'calm' },
    thoughtful: { emoji: '🤔', family: 'calm' },
    reflective: { emoji: '💭', family: 'calm' },
    quiet: { emoji: '🤫', family: 'low' },
    tired: { emoji: '😴', family: 'low' },
    meh: { emoji: '😐', family: 'low' },
    stressed: { emoji: '😤', family: 'warm' },
    sad: { emoji: '🥺', family: 'low' },
    anxious: { emoji: '😰', family: 'low' },
    frustrated: { emoji: '😣', family: 'warm' },
    lonely: { emoji: '💔', family: 'low' },
    angry: { emoji: '😠', family: 'warm' },
};

const WEATHER_REPORTS: Record<MoodFamily | 'mixed', string> = {
    tender: 'Warm fronts all season. The kind of weather you stay out in.',
    warm: 'High pressure, big feelings — golden hours either way.',
    bright: 'Long stretches of sun, with scattered bursts of laughter.',
    calm: 'Clear skies and slow mornings. Visibility: each other.',
    low: 'Some heavy weather moved through. You stood in it together.',
    mixed: 'Changeable, like all real weather — and you kept showing up.',
};

const moodEmoji = (name: string): string => {
    const meta = MOOD_META[name.toLowerCase()];
    if (meta) return meta.emoji;
    // Older entries may store the emoji itself.
    return /[a-z]/i.test(name) ? '✨' : name;
};

/* ── Helpers ────────────────────────────────────────────────────────── */

const excerptOf = (text: string, max = 150): string => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trimEnd()}…`;
};

const isoDateLabel = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

const daysAgoOf = (iso: string): number => {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

const memoriesWithText = (memories: Memory[]): Memory[] =>
    memories
        .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0 && !Number.isNaN(new Date(m.date).getTime()))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

/**
 * Turns revealed daily-question entries into permanent film scenes.
 * Most-recent first, capped at RITUAL_SCENE_CAP. Answers are resolved by the
 * couple's raw display names (the keys used when the answers were stored).
 * Returns [] when nothing has been revealed — no placeholder scene.
 */
const buildRitualChapters = (
    questions: QuestionEntry[] | undefined,
    rawMyName: string | undefined,
    rawPartnerName: string | undefined,
): DailyRitualChapter[] => {
    if (!Array.isArray(questions) || questions.length === 0) return [];
    // Look up answers by the EXACT (untrimmed) display name the answer was
    // stored under (submitQuestionAnswer keys by raw profile.myName; every
    // other reader — dailyRitual.ts, DuetJournal, Premium — uses raw names).
    // Trimming here would miss keys with leading/trailing whitespace and render
    // the ritual scene with blank answers.
    const myKey = rawMyName ?? '';
    const partnerKey = rawPartnerName ?? '';

    return questions
        .filter((q): q is QuestionEntry & { revealedAt: string } =>
            typeof q.revealedAt === 'string' && q.revealedAt.length > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RITUAL_SCENE_CAP)
        .map((q) => ({
            id: `ch-ritual-${q.date}`,
            kind: 'daily-ritual' as const,
            slate: 'A question you answered',
            date: q.date,
            question: q.question,
            myAnswer: q.answers?.[myKey]?.trim() ?? '',
            partnerAnswer: q.answers?.[partnerKey]?.trim() ?? '',
            revealedAt: q.revealedAt,
            daysAgo: daysAgoOf(q.revealedAt),
        }));
};

/* ── Builder ────────────────────────────────────────────────────────── */

export function buildStoryFilm(): StoryFilm {
    const profile = StorageService.getCoupleProfile();
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';
    const days = daysTogetherFrom(profile.anniversaryDate);

    const memories = StorageService.getMemories();
    const moodEntries = StorageService.getMoodEntries();
    const voiceNotes = StorageService.getVoiceNotes();
    const keepsakes = StorageService.getKeepsakes().filter((k) => !k.isHidden);
    const specialDates = StorageService.getSpecialDates();

    const textual = memoriesWithText(memories);
    const first = textual[0];
    const latest = textual.length > 1 ? textual[textual.length - 1] : undefined;

    const chapters: StoryChapter[] = [];

    /* 1 — Opening titles (always). */
    chapters.push({ id: 'ch-title', kind: 'title', slate: 'Opening titles', myName, partnerName, days });

    /* 2 — Where it began (needs a parseable anniversary). */
    const beganLabel = formatStoredDate(profile.anniversaryDate, { month: 'long', day: 'numeric', year: 'numeric' });
    if (beganLabel) {
        chapters.push({ id: 'ch-began', kind: 'began', slate: 'Where it began', dateLabel: beganLabel, days });
    }

    /* 3 — The first entry. */
    if (first) {
        chapters.push({
            id: 'ch-first',
            kind: 'first-memory',
            slate: 'The first entry',
            excerpt: excerptOf(first.text),
            dateLabel: isoDateLabel(first.date),
        });
    }

    /* 4 — By the numbers (kept whenever there is anything to count). */
    const stats = [
        { value: memories.length, label: 'Memories kept' },
        { value: voiceNotes.length, label: 'Voice notes' },
        { value: moodEntries.length, label: 'Moods logged' },
        { value: keepsakes.length, label: 'Keepsakes' },
    ].filter((s) => s.value > 0);
    if (stats.length < 2 && days > 0) {
        stats.unshift({ value: days, label: 'Days together' });
    }
    if (stats.length > 0) {
        chapters.push({ id: 'ch-numbers', kind: 'numbers', slate: 'By the numbers', stats: stats.slice(0, 4) });
    }

    /* 5 — Mood weather. */
    if (moodEntries.length >= 3) {
        const counts = new Map<string, number>();
        const familyCounts: Record<MoodFamily, number> = { tender: 0, warm: 0, bright: 0, calm: 0, low: 0 };
        moodEntries.forEach((entry) => {
            const name = (entry.mood || '').toLowerCase().trim();
            if (!name) return;
            counts.set(name, (counts.get(name) ?? 0) + 1);
            const meta = MOOD_META[name];
            if (meta) familyCounts[meta.family] += 1;
        });
        const tops = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => ({ name, emoji: moodEmoji(name), count }));
        if (tops.length > 0) {
            const familiesRanked = (Object.entries(familyCounts) as Array<[MoodFamily, number]>).sort((a, b) => b[1] - a[1]);
            const known = familiesRanked.reduce((sum, [, n]) => sum + n, 0);
            const dominant = familiesRanked[0];
            const report = known > 0 && dominant[1] / known >= 0.4
                ? WEATHER_REPORTS[dominant[0]]
                : WEATHER_REPORTS.mixed;
            chapters.push({ id: 'ch-weather', kind: 'mood-weather', slate: 'The weather between you', tops, report });
        }
    }

    /* 6 — The longest fire. */
    const streak = profile.streakData;
    if (streak && streak.bestStreak >= 3) {
        chapters.push({ id: 'ch-streak', kind: 'streak', slate: 'The longest fire', best: streak.bestStreak, current: streak.count ?? 0 });
    }

    /* 7 — Voices kept. */
    if (voiceNotes.length > 0) {
        const seconds = Math.round(voiceNotes.reduce((sum, v) => sum + (Number.isFinite(v.duration) ? v.duration : 0), 0));
        chapters.push({
            id: 'ch-voices',
            kind: 'voices',
            slate: 'Voices kept',
            count: voiceNotes.length,
            minutes: Math.floor(seconds / 60),
            seconds,
        });
    }

    /* 8 — A line worth keeping (longest memory text, not the first entry). */
    const lineCandidate = [...textual]
        .filter((m) => m.id !== first?.id && m.text.trim().length >= 80)
        .sort((a, b) => b.text.trim().length - a.text.trim().length)[0];
    if (lineCandidate) {
        chapters.push({
            id: 'ch-line',
            kind: 'line',
            slate: 'A line worth keeping',
            excerpt: excerptOf(lineCandidate.text, 180),
            dateLabel: isoDateLabel(lineCandidate.date),
        });
    }

    /* 9 — The days you circle. */
    if (specialDates.length > 0) {
        const upcoming = specialDates
            .map((d) => ({ d, next: getNextAnnualOccurrence(d.date) }))
            .filter((x): x is { d: typeof x.d; next: Date } => x.next !== null)
            .sort((a, b) => a.next.getTime() - b.next.getTime())[0];
        if (upcoming) {
            chapters.push({
                id: 'ch-dates',
                kind: 'dates',
                slate: 'The days you circle',
                count: specialDates.length,
                nextTitle: upcoming.d.title,
                nextLabel: upcoming.next.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
                daysUntil: daysUntilDate(upcoming.next),
            });
        }
    }

    /* 10 — The latest chapter (most recent memory, distinct from the first). */
    if (latest && latest.id !== first?.id) {
        chapters.push({
            id: 'ch-latest',
            kind: 'latest',
            slate: 'The latest chapter',
            excerpt: excerptOf(latest.text),
            dateLabel: isoDateLabel(latest.date),
            daysAgo: daysAgoOf(latest.date),
        });
    }

    /* 11 — A scene unwritten (sparse-data nudge keeps short films ≥ 4). */
    if (chapters.length < 5) {
        chapters.push({ id: 'ch-tonight', kind: 'tonight', slate: 'A scene unwritten' });
    }

    /* 12 — Daily ritual scenes: every revealed question becomes a permanent
       scene. Most-recent first, capped to keep the player fast. Spliced in
       before the outro so the credits always land last. */
    const ritualChapters = buildRitualChapters(profile.questions, profile.myName, profile.partnerName);
    chapters.push(...ritualChapters);

    /* 13 — Outro (always). */
    chapters.push({ id: 'ch-outro', kind: 'outro', slate: 'To be continued', myName, partnerName });

    return { chapters, myName, partnerName, days };
}

/** "~1 min" style runtime estimate for n chapters. */
export const runtimeLabel = (chapterCount: number): string => {
    const seconds = Math.round((chapterCount * CHAPTER_MS) / 1000);
    return seconds < 60 ? `${seconds} sec` : `~${Math.round(seconds / 60)} min`;
};
