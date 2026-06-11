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

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  // Anniversary is local midnight, so time-of-day needs no borrowing.
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  if (days < 0) {
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += daysInPrevMonth;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  return { years, months, days, hours, minutes, seconds, totalSeconds: Math.floor(totalMs / 1000), isFuture: false };
}
