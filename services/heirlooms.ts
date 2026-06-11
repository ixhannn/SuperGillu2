import { StorageService } from './storage';
import { PremiumFeaturesStore } from './premiumFeatures';
import { daysTogetherFrom, parseStoredDateOnly } from '../shared/dateOnly.js';

/**
 * Heirlooms — collectible artworks struck from the couple's real data on
 * the days that matter. The schedule is derived purely from the
 * anniversary date, so every couple has a timeline of past strikes and a
 * next arrival from day one. Artwork is deterministic: the same couple,
 * milestone and data always strike the same piece.
 */

export type HeirloomArtStyle = 'constellation' | 'rings' | 'letterpress' | 'orbit' | 'tapestry';

/** Display names for the plaque's edition line. */
export const HEIRLOOM_STYLE_LABELS: Record<HeirloomArtStyle, string> = {
    constellation: 'Constellation',
    rings: 'Rings',
    letterpress: 'Letterpress',
    orbit: 'Orbit',
    tapestry: 'Tapestry',
};

export interface HeirloomMilestone {
    id: string;
    kind: 'origin' | 'days' | 'year';
    /** Day count, or year count for anniversaries. 0 for the origin. */
    value: number;
    /** Display title, e.g. "One Thousand Days". */
    title: string;
    /** Small caption under the title. */
    caption: string;
    /** One-line inscription, chosen deterministically for this strike. */
    engraving: string;
    date: Date;
    dateLabel: string;
    arrived: boolean;
    daysUntil: number;
    /** Chronological strike number, 1-based ("No. 003"). */
    strikeNo: number;
    style: HeirloomArtStyle;
    seed: number;
}

export interface HeirloomSchedule {
    /** Struck pieces, newest first. */
    arrived: HeirloomMilestone[];
    /** The next strike, if any. */
    next: HeirloomMilestone | null;
    /** A couple more on the horizon after `next`. */
    horizon: HeirloomMilestone[];
    /** 0..1 — how far today sits between the last strike and the next. */
    progressToNext: number;
}

const DAY_MARKS = [100, 200, 365, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];

const NUMBER_TITLES: Record<number, string> = {
    100: 'One Hundred Days',
    200: 'Two Hundred Days',
    365: 'One Year of Days',
    500: 'Five Hundred Days',
    750: 'Seven Hundred Fifty Days',
    1000: 'One Thousand Days',
    1500: 'Fifteen Hundred Days',
    2000: 'Two Thousand Days',
    2500: 'Twenty-Five Hundred Days',
    3000: 'Three Thousand Days',
    4000: 'Four Thousand Days',
    5000: 'Five Thousand Days',
    7500: 'Seventy-Five Hundred Days',
    10000: 'Ten Thousand Days',
};

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

const hashSeed = (input: string): number => {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

const addDays = (start: Date, n: number): Date => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    d.setDate(d.getDate() + n);
    return d;
};

const addYears = (start: Date, n: number): Date =>
    new Date(start.getFullYear() + n, start.getMonth(), start.getDate());

const dateLabelOf = (d: Date): string =>
    d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

// APPEND-ONLY: the deterministic style formula indexes into this array, so
// existing entries must never be reordered or removed — only added after.
const STYLE_CYCLE: HeirloomArtStyle[] = ['constellation', 'rings', 'letterpress', 'orbit', 'tapestry'];

/* ── Engravings — one quiet line per strike, deterministic per kind+seed ── */

const ORIGIN_ENGRAVINGS: string[] = [
    'Before the photographs, there was just this day.',
    'Everything since has needed this one yes.',
    'The day the ordinary changed hands.',
    'It started small, the way true things do.',
    'One date the calendar never recovered from.',
    'The first page, kept exactly as it was.',
    'Where the two of you became a place.',
    'No one else saw it happen. That was the point.',
];

const DAYS_ENGRAVINGS: string[] = [
    'Ordinary days, and not one of them wasted.',
    'Counted because every one of them mattered.',
    'Each day a small vote for the same person.',
    'Days that stacked quietly into something rare.',
    'Most of them were ordinary. That is the point.',
    'Kept one day at a time, never all at once.',
    'So many mornings that began the same lucky way.',
    'Proof that staying is its own kind of romance.',
    'None of these days needed to be remarkable.',
];

const YEAR_ENGRAVINGS: string[] = [
    'A year is just practice for the next one.',
    'Another orbit, closer than the last.',
    'Twelve more months, and still choosing this.',
    'Seasons changed. The answer did not.',
    'One more year folded carefully into the keeping.',
    'The kind of year you only get by staying.',
    'A whole year, spent in excellent company.',
    'Years are long. Somehow these go quickly.',
];

const engravingFor = (kind: HeirloomMilestone['kind'], seed: number): string => {
    const pool = kind === 'origin' ? ORIGIN_ENGRAVINGS : kind === 'year' ? YEAR_ENGRAVINGS : DAYS_ENGRAVINGS;
    return pool[seed % pool.length];
};

export function buildHeirloomSchedule(now: Date = new Date()): HeirloomSchedule {
    const profile = StorageService.getCoupleProfile();
    const start = parseStoredDateOnly(profile.anniversaryDate);
    if (!start) return { arrived: [], next: null, horizon: [], progressToNext: 0 };

    const seedBase = `${profile.coupleId ?? ''}|${profile.myName ?? ''}|${profile.partnerName ?? ''}`;
    const daysSoFar = daysTogetherFrom(start, now);

    const all: Array<Omit<HeirloomMilestone, 'strikeNo' | 'style' | 'arrived' | 'daysUntil' | 'engraving'>> = [];

    // The origin — the day it began. Everyone's first heirloom, free.
    all.push({
        id: 'origin',
        kind: 'origin',
        value: 0,
        title: 'The Beginning',
        caption: 'The day your story started',
        date: start,
        dateLabel: dateLabelOf(start),
        seed: hashSeed(`${seedBase}|origin`),
    });

    // Day-count strikes, past and a stretch into the future.
    const marks = [...DAY_MARKS];
    let rolling = 11000;
    while (rolling <= daysSoFar + 4000) {
        marks.push(rolling);
        rolling += 1000;
    }
    for (const mark of marks) {
        all.push({
            id: `day_${mark}`,
            kind: 'days',
            value: mark,
            title: NUMBER_TITLES[mark] ?? `${mark.toLocaleString()} Days`,
            caption: `Day ${mark.toLocaleString()}, together`,
            date: addDays(start, mark),
            dateLabel: dateLabelOf(addDays(start, mark)),
            seed: hashSeed(`${seedBase}|day_${mark}`),
        });
    }

    // Anniversary strikes (year marks).
    const maxYear = Math.floor(daysSoFar / 365) + 2;
    for (let y = 1; y <= maxYear; y++) {
        all.push({
            id: `year_${y}`,
            kind: 'year',
            value: y,
            title: `The ${ORDINALS[y] ?? `${y}th`} Year`,
            caption: y === 1 ? 'One whole year of you two' : `${y} years, side by side`,
            date: addYears(start, y),
            dateLabel: dateLabelOf(addYears(start, y)),
            seed: hashSeed(`${seedBase}|year_${y}`),
        });
    }

    all.sort((a, b) => a.date.getTime() - b.date.getTime());

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const withMeta: HeirloomMilestone[] = all.map((m, i) => {
        const arrived = m.date.getTime() <= today.getTime();
        const daysUntil = Math.max(0, Math.round((m.date.getTime() - today.getTime()) / 86_400_000));
        const style: HeirloomArtStyle = m.kind === 'origin'
            ? 'constellation'
            : STYLE_CYCLE[(i + (m.seed % STYLE_CYCLE.length)) % STYLE_CYCLE.length];
        return { ...m, strikeNo: i + 1, arrived, daysUntil, style, engraving: engravingFor(m.kind, m.seed) };
    });

    const arrived = withMeta.filter((m) => m.arrived).reverse();
    const upcoming = withMeta.filter((m) => !m.arrived);
    const next = upcoming[0] ?? null;

    let progressToNext = 0;
    if (next) {
        const prevTime = arrived[0]?.date.getTime();
        const nextTime = next.date.getTime();
        if (prevTime !== undefined && nextTime > prevTime) {
            progressToNext = Math.min(1, Math.max(0, (today.getTime() - prevTime) / (nextTime - prevTime)));
        }
    }

    return { arrived, next, horizon: upcoming.slice(1, 3), progressToNext };
}

/** Ids the couple has ceremonially unsealed. */
export const getCollectedHeirloomIds = (): Set<string> =>
    new Set(PremiumFeaturesStore.getHeirloomState().collected);

export const collectHeirloom = (id: string): void => {
    const state = PremiumFeaturesStore.getHeirloomState();
    if (state.collected.includes(id)) return;
    PremiumFeaturesStore.saveHeirloomState({ ...state, collected: [...state.collected, id] });
};

/**
 * The single free taste: the origin heirloom. Every other strike is Gold.
 */
export const isHeirloomFree = (m: HeirloomMilestone): boolean => m.kind === 'origin';

/* ── Stats at a strike date — what the mint saw that day ────────────── */

export interface HeirloomStrikeStats {
    /** Memories kept on or before the strike date. */
    memories: number;
    /** Voice notes kept on or before the strike date. */
    voiceNotes: number;
    /** Total recorded seconds across those voice notes. */
    voiceSeconds: number;
}

/** Pure: count what existed by the end of the given calendar day. */
export function computeHeirloomStatsAtDate(
    memories: ReadonlyArray<{ date?: string }>,
    voiceNotes: ReadonlyArray<{ createdAt?: string; duration?: number }>,
    at: Date,
): HeirloomStrikeStats {
    const cutoff = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime();
    let memoryCount = 0;
    for (const memory of memories) {
        const t = memory?.date ? new Date(memory.date).getTime() : Number.NaN;
        if (Number.isFinite(t) && t < cutoff) memoryCount += 1;
    }
    let voiceCount = 0;
    let voiceSeconds = 0;
    for (const note of voiceNotes) {
        const t = note?.createdAt ? new Date(note.createdAt).getTime() : Number.NaN;
        if (Number.isFinite(t) && t < cutoff) {
            voiceCount += 1;
            voiceSeconds += Math.max(0, Number(note.duration) || 0);
        }
    }
    return { memories: memoryCount, voiceNotes: voiceCount, voiceSeconds: Math.round(voiceSeconds) };
}

/** Stats-at-strike, read from the couple's real data. Never throws. */
export function getHeirloomStatsAtDate(at: Date): HeirloomStrikeStats {
    try {
        const memories = StorageService.getMemories();
        const voiceNotes = StorageService.getVoiceNotes?.() ?? [];
        return computeHeirloomStatsAtDate(memories, voiceNotes, at);
    } catch {
        return { memories: 0, voiceNotes: 0, voiceSeconds: 0 };
    }
}

/* ── Strike-day notification (best effort, native only) ─────────────── */

const CAP_LOCAL_NOTIFICATIONS = '@capacitor/local-notifications';

interface LocalNotificationsLike {
    checkPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
    schedule: (opts: { notifications: unknown[] }) => Promise<unknown>;
}

/**
 * Schedule a local notification for the morning of the next strike.
 * Passive surface rules: never prompts for permission, never throws, and
 * the single stable id means re-scheduling replaces the pending entry
 * instead of stacking duplicates.
 */
export async function scheduleNextHeirloomStrikeNotification(next: HeirloomMilestone | null): Promise<void> {
    if (!next || next.daysUntil <= 0) return;
    try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const mod = (await import(/* @vite-ignore */ CAP_LOCAL_NOTIFICATIONS)) as { LocalNotifications?: LocalNotificationsLike };
        const local = mod.LocalNotifications;
        if (!local) return;
        const { display } = await local.checkPermissions();
        if (display !== 'granted') return;
        const at = new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate(), 9, 0, 0);
        if (at.getTime() <= Date.now()) return;
        await local.schedule({
            notifications: [{
                id: hashSeed('heirloom-strike') % 2_000_000_000,
                title: 'An heirloom was struck today',
                body: `${next.title} is sealed and waiting in your gallery.`,
                channelId: 'lior-reminders',
                smallIcon: 'ic_notification',
                schedule: { at, allowWhileIdle: true },
                extra: { kind: 'heirloom-strike', milestoneId: next.id },
            }],
        });
    } catch {
        /* best effort — the gallery must never block on notifications */
    }
}
