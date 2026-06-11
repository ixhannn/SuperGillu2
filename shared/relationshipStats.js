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
