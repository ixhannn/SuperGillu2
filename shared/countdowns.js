import {
  calendarDayDifference,
  daysTogetherFrom,
  daysUntilDate,
  getNextAnnualOccurrence,
  parseStoredDateOnly,
  storedDateToInputValue,
} from './dateOnly.js';

const isAnnualType = (type) => type === 'anniversary' || type === 'birthday';

// "Wow" day counts worth celebrating. Multiples of ~365 are intentionally
// excluded so they don't collide with the yearly anniversary event.
const DAY_MILESTONES = [100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const MAX_MONTHSARY = 18; // stop surfacing monthsaries once a couple is well established

const addDays = (start, n) => {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  d.setDate(d.getDate() + n);
  return d;
};

/**
 * The next whole-month "monthsary" after `now`, e.g. 7 months together.
 * @param {Date} start @param {Date} now
 * @returns {{ date: Date, monthsCount: number } | null}
 */
function getNextMonthsary(start, now) {
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const makeDate = (m) => {
    const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(start.getDate(), last));
    return d;
  };
  let candidate = makeDate(months);
  if (calendarDayDifference(candidate, now) < 0) {
    months += 1;
    candidate = makeDate(months);
  }
  if (months <= 0) {
    months = 1;
    candidate = makeDate(1);
  }
  return { date: candidate, monthsCount: months };
}

/**
 * Instant, zero-input content for new couples: upcoming relationship milestones
 * derived purely from the anniversary date. Solves the cold-start "empty app"
 * problem — a couple that just paired immediately has things to look forward to.
 *
 * @param {string} anniversaryDate @param {Date} [now]
 * @param {{ maxDayMilestones?: number }} [options]
 * @returns {Array<{ id: string; title: string; date: string; type: string; nextDate: Date; isGenerated: true; milestoneValue: number }>}
 */
export function buildRelationshipMilestones(anniversaryDate, now = new Date(), { maxDayMilestones = 3 } = {}) {
  const start = parseStoredDateOnly(anniversaryDate);
  if (!start) return [];

  const milestones = [];
  const daysSoFar = daysTogetherFrom(start, now);

  // Upcoming day-count milestones (plus rolling round-thousands past the table).
  const marks = DAY_MILESTONES.filter((m) => m > daysSoFar);
  let rolling = 11000;
  while (marks.length < maxDayMilestones + DAY_MILESTONES.length && rolling <= daysSoFar + 4000) {
    if (rolling > daysSoFar) marks.push(rolling);
    rolling += 1000;
  }
  for (const mark of marks.slice(0, maxDayMilestones)) {
    const date = addDays(start, mark);
    milestones.push({
      id: `ms_day_${mark}`,
      title: `${mark.toLocaleString()} Days Together`,
      date: storedDateToInputValue(date),
      type: 'milestone',
      nextDate: date,
      isGenerated: true,
      milestoneValue: mark,
    });
  }

  // Next monthsary — the nearest reward for a brand-new couple. Skip year marks
  // (covered by the anniversary) and stop once the couple is well established.
  const monthsary = getNextMonthsary(start, now);
  if (monthsary && monthsary.monthsCount > 0 && monthsary.monthsCount <= MAX_MONTHSARY && monthsary.monthsCount % 12 !== 0) {
    const m = monthsary.monthsCount;
    milestones.push({
      id: `ms_month_${m}`,
      title: `${m} Month${m === 1 ? '' : 's'} Together`,
      date: storedDateToInputValue(monthsary.date),
      type: 'monthsary',
      nextDate: monthsary.date,
      isGenerated: true,
      milestoneValue: m,
    });
  }

  return milestones.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
}

/**
 * @param {{ dates: Array<{ id: string; title: string; date: string; type: string }>; anniversaryDate?: string; now?: Date; includeMilestones?: boolean }} options
 */
export function buildCountdownEvents({ dates, anniversaryDate = '', now = new Date(), includeMilestones = true }) {
  const savedEvents = dates
    .map((date) => {
      const nextDate = isAnnualType(date.type)
        ? getNextAnnualOccurrence(date.date, now)
        : parseStoredDateOnly(date.date);

      return nextDate ? { ...date, nextDate, isGenerated: false } : null;
    })
    .filter((event) => event && (isAnnualType(event.type) || calendarDayDifference(event.nextDate, now) >= 0));

  const anniversaryNextDate = getNextAnnualOccurrence(anniversaryDate, now);
  const generatedAnniversary = anniversaryNextDate
    ? [{
        id: 'anniv_main',
        title: 'Our Anniversary',
        date: anniversaryDate,
        type: 'anniversary',
        nextDate: anniversaryNextDate,
        isGenerated: true,
      }]
    : [];

  const milestones = includeMilestones ? buildRelationshipMilestones(anniversaryDate, now) : [];

  return [...savedEvents, ...generatedAnniversary, ...milestones]
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
}

/**
 * @param {{ nextDate: Date }} event
 * @param {Date} [now]
 */
export function getCountdownEventStatus(event, now = new Date()) {
  const days = daysUntilDate(event.nextDate, now);
  return days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'} to go`;
}
