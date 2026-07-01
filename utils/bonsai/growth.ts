/**
 * Pure growth engine: turns the append-only event log into the tree's state.
 * No I/O, no Date.now() — callers pass `today` so both partners (and tests)
 * compute identical results.
 */

import { childSeed, createRng } from './rng';
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

interface DayEntry {
  watered: Set<string>;
  noteEvents: BonsaiEvent[];
}

const collectDays = (events: BonsaiEvent[]): Map<string, DayEntry> => {
  const days = new Map<string, DayEntry>();
  for (const ev of events) {
    if (ev.type !== 'water') continue;
    const entry = days.get(ev.day) ?? { watered: new Set<string>(), noteEvents: [] };
    entry.watered.add(ev.authorId);
    if (ev.note && ev.note.trim().length > 0) entry.noteEvents.push(ev);
    days.set(ev.day, entry);
  }
  return days;
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

const streaksFrom = (bloomDays: string[], today: string): { streak: number; best: number } => {
  if (bloomDays.length === 0) return { streak: 0, best: 0 };
  const sorted = [...bloomDays].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const last = sorted[sorted.length - 1];
  const gap = daysBetween(last, today);
  if (gap > 1) return { streak: 0, best };
  // Current run counts while today is still winnable (gap 0 or 1).
  let current = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) current++;
    else break;
  }
  return { streak: current, best };
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
  const myWaterDays = new Set<string>();
  let partnerWatered = false;
  for (const day of sortedDays) {
    const entry = days.get(day)!;
    const both = entry.watered.size >= 2;
    growth += both ? GROWTH_BOTH : GROWTH_SOLO;
    if (both) bloomDays.push(day);
    if (entry.watered.has(selfId)) myWaterDays.add(day);
    if ([...entry.watered].some((id) => id !== selfId)) partnerWatered = true;
  }

  const { stage, next, progress } = stageFor(growth);
  const { streak, best } = streaksFrom(bloomDays, today);

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
    streak,
    bestStreak: best,
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
