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

export type HeirloomArtStyle = 'constellation' | 'rings' | 'letterpress';

export interface HeirloomMilestone {
    id: string;
    kind: 'origin' | 'days' | 'year';
    /** Day count, or year count for anniversaries. 0 for the origin. */
    value: number;
    /** Display title, e.g. "One Thousand Days". */
    title: string;
    /** Small caption under the title. */
    caption: string;
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

const STYLE_CYCLE: HeirloomArtStyle[] = ['constellation', 'rings', 'letterpress'];

export function buildHeirloomSchedule(now: Date = new Date()): HeirloomSchedule {
    const profile = StorageService.getCoupleProfile();
    const start = parseStoredDateOnly(profile.anniversaryDate);
    if (!start) return { arrived: [], next: null, horizon: [] };

    const seedBase = `${profile.coupleId ?? ''}|${profile.myName ?? ''}|${profile.partnerName ?? ''}`;
    const daysSoFar = daysTogetherFrom(start, now);

    const all: Array<Omit<HeirloomMilestone, 'strikeNo' | 'style' | 'arrived' | 'daysUntil'>> = [];

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
        return { ...m, strikeNo: i + 1, arrived, daysUntil, style };
    });

    const arrived = withMeta.filter((m) => m.arrived).reverse();
    const upcoming = withMeta.filter((m) => !m.arrived);
    return { arrived, next: upcoming[0] ?? null, horizon: upcoming.slice(1, 3) };
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
