import {
  calendarDayDifference,
  daysTogetherFrom,
  parseStoredDateOnly,
} from './dateOnly.js';
import { buildRelationshipMilestones } from './countdowns.js';

/**
 * "Relationship by the numbers" — instant, zero-input substance derived purely
 * from the anniversary date. Solves cold-start: even on day one the app can show
 * something that feels meaningful (hours together climb fast, the weekday the
 * story began, the next milestone to look forward to) instead of empty lists.
 *
 * @param {string} anniversaryDate
 * @param {Date} [now]
 * @returns {{
 *   days: number; weeks: number; months: number; years: number; hours: number;
 *   weekday: string; nextMilestone: { title: string; daysUntil: number } | null;
 * } | null}
 */
export function buildRelationshipStats(anniversaryDate, now = new Date()) {
  const start = parseStoredDateOnly(anniversaryDate);
  if (!start) return null;

  const days = daysTogetherFrom(start, now);
  const weeks = Math.floor(days / 7);
  const hours = days * 24;

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);

  const weekday = start.toLocaleDateString(undefined, { weekday: 'long' });

  const [next] = buildRelationshipMilestones(anniversaryDate, now, { maxDayMilestones: 1 });
  const nextMilestone = next
    ? { title: next.title, daysUntil: Math.max(0, calendarDayDifference(next.nextDate, now)) }
    : null;

  return { days, weeks, months, years, hours, weekday, nextMilestone };
}

/**
 * Precise, real-time elapsed breakdown for a live ticking counter. Pure: call it
 * once a second with a fresh `now` and the seconds advance. The anniversary is a
 * date (local midnight), so the H:M:S portion is simply the current time of day.
 *
 * @param {string} anniversaryDate
 * @param {Date} [now]
 * @returns {{
 *   years: number; months: number; days: number;
 *   hours: number; minutes: number; seconds: number;
 *   totalSeconds: number; isFuture: boolean;
 * } | null}
 */
export function buildLiveTogether(anniversaryDate, now = new Date()) {
  const startDateOnly = parseStoredDateOnly(anniversaryDate);
  if (!startDateOnly) return null;

  const start = new Date(startDateOnly.getFullYear(), startDateOnly.getMonth(), startDateOnly.getDate(), 0, 0, 0, 0);
  const totalMs = now.getTime() - start.getTime();
  if (totalMs <= 0) {
    return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isFuture: totalMs < 0 };
  }

  // Whole elapsed months, with one less month when we haven't reached the
  // anniversary day-of-month yet this month. Computing days from an
  // anniversary-anchored cursor (rather than borrowing a single previous
  // month) is borrow-safe: it never underflows when the calendar month before
  // `now` is shorter than the anniversary day-of-month (e.g. 31st anniversary
  // on March 1).
  let totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  // Anchor a cursor at the last completed monthly anniversary, clamping the
  // day-of-month to the target month's length so overflow days don't roll
  // forward (e.g. Jan 31 + 1 month stays in February).
  const targetY = start.getFullYear() + Math.floor((start.getMonth() + totalMonths) / 12);
  const targetM = ((start.getMonth() + totalMonths) % 12 + 12) % 12;
  const daysInTargetMonth = new Date(targetY, targetM + 1, 0).getDate();
  const cursor = new Date(targetY, targetM, Math.min(start.getDate(), daysInTargetMonth), 0, 0, 0, 0);
  const days = Math.floor((now.getTime() - cursor.getTime()) / 86400000);

  // Anniversary is local midnight, so time-of-day needs no borrowing.
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  return { years, months, days, hours, minutes, seconds, totalSeconds: Math.floor(totalMs / 1000), isFuture: false };
}
