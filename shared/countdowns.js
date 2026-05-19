import {
  calendarDayDifference,
  daysUntilDate,
  getNextAnnualOccurrence,
  parseStoredDateOnly,
} from './dateOnly.js';

const isAnnualType = (type) => type === 'anniversary' || type === 'birthday';

/**
 * @param {{ dates: Array<{ id: string; title: string; date: string; type: string }>; anniversaryDate?: string; now?: Date }} options
 */
export function buildCountdownEvents({ dates, anniversaryDate = '', now = new Date() }) {
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

  return [...savedEvents, ...generatedAnniversary]
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
