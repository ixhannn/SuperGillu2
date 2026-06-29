/**
 * dropEngine.ts — the deterministic brain of the Daily Drop.
 *
 * Both partners run this independently and must converge on the SAME drop for a
 * given (coupleId, date) with no server coordination. Selection is seeded by a
 * hash of (coupleId|date); content is frozen into the saved row on first build.
 *
 * Pure & side-effect free (no Date.now() in selection — only in countdown/state
 * helpers that explicitly take `now`). Safe to unit-test.
 */
import type { DailyDrop, DropPrompt, DropType } from '../types';
import { getLocalDateString, fromLocalDateString, addDays } from '../hooks/useBiweeklyCycle';
import {
  THIS_OR_THAT,
  MOOD_PALETTE,
  GUESS_MY_MOOD_TITLES,
  DID_THEY_KNOW,
  FINISH_MY_SENTENCE,
  ON_THIS_DAY_TITLES,
  SECRET_WINDOW,
  THE_DARE,
  PULSE_TITLES,
} from '../data/dropContent';

// ── Rotation weights — easy/light frequent, heavy/intimate occasional ───────
const ROTATION_WEIGHTS: ReadonlyArray<{ type: DropType; weight: number }> = [
  { type: 'pulse', weight: 5 },
  { type: 'this_or_that', weight: 5 },
  { type: 'guess_my_mood', weight: 4 },
  { type: 'did_they_know', weight: 4 },
  { type: 'on_this_day', weight: 4 },
  { type: 'finish_my_sentence', weight: 3 },
  { type: 'the_dare', weight: 3 },
  { type: 'secret_window', weight: 2 },
];

/** Per-type identity used by the card / reveal / type components for a coherent look. */
export const DROP_META: Record<DropType, { label: string; glyph: string; hue: number }> = {
  this_or_that: { label: 'This or That', glyph: '🔀', hue: 270 },
  guess_my_mood: { label: 'Guess My Mood', glyph: '🎭', hue: 320 },
  did_they_know: { label: 'Did They Know?', glyph: '💭', hue: 245 },
  finish_my_sentence: { label: 'Finish My Sentence', glyph: '✍️', hue: 200 },
  on_this_day: { label: 'On This Day', glyph: '🕰️', hue: 35 },
  secret_window: { label: 'Secret Window', glyph: '🤫', hue: 290 },
  the_dare: { label: 'The Dare', glyph: '🎯', hue: 350 },
  pulse: { label: 'Pulse', glyph: '💗', hue: 335 },
};

export interface DropBuildContext {
  /** True if a memory from "this day" in a previous year exists (on_this_day eligibility). */
  hasThrowback?: boolean;
  /** Memory id to attach to an on_this_day drop. */
  throwbackMemoryId?: string;
}

export type DropState =
  | 'your_turn'           // I haven't responded, not expired
  | 'waiting'             // I responded, partner hasn't, not expired
  | 'both_in'             // both responded → reveal (UI splits this into reveal_ready / revealed)
  | 'expired_partial'     // expired, only I responded
  | 'expired_missed'      // expired, partner responded but I didn't
  | 'expired_both_missed';// expired, neither responded

// ── Hashing (deterministic, stable across devices) ──────────────────────────
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickIndex(seed: number, length: number): number {
  return length > 0 ? seed % length : 0;
}

function weightedPick(
  pool: ReadonlyArray<{ type: DropType; weight: number }>,
  seed: number,
): DropType {
  const total = pool.reduce((sum, w) => sum + w.weight, 0);
  let r = seed % total;
  for (const entry of pool) {
    if (r < entry.weight) return entry.type;
    r -= entry.weight;
  }
  return pool[pool.length - 1].type;
}

function eligiblePool(ctx: DropBuildContext) {
  return ROTATION_WEIGHTS.filter((w) => w.type !== 'on_this_day' || ctx.hasThrowback);
}

/** Deterministic drop type for the day, avoiding an immediate repeat of yesterday.
 *
 * KNOWN LIMITATION (needs a product/infra decision, not safe to "fix" here):
 * `on_this_day` is filtered out of the pool when this device has no throwback
 * memory (`ctx.hasThrowback`), which the product requires so we never show an
 * empty memory drop (see dropEngine.test.ts). But `hasThrowback` is PER-DEVICE,
 * so if the two partners disagree (memory sync lag, or a memory exists on only
 * one device) the pool — and thus the weighted pick for EVERY type that day —
 * differs, and they can land on different drops for the same shared row id.
 * Making this fully deterministic requires a SHARED signal (ideally a
 * server-issued daily seed, or syncing throwback-eligibility), which is out of
 * scope for a local fix. Left as-is to preserve the intentional no-empty-
 * on_this_day requirement.
 */
export function pickDropType(coupleId: string, date: string, ctx: DropBuildContext): DropType {
  const pool = eligiblePool(ctx);
  const seed = hashString(`${coupleId}|${date}`);
  let type = weightedPick(pool, seed);

  // Best-effort "never two days running": approximate yesterday with the same
  // pool (we don't carry yesterday's throwback context). Reroll on a collision.
  const yesterday = addDays(date, -1);
  const yType = weightedPick(pool, hashString(`${coupleId}|${yesterday}`));
  if (type === yType && pool.length > 1) {
    const reroll = weightedPick(pool, (seed ^ 0x9e3779b9) >>> 0);
    type = reroll === yType ? type : reroll;
  }
  return type;
}

function buildPrompt(type: DropType, coupleId: string, date: string, ctx: DropBuildContext): DropPrompt {
  const cSeed = hashString(`${coupleId}|${date}|content`);
  switch (type) {
    case 'this_or_that': {
      const e = THIS_OR_THAT[pickIndex(cSeed, THIS_OR_THAT.length)];
      return { type, title: e.title, options: [e.a, e.b] };
    }
    case 'guess_my_mood':
      return {
        type,
        title: GUESS_MY_MOOD_TITLES[pickIndex(cSeed, GUESS_MY_MOOD_TITLES.length)],
        subtitle: 'Pick yours — then guess theirs',
        options: MOOD_PALETTE,
      };
    case 'did_they_know': {
      const e = DID_THEY_KNOW[pickIndex(cSeed, DID_THEY_KNOW.length)];
      return { type, title: e.title, subtitle: 'Answer for you — and guess them', options: e.options };
    }
    case 'finish_my_sentence':
      return { type, title: 'Finish the sentence', sentenceStem: FINISH_MY_SENTENCE[pickIndex(cSeed, FINISH_MY_SENTENCE.length)] };
    case 'on_this_day':
      return {
        type,
        title: ON_THIS_DAY_TITLES[pickIndex(cSeed, ON_THIS_DAY_TITLES.length)],
        subtitle: 'Leave a note — they’ll see theirs once you both do',
        memoryId: ctx.throwbackMemoryId,
      };
    case 'secret_window':
      return { type, title: SECRET_WINDOW[pickIndex(cSeed, SECRET_WINDOW.length)], subtitle: 'Sealed until you both share' };
    case 'the_dare':
      return { type, title: 'Today’s tiny dare', dare: THE_DARE[pickIndex(cSeed, THE_DARE.length)] };
    case 'pulse':
    default:
      return { type: 'pulse', title: PULSE_TITLES[pickIndex(cSeed, PULSE_TITLES.length)] };
  }
}

/** ISO instant of the local midnight that ends `date` (i.e. start of the next day). */
export function nextLocalMidnightIso(date: string): string {
  return fromLocalDateString(addDays(date, 1)).toISOString();
}

/**
 * Build the day's drop shell (no responses yet). Deterministic & identical on both
 * devices. `forceType` is a dev/test override (see StorageService.devSetDropType);
 * production never passes it, so the deterministic path is unchanged.
 */
export function buildDailyDrop(coupleId: string, date: string, ctx: DropBuildContext = {}, forceType?: DropType): DailyDrop {
  const type = forceType ?? pickDropType(coupleId, date, ctx);
  const prompt = buildPrompt(type, coupleId, date, ctx);
  const createdAtAnchor = fromLocalDateString(date).toISOString();
  return {
    id: `${coupleId}_${date}`,
    coupleId,
    date,
    type,
    prompt,
    responses: {},
    createdAt: createdAtAnchor,
    expiresAt: nextLocalMidnightIso(date),
  };
}

export interface DropCountdown {
  expired: boolean;
  hours: number;
  minutes: number;
  label: string;        // "6h 12m left"
  compactLabel: string; // "6h 12m"
  urgent: boolean;      // < 3h remaining
}

export function getDropCountdown(expiresAt: string, now = Date.now()): DropCountdown {
  const diff = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) {
    return { expired: true, hours: 0, minutes: 0, label: 'Closed', compactLabel: 'Closed', urgent: false };
  }
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const compactLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { expired: false, hours, minutes, label: `${compactLabel} left`, compactLabel, urgent: diff < 3 * 3_600_000 };
}

/** Distinct responder keys present on the drop. */
export function responderKeys(drop: DailyDrop): string[] {
  return Object.keys(drop.responses || {});
}

/** True once both partners' keys are present. */
export function isDropComplete(drop: DailyDrop): boolean {
  return !!drop.revealedAt || responderKeys(drop).length >= 2;
}

export function deriveDropState(drop: DailyDrop, myKey: string, now = Date.now()): DropState {
  const keys = responderKeys(drop);
  const hasMine = keys.includes(myKey);
  const otherCount = keys.filter((k) => k !== myKey).length;
  const expired = new Date(drop.expiresAt).getTime() <= now;

  if (isDropComplete(drop)) return 'both_in';
  if (!expired) return hasMine ? 'waiting' : 'your_turn';
  if (hasMine) return 'expired_partial';
  if (otherCount > 0) return 'expired_missed';
  return 'expired_both_missed';
}

/** Today's local date key — single source of truth for "what day is the drop". */
export function todayDateKey(): string {
  return getLocalDateString();
}
