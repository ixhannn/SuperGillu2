/**
 * Shared types for the voxel sakura bonsai feature.
 * The tree is event-sourced: every watering/note is an append-only event,
 * and the visible tree is a pure function of (events, coupleSeed, today).
 */

export type BonsaiEventType = 'water' | 'note_open';

export interface BonsaiEvent {
  id: string;
  coupleId: string;
  authorId: string;
  type: BonsaiEventType;
  /** Local calendar day of the author when the event happened, YYYY-MM-DD. */
  day: string;
  /** For 'water': optional sealed note. For 'note_open': id of the opened water event. */
  note?: string | null;
  targetEventId?: string | null;
  createdAt: string;
}

export type BonsaiStageId =
  | 'seed'
  | 'sprout'
  | 'seedling'
  | 'sapling'
  | 'young'
  | 'shaped'
  | 'first-bloom'
  | 'blossoming'
  | 'radiant'
  | 'ancient';

export interface BonsaiStage {
  id: BonsaiStageId;
  name: string;
  /** Growth points needed to enter this stage. */
  at: number;
  /** Short poetic line shown when the stage is reached. */
  line: string;
}

export type BonsaiDecorationId =
  | 'moss'
  | 'lantern'
  | 'wind-chime'
  | 'koi-pond'
  | 'bench'
  | 'torii';

export interface BonsaiDecoration {
  id: BonsaiDecorationId;
  name: string;
  description: string;
  /** 'streak' = best both-watered streak, 'bloom' = total both-watered days. */
  metric: 'streak' | 'bloom';
  threshold: number;
}

export interface BlossomNote {
  /** Id of the water event carrying the note. */
  eventId: string;
  authorId: string;
  day: string;
  note: string;
  /** Whether the viewing partner may read it yet (they must water first). */
  unlocked: boolean;
  /** Whether the recipient has opened it. */
  opened: boolean;
  /** True when this note is addressed to the viewer (authored by partner). */
  forMe: boolean;
}

export interface DayMood {
  /** Rare golden-petal day (~6%). */
  golden: boolean;
  /** Soft rain ambience (~12%). */
  rain: boolean;
  /** A butterfly visits (~18%). */
  butterfly: boolean;
}

export interface BonsaiTreeState {
  /** Total growth points (both watered = 3/day, one = 1/day). */
  growth: number;
  stage: BonsaiStage;
  nextStage: BonsaiStage | null;
  /** 0..1 progress from current stage to the next. */
  stageProgress: number;
  /** Days where BOTH partners watered — each one is a permanent blossom. */
  bloomDays: string[];
  /** Current consecutive both-watered streak (today counts once complete). */
  streak: number;
  bestStreak: number;
  totalWaterDays: number;
  wateredTodayByMe: boolean;
  wateredTodayByPartner: boolean;
  /** Days since anyone watered; tree "rests" (droops slightly) after 3. */
  restingDays: number;
  resting: boolean;
  decorations: BonsaiDecoration[];
  nextDecoration: { decoration: BonsaiDecoration; have: number } | null;
  notes: BlossomNote[];
  unreadNotesForMe: number;
  mood: DayMood;
  /** True until each partner has watered at least once (planting ceremony). */
  planted: boolean;
  myFirstWaterDone: boolean;
  partnerFirstWaterDone: boolean;
}
