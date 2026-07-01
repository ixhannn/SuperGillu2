/**
 * Notification copy engine.
 *
 * Turns each notification `kind` into warm, personalised, *rotating* copy so a
 * reminder never reads like the same robotic line every day. Three ideas:
 *
 *  - **Personal:** lines weave in the partner's name and how many days you've
 *    been together (when known) — `{partner}` / `{days}` tokens.
 *  - **Rotating:** the variant is chosen by the local-day index, so it changes
 *    daily but is *stable within a day* and *identical for both partners* in the
 *    same timezone — it feels intentional, not random.
 *  - **Rich:** an optional `largeBody` gives a fuller second line that Android
 *    expands via BigTextStyle.
 *
 * Voice: intimate, specific, unhurried — never naggy or cutesy. Matches the
 * app's warm aesthetic.
 */

import { StorageService } from './storage';
import { daysTogetherFrom, parseStoredDateOnly } from '../shared/dateOnly.js';
import type { NotificationSchedule } from '../types';

export interface NotificationCopy {
  title: string;
  body: string;
  /** Fuller second line, expanded via Android BigTextStyle. */
  largeBody?: string;
}

type Kind = NotificationSchedule['kind'];

interface Ctx {
  partner: string;
  days: number;
}

interface Variant {
  title: string;
  body: string;
  largeBody?: string;
  /** Only eligible when the couple's day-count is known (> 0). */
  needsDays?: boolean;
}

// Read the couple context defensively — copy must never throw or block the
// scheduler. Falls back to a warm, partner-agnostic voice when unpaired.
function readCtx(): Ctx {
  try {
    const profile = StorageService.getCoupleProfile();
    const start = parseStoredDateOnly(profile.anniversaryDate);
    const days = start ? daysTogetherFrom(start, new Date()) : 0;
    const partner = (profile.partnerName || '').trim();
    return { partner: partner || 'your partner', days: days > 0 ? days : 0 };
  } catch {
    return { partner: 'your partner', days: 0 };
  }
}

// Local-day index: constant across a calendar day, same for both partners in a
// timezone — so the rotating line is shared, not random.
function dayIndex(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

function fill(text: string, c: Ctx): string {
  return text
    .replace(/\{partner\}/g, c.partner)
    .replace(/\{days\}/g, c.days.toLocaleString('en-US'));
}

const POOLS: Partial<Record<Kind, Variant[]>> = {
  'daily-clip': [
    { title: 'A second of today',
      body: "Capture it for {partner} before the day's gone.",
      largeBody: 'Five seconds is all it takes — {partner} sees it tomorrow morning.' },
    { title: 'What did today feel like?',
      body: 'Save one moment for {partner}.',
      largeBody: 'A clip, a glance, the light right now. {partner} will love seeing it.' },
    { title: 'Before bed: one frame',
      body: 'Five seconds of right now, for {partner}.',
      largeBody: "The small moments are the ones you forget. Keep tonight's." },
    { title: 'Tonight, in five seconds',
      body: "Add today's clip for {partner}.",
      largeBody: "You'll want to remember this day. {partner} would too." },
    { title: 'Day {days}', body: 'Worth five seconds with {partner}?', needsDays: true,
      largeBody: 'Day {days} together — capture one piece of it before it slips away.' },
  ],
  'daily-ritual': [
    { title: "Today's question is waiting",
      body: "Answer together — {partner} won't see yours until they answer too.",
      largeBody: "One question, two answers. Neither of you sees the other's until you've both replied." },
    { title: 'One question before the day ends',
      body: '{partner} and you, the same question tonight.',
      largeBody: 'Answer honestly — it stays sealed until {partner} answers too.' },
    { title: '{partner} is one answer away',
      body: "Today's question is open — yours unlocks theirs.",
      largeBody: "Tap to answer. The moment you both do, you'll see what each other wrote." },
    { title: 'Something to ask each other',
      body: "Today's question is ready for you both.",
      largeBody: "It only takes a sentence. {partner}'s side unlocks when you answer." },
    { title: 'Day {days}. Today’s question?', body: 'Answer it with {partner} before bed.', needsDays: true,
      largeBody: "{days} days in and still learning each other. Today's question is waiting." },
  ],
  'daily-drop': [
    { title: "Today's drop is waiting",
      body: "Open it before midnight — after that it's gone.",
      largeBody: 'One drop a day, and only today. Open it with {partner} before midnight.' },
    { title: '{partner} left something for today',
      body: "It disappears at midnight. Don't miss it.",
      largeBody: "Today's drop won't be here tomorrow. Tap to open it now." },
    { title: "Before midnight: today's drop",
      body: 'Tap to open it with {partner}.',
      largeBody: "Drops vanish when the day ends. This one's still here — for now." },
    { title: 'One drop, just for today',
      body: "Open it before it's gone at midnight.",
      largeBody: "Some things are only meant for the day they happen. Here's today's." },
  ],
  'recap-sunday': [
    { title: 'Your week, in one page',
      body: 'See the moments you and {partner} saved.',
      largeBody: 'Seven days gathered into one. Open your recap with {partner}.' },
    { title: 'Sunday. Look back on your week',
      body: 'Your recap with {partner} is ready.',
      largeBody: 'A minute to remember the week you just had together.' },
    { title: 'The week you two just had',
      body: 'Tap to see your recap.',
      largeBody: 'Photos, moods, the little moments — your week with {partner}, replayed.' },
    { title: 'Day {days}. Another week down', body: 'Your recap with {partner} is ready.', needsDays: true,
      largeBody: '{days} days together, and one more week to look back on. Open your recap.' },
  ],
  'film-ready': [
    { title: 'Your film is ready',
      body: 'The moments you saved became something to watch.',
      largeBody: 'Your daily clips just turned into a little film. Press play with {partner}.' },
  ],
  'cycle-3-days': [
    { title: '3 days left',
      body: "There's still time to add to this one with {partner}.",
      largeBody: 'This cycle closes in three days. Add a moment before it seals.' },
  ],
};

const FALLBACK: Variant = {
  title: 'Lior',
  body: 'You have something waiting with {partner}.',
};

/**
 * Build personalised, rotating copy for a notification kind. Pure + safe:
 * deterministic for a given (kind, day, couple), never throws.
 */
export function notificationCopyFor(kind: Kind, date: Date = new Date()): NotificationCopy {
  const c = readCtx();
  const all = POOLS[kind] ?? [FALLBACK];
  // Drop day-count lines when we don't know the day count, so we never show a
  // hollow "Day 0".
  const eligible = all.filter((v) => !v.needsDays || c.days > 0);
  const pool = eligible.length > 0 ? eligible : all;
  const idx = ((dayIndex(date) % pool.length) + pool.length) % pool.length;
  const v = pool[idx];
  return {
    title: fill(v.title, c),
    body: fill(v.body, c),
    largeBody: v.largeBody ? fill(v.largeBody, c) : undefined,
  };
}
