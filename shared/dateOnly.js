/**
 * @typedef {Date | string | undefined | null} DateOnlyInput
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;

const pad2 = (value) => String(value).padStart(2, '0');

const localDayNumber = (date) => (
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
);

/**
 * @param {DateOnlyInput} value
 * @returns {Date | null}
 */
export function parseStoredDateOnly(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value !== 'string' || !value.trim()) return null;

  const match = value.trim().match(DATE_ONLY_RE);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * @param {DateOnlyInput} value
 * @returns {string}
 */
export function storedDateToInputValue(value) {
  const parsed = parseStoredDateOnly(value);
  if (!parsed) return '';
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function dateInputValueToStoredDate(value) {
  const parsed = parseStoredDateOnly(value);
  return parsed ? storedDateToInputValue(value) : '';
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function todayInputValue(now = new Date()) {
  return storedDateToInputValue(now);
}

/**
 * @param {DateOnlyInput} target
 * @param {DateOnlyInput} [from]
 * @returns {number}
 */
export function calendarDayDifference(target, from = new Date()) {
  const targetDate = target instanceof Date ? target : parseStoredDateOnly(target);
  const fromDate = from instanceof Date ? from : parseStoredDateOnly(from);
  if (!targetDate || !fromDate) return 0;
  return localDayNumber(targetDate) - localDayNumber(fromDate);
}

/**
 * Relationship age is a local calendar-date comparison. A couple that started
 * today has been together for 0 completed days; tomorrow it becomes 1.
 *
 * @param {DateOnlyInput} startedAt
 * @param {DateOnlyInput} [from]
 * @returns {number}
 */
export function daysTogetherFrom(startedAt, from = new Date()) {
  const startedDate = parseStoredDateOnly(startedAt);
  const fromDate = from instanceof Date ? from : parseStoredDateOnly(from);
  if (!startedDate || !fromDate) return 0;
  return Math.max(0, calendarDayDifference(fromDate, startedDate));
}

/**
 * @param {DateOnlyInput} value
 * @param {DateOnlyInput} [from]
 * @returns {number}
 */
export function daysUntilDate(value, from = new Date()) {
  const targetDate = parseStoredDateOnly(value);
  const fromDate = from instanceof Date ? from : parseStoredDateOnly(from);
  if (!targetDate || !fromDate) return 0;
  return Math.max(0, calendarDayDifference(targetDate, fromDate));
}

/**
 * @param {DateOnlyInput} target
 * @param {Date} [from]
 * @returns {{ days: number; hours: number; minutes: number; seconds: number }}
 */
export function countdownDateParts(target, from = new Date()) {
  const targetDate = parseStoredDateOnly(target);
  if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = daysUntilDate(targetDate, from);
  const targetStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const remainingMs = Math.max(0, targetStart.getTime() - from.getTime());
  const secondsTotal = Math.floor(remainingMs / 1000);

  return {
    days,
    hours: Math.floor((secondsTotal % DAY_SECONDS) / 3600),
    minutes: Math.floor((secondsTotal % 3600) / 60),
    seconds: secondsTotal % 60,
  };
}

/**
 * @param {DateOnlyInput} value
 * @param {DateOnlyInput} [from]
 * @returns {Date | null}
 */
export function getNextAnnualOccurrence(value, from = new Date()) {
  const base = parseStoredDateOnly(value);
  const reference = from instanceof Date ? from : parseStoredDateOnly(from);
  if (!base || !reference) return null;

  const candidate = new Date(reference.getFullYear(), base.getMonth(), base.getDate());
  if (calendarDayDifference(candidate, reference) < 0) {
    candidate.setFullYear(reference.getFullYear() + 1);
  }
  return candidate;
}

/**
 * @param {DateOnlyInput} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {string | string[]} [locale]
 * @returns {string}
 */
export function formatStoredDate(value, options, locale) {
  const parsed = parseStoredDateOnly(value);
  return parsed ? parsed.toLocaleDateString(locale, options) : '';
}
