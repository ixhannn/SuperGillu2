import { StorageService } from './storage';
import type {
    CoupleProfile,
    DatePlan,
    DepthsState,
    DuetEntry,
    HeirloomState,
    MissionState,
} from '../types';

/**
 * Premium feature state lives on CoupleProfile so it rides the existing
 * profile persistence + cloud sync pipeline (same pattern as `questions`,
 * `streakData`, `bonsaiState`). Entries are capped so the profile blob
 * stays small.
 */

const DUET_CAP = 100;
const PLAN_CAP = 200;

const mutateProfile = (mutate: (p: CoupleProfile) => CoupleProfile): CoupleProfile => {
    const next = mutate(StorageService.getCoupleProfile());
    StorageService.saveCoupleProfile(next);
    return next;
};

/** Local Monday (YYYY-MM-DD) for weekly cycles. */
export const mondayOf = (date: Date = new Date()): string => {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
};

/** Deterministic tiny hash for seeded weekly selection. */
export const seededIndex = (seed: string, mod: number): number => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return mod > 0 ? h % mod : 0;
};

export const PremiumFeaturesStore = {
    // ── Duet Journal ────────────────────────────────────────────────
    getDuetEntries: (): DuetEntry[] =>
        StorageService.getCoupleProfile().duetEntries ?? [],

    saveDuetEntries: (entries: DuetEntry[]): void => {
        mutateProfile((p) => ({ ...p, duetEntries: entries.slice(-DUET_CAP) }));
    },

    // ── Date Studio ─────────────────────────────────────────────────
    getDatePlans: (): DatePlan[] =>
        StorageService.getCoupleProfile().datePlans ?? [],

    saveDatePlans: (plans: DatePlan[]): void => {
        mutateProfile((p) => ({ ...p, datePlans: plans.slice(-PLAN_CAP) }));
    },

    // ── Love Missions ───────────────────────────────────────────────
    getMissionState: (): MissionState | undefined =>
        StorageService.getCoupleProfile().missionState,

    saveMissionState: (state: MissionState): void => {
        mutateProfile((p) => ({ ...p, missionState: state }));
    },

    // ── Depths ──────────────────────────────────────────────────────
    getDepthsState: (): DepthsState => {
        const stored = StorageService.getCoupleProfile().depthsState;
        return stored ?? { favorites: [], completedSessions: 0 };
    },

    saveDepthsState: (state: DepthsState): void => {
        mutateProfile((p) => ({ ...p, depthsState: state }));
    },

    // ── Heirlooms ───────────────────────────────────────────────────
    getHeirloomState: (): HeirloomState => {
        const stored = StorageService.getCoupleProfile().heirloomState;
        return stored ?? { collected: [] };
    },

    saveHeirloomState: (state: HeirloomState): void => {
        mutateProfile((p) => ({ ...p, heirloomState: state }));
    },

    // ── Shared ──────────────────────────────────────────────────────
    isPremium: (): boolean => !!StorageService.getCoupleProfile().isPremium,
};
