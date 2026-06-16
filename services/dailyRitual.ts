/**
 * Daily Ritual — pure helpers for the two-person daily question.
 *
 * No persistence, no side effects: every function is a pure transform over the
 * couple's existing `questions[]`. Keeps the streak logic out of the storage
 * layer and trivially unit-testable.
 */

import { QuestionEntry } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar-day key (YYYY-MM-DD) for an ISO timestamp, matching storage's UTC convention. */
const dayKeyOf = (iso: string): string => new Date(iso).toISOString().split('T')[0];

/** Today's calendar-day key, matching `getTodayQuestion`'s convention. */
const todayKey = (): string => new Date().toISOString().split('T')[0];

/** Shifts a YYYY-MM-DD key by `n` days (negative = earlier). */
const shiftDay = (key: string, n: number): string =>
  new Date(new Date(`${key}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().split('T')[0];

/**
 * Honest "X days in a row" streak from revealed questions.
 *
 * Counts consecutive calendar days of revealed answers ending today (or
 * yesterday, if today isn't revealed yet so an unanswered morning doesn't
 * read as a broken streak). ONE freeze (a single skipped day) is allowed per
 * rolling 7-day window, so a lone miss doesn't reset the count.
 *
 * Pure over the entry dates — no new persistence.
 */
export const getRitualStreak = (questions: readonly QuestionEntry[] | undefined): number => {
  if (!questions || questions.length === 0) return 0;

  // Set of calendar days that are genuinely revealed (both partners answered).
  const revealedDays = new Set<string>();
  for (const q of questions) {
    if (q.revealedAt) revealedDays.add(dayKeyOf(q.revealedAt));
  }
  if (revealedDays.size === 0) return 0;

  const today = todayKey();
  const yesterday = shiftDay(today, -1);

  // Anchor: today if revealed, else yesterday (grace for an unanswered today).
  let cursor: string;
  if (revealedDays.has(today)) cursor = today;
  else if (revealedDays.has(yesterday)) cursor = yesterday;
  else return 0;

  // Walk backwards day by day. Each consecutive revealed day extends the
  // streak. A single missed day is forgiven as a "freeze" so long as no other
  // freeze has been spent in the trailing 7-day window; a second miss inside
  // that window ends the run.
  let streak = 0;
  const freezeDays: string[] = [];

  while (true) {
    if (revealedDays.has(cursor)) {
      streak += 1;
      cursor = shiftDay(cursor, -1);
      continue;
    }

    // Missed day — only forgivable if no other freeze was already spent within
    // the trailing 7-day window. We walk backwards, so prior freezes are always
    // MORE RECENT (later) than `cursor`; forgive only when the nearest prior
    // freeze sits beyond `cursor`+6 days (i.e. freezes must be >= 7 days apart).
    const windowEnd = shiftDay(cursor, 6); // window = [cursor .. cursor+6], inclusive
    const freezeInWindow = freezeDays.some(d => d >= cursor && d <= windowEnd);
    if (freezeInWindow) break;

    freezeDays.push(cursor);
    cursor = shiftDay(cursor, -1);
  }

  return streak;
};
