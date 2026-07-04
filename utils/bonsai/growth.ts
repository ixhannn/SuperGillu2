/**
 * Pure growth engine: turns the append-only event log into the tree's state.
 * No I/O, no Date.now() — callers pass `today` so both partners (and tests)
 * compute identical results.
 */

import { childSeed, createRng } from './rng';
import { MAX_GROWTH, type BonsaiSpeciesId } from './voxelModel';
import type {
  BlossomNote,
  BonsaiDecoration,
  BonsaiEvent,
  BonsaiStage,
  BonsaiTreeState,
  DayMood,
} from './types';

export const GROWTH_BOTH = 3;
export const GROWTH_SOLO = 1;
export const RESTING_AFTER_DAYS = 3;

export const BONSAI_STAGES: readonly BonsaiStage[] = [
  { id: 'seed', name: 'Seed', at: 0, line: 'Everything you will become is already here.' },
  { id: 'sprout', name: 'Sprout', at: 1, line: 'A first brave reach toward the light.' },
  { id: 'seedling', name: 'Seedling', at: 5, line: 'Small, certain, and growing.' },
  { id: 'sapling', name: 'Sapling', at: 12, line: 'The trunk remembers every day you showed up.' },
  { id: 'young', name: 'Young Tree', at: 24, line: 'Branches begin to find their shape.' },
  { id: 'shaped', name: 'Taking Shape', at: 45, line: 'A silhouette only the two of you could grow.' },
  { id: 'first-bloom', name: 'First Bloom', at: 75, line: 'The first blossom opens. It was worth the wait.' },
  { id: 'blossoming', name: 'Blossoming', at: 130, line: 'Pink gathers like a held breath.' },
  { id: 'radiant', name: 'Radiant', at: 220, line: 'The whole crown hums with colour.' },
  { id: 'ancient', name: 'Ancient', at: 400, line: 'An heirloom now. It will outgrow seasons.' },
];

export const BONSAI_DECORATIONS: readonly BonsaiDecoration[] = [
  { id: 'moss', name: 'Moss Garden', description: 'A 3-day streak carpets the soil in soft moss.', metric: 'streak', threshold: 3 },
  { id: 'lantern', name: 'Stone Lantern', description: 'A 7-day streak lights a lantern beside the pot.', metric: 'streak', threshold: 7 },
  { id: 'wind-chime', name: 'Wind Chime', description: '14 shared blooms hang a chime in the branches.', metric: 'bloom', threshold: 14 },
  { id: 'koi-pond', name: 'Koi Pond', description: 'A 14-day streak pools into a tiny koi pond.', metric: 'streak', threshold: 14 },
  { id: 'bench', name: 'Garden Bench', description: '30 shared blooms earn a bench for two.', metric: 'bloom', threshold: 30 },
  { id: 'torii', name: 'Torii Gate', description: 'A 30-day streak raises a gate at the garden edge.', metric: 'streak', threshold: 30 },
  { id: 'nest', name: 'Songbird Nest', description: '50 shared blooms and a songbird moves in.', metric: 'bloom', threshold: 50 },
];

const DAY_MS = 86400000;

export const dayKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (day: string, delta: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
};

export const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / DAY_MS);
};

/** Deterministic per-day ambience so both partners see the same sky. */
export const dayMood = (seed: number, day: string): DayMood => {
  const rng = createRng(childSeed(seed, `mood:${day}`));
  return { golden: rng() < 0.06, rain: rng() < 0.12, butterfly: rng() < 0.18 };
};

/** Both partners watered within this window → a "twin bloom". */
export const TWIN_WINDOW_MS = 120_000;

interface DayEntry {
  watered: Set<string>;
  /** Earliest water timestamp per author — drives twin-bloom detection. */
  wateredAt: Map<string, number>;
  noteEvents: BonsaiEvent[];
}

const collectDays = (events: BonsaiEvent[]): Map<string, DayEntry> => {
  const days = new Map<string, DayEntry>();
  for (const ev of events) {
    if (ev.type !== 'water') continue;
    const entry = days.get(ev.day)
      ?? { watered: new Set<string>(), wateredAt: new Map<string, number>(), noteEvents: [] };
    entry.watered.add(ev.authorId);
    const ts = Date.parse(ev.createdAt);
    if (Number.isFinite(ts)) {
      const prev = entry.wateredAt.get(ev.authorId);
      if (prev === undefined || ts < prev) entry.wateredAt.set(ev.authorId, ts);
    }
    if (ev.note && ev.note.trim().length > 0) entry.noteEvents.push(ev);
    days.set(ev.day, entry);
  }
  return days;
};

const isTwin = (entry: DayEntry): boolean => {
  if (entry.watered.size < 2) return false;
  const times = [...entry.wateredAt.values()];
  if (times.length < 2) return false;
  times.sort((a, b) => a - b);
  return times[times.length - 1] - times[0] <= TWIN_WINDOW_MS;
};

const stageFor = (growth: number): { stage: BonsaiStage; next: BonsaiStage | null; progress: number } => {
  let stage = BONSAI_STAGES[0];
  let next: BonsaiStage | null = null;
  for (let i = BONSAI_STAGES.length - 1; i >= 0; i--) {
    if (growth >= BONSAI_STAGES[i].at) {
      stage = BONSAI_STAGES[i];
      next = BONSAI_STAGES[i + 1] ?? null;
      break;
    }
  }
  const progress = next ? Math.min(1, (growth - stage.at) / (next.at - stage.at)) : 1;
  return { stage, next, progress };
};

/**
 * Rain days: one single-day gap per calendar month is bridged automatically —
 * "the rain watered it for you". Warm streak protection, never a punishment.
 * Deterministic: computed forward over the sorted bloom days, so both partners
 * agree on exactly which days it rained.
 */
const bridgeRainDays = (sorted: string[]): { effective: string[]; rainDays: string[] } => {
  const effective: string[] = [];
  const rainDays: string[] = [];
  const usedMonths = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 2) {
      const missed = addDays(sorted[i - 1], 1);
      const month = missed.slice(0, 7);
      if (!usedMonths.has(month)) {
        usedMonths.add(month);
        rainDays.push(missed);
        effective.push(missed);
      }
    }
    effective.push(sorted[i]);
  }
  return { effective, rainDays };
};

const streaksFrom = (
  bloomDays: string[],
  today: string,
): { streak: number; best: number; rainDays: string[] } => {
  if (bloomDays.length === 0) return { streak: 0, best: 0, rainDays: [] };
  const { effective: sorted, rainDays } = bridgeRainDays([...bloomDays].sort());
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const last = sorted[sorted.length - 1];
  const gap = daysBetween(last, today);
  if (gap > 1) return { streak: 0, best, rainDays };
  // Current run counts while today is still winnable (gap 0 or 1).
  let current = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) current++;
    else break;
  }
  return { streak: current, best, rainDays };
};

/* ── The grove: one couple, many trees ───────────────────────────────
   When a tree reaches Ancient it can be "completed": a 'plant' event starts
   the next tree (new species, new DNA) and the finished one joins the grove.
   Events are segmented chronologically by plant events, so both partners
   derive identical gardens from the same log. */

export interface CompletedTree {
  index: number;
  species: BonsaiSpeciesId;
  seed: number;
  growth: number;
  bloomCount: number;
  firstDay: string | null;
  lastDay: string | null;
}

export interface GardenState {
  completed: CompletedTree[];
  currentIndex: number;
  currentSpecies: BonsaiSpeciesId;
  currentSeed: number;
  /** Events belonging to the tree currently growing. */
  currentEvents: BonsaiEvent[];
}

const SPECIES_IDS: readonly BonsaiSpeciesId[] = ['sakura', 'wisteria', 'plum', 'maple'];

const asSpecies = (raw: string | null | undefined): BonsaiSpeciesId =>
  SPECIES_IDS.includes(raw as BonsaiSpeciesId) ? (raw as BonsaiSpeciesId) : 'sakura';

export const treeSeed = (baseSeed: number, index: number): number =>
  index === 0 ? baseSeed : childSeed(baseSeed, `tree:${index}`);

const summarizeSegment = (
  events: BonsaiEvent[],
  index: number,
  species: BonsaiSpeciesId,
  baseSeed: number,
): CompletedTree => {
  const days = collectDays(events);
  let growth = 0;
  let bloomCount = 0;
  const sorted = [...days.keys()].sort();
  for (const day of sorted) {
    const both = days.get(day)!.watered.size >= 2;
    growth += both ? GROWTH_BOTH : GROWTH_SOLO;
    if (both) bloomCount++;
  }
  return {
    index,
    species,
    seed: treeSeed(baseSeed, index),
    growth,
    bloomCount,
    firstDay: sorted[0] ?? null,
    lastDay: sorted[sorted.length - 1] ?? null,
  };
};

export const computeGarden = (events: BonsaiEvent[], baseSeed: number): GardenState => {
  const plants = events
    .filter((e) => e.type === 'plant')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  if (plants.length === 0) {
    return {
      completed: [],
      currentIndex: 0,
      currentSpecies: 'sakura',
      currentSeed: baseSeed,
      currentEvents: events,
    };
  }

  const segments: BonsaiEvent[][] = Array.from({ length: plants.length + 1 }, () => []);
  for (const ev of events) {
    if (ev.type === 'plant') continue;
    let idx = 0;
    for (let i = 0; i < plants.length; i++) {
      if (ev.createdAt >= plants[i].createdAt) idx = i + 1;
    }
    segments[idx].push(ev);
  }

  const speciesOf = (segIndex: number): BonsaiSpeciesId =>
    segIndex === 0 ? 'sakura' : asSpecies(plants[segIndex - 1].species);

  const completed: CompletedTree[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    completed.push(summarizeSegment(segments[i], i, speciesOf(i), baseSeed));
  }

  const currentIndex = segments.length - 1;
  return {
    completed,
    currentIndex,
    currentSpecies: speciesOf(currentIndex),
    currentSeed: treeSeed(baseSeed, currentIndex),
    currentEvents: segments[currentIndex],
  };
};

/** The current tree can be completed and a new seed planted. */
export const canPlantNext = (growth: number): boolean => growth >= MAX_GROWTH;

export type BonsaiSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Real-calendar season (northern hemisphere) — drives palette + ambience. */
export const seasonFor = (day: string): BonsaiSeason => {
  const month = Number(day.slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
};

const buildNotes = (
  events: BonsaiEvent[],
  selfId: string,
  myWaterDays: Set<string>,
): { notes: BlossomNote[]; unread: number } => {
  const opened = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'note_open' && ev.targetEventId) opened.add(`${ev.authorId}:${ev.targetEventId}`);
  }
  let lastMyWaterDay = '';
  for (const d of myWaterDays) if (d > lastMyWaterDay) lastMyWaterDay = d;

  const notes: BlossomNote[] = [];
  let unread = 0;
  for (const ev of events) {
    if (ev.type !== 'water' || !ev.note || ev.note.trim().length === 0) continue;
    const forMe = ev.authorId !== selfId;
    // A partner's sealed note unlocks once I have watered on that day or later.
    const unlocked = forMe ? lastMyWaterDay >= ev.day : true;
    const openedByRecipient = forMe ? opened.has(`${selfId}:${ev.id}`) : [...opened].some((k) => k.endsWith(`:${ev.id}`));
    if (forMe && unlocked && !openedByRecipient) unread++;
    notes.push({
      eventId: ev.id,
      authorId: ev.authorId,
      day: ev.day,
      note: ev.note,
      unlocked: forMe ? unlocked : true,
      opened: openedByRecipient,
      forMe,
    });
  }
  notes.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return { notes, unread };
};

export interface ComputeTreeInput {
  events: BonsaiEvent[];
  seed: number;
  today: string;
  selfId: string;
}

export const computeTreeState = (input: ComputeTreeInput): BonsaiTreeState => {
  const { events, seed, today, selfId } = input;
  const days = collectDays(events);
  const sortedDays = [...days.keys()].sort();

  let growth = 0;
  const bloomDays: string[] = [];
  const twinDays: string[] = [];
  const myWaterDays = new Set<string>();
  let partnerWatered = false;
  for (const day of sortedDays) {
    const entry = days.get(day)!;
    const both = entry.watered.size >= 2;
    growth += both ? GROWTH_BOTH : GROWTH_SOLO;
    if (both) {
      bloomDays.push(day);
      if (isTwin(entry)) twinDays.push(day);
    }
    if (entry.watered.has(selfId)) myWaterDays.add(day);
    if ([...entry.watered].some((id) => id !== selfId)) partnerWatered = true;
  }

  const { stage, next, progress } = stageFor(growth);
  const { streak, best, rainDays } = streaksFrom(bloomDays, today);

  const todayEntry = days.get(today);
  const wateredTodayByMe = todayEntry?.watered.has(selfId) ?? false;
  const wateredTodayByPartner = [...(todayEntry?.watered ?? [])].some((id) => id !== selfId);

  const lastDay = sortedDays[sortedDays.length - 1];
  const restingDays = lastDay ? Math.max(0, daysBetween(lastDay, today)) : 0;

  const decorations = BONSAI_DECORATIONS.filter((d) =>
    d.metric === 'streak' ? best >= d.threshold : bloomDays.length >= d.threshold,
  );
  const locked = BONSAI_DECORATIONS.filter((d) => !decorations.includes(d));
  const nextDecoration = locked.length
    ? {
        decoration: locked.reduce((a, b) => {
          const remA = a.threshold - (a.metric === 'streak' ? best : bloomDays.length);
          const remB = b.threshold - (b.metric === 'streak' ? best : bloomDays.length);
          return remB < remA ? b : a;
        }),
        have: 0,
      }
    : null;
  if (nextDecoration) {
    const d = nextDecoration.decoration;
    nextDecoration.have = d.metric === 'streak' ? best : bloomDays.length;
  }

  const { notes, unread } = buildNotes(events, selfId, myWaterDays);
  const myFirstWaterDone = myWaterDays.size > 0;

  return {
    growth,
    stage,
    nextStage: next,
    stageProgress: progress,
    bloomDays,
    twinDays,
    streak,
    bestStreak: best,
    rainDays,
    totalWaterDays: sortedDays.length,
    wateredTodayByMe,
    wateredTodayByPartner,
    restingDays,
    resting: restingDays > RESTING_AFTER_DAYS && sortedDays.length > 0,
    decorations,
    nextDecoration,
    notes,
    unreadNotesForMe: unread,
    mood: dayMood(seed, today),
    planted: myFirstWaterDone && partnerWatered,
    myFirstWaterDone,
    partnerFirstWaterDone: partnerWatered,
  };
};
