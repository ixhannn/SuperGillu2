import assert from 'node:assert/strict';

import {
  calendarDayDifference,
  countdownDateParts,
  dateInputValueToStoredDate,
  daysTogetherFrom,
  daysUntilDate,
  getNextAnnualOccurrence,
  parseStoredDateOnly,
  storedDateToInputValue,
} from '../shared/dateOnly.js';

const lateToday = new Date(2026, 3, 21, 23, 30, 0);
const tomorrow = new Date(2026, 3, 22, 0, 0, 0);

assert.equal(
  calendarDayDifference(tomorrow, lateToday),
  1,
  'Expected tomorrow to be 1 calendar day away even when less than 24 hours remain',
);

assert.equal(
  dateInputValueToStoredDate('2026-04-21'),
  '2026-04-21',
  'Expected date input values to be stored as date-only strings, not timezone-shifted ISO instants',
);

assert.equal(
  storedDateToInputValue('2026-04-21T00:00:00.000Z'),
  '2026-04-21',
  'Expected legacy ISO midnight dates to render as their intended calendar date',
);

assert.deepEqual(
  {
    year: parseStoredDateOnly('2026-04-21T00:00:00.000Z')?.getFullYear(),
    month: parseStoredDateOnly('2026-04-21T00:00:00.000Z')?.getMonth(),
    day: parseStoredDateOnly('2026-04-21T00:00:00.000Z')?.getDate(),
  },
  { year: 2026, month: 3, day: 21 },
  'Expected legacy ISO date strings to parse as local calendar dates without UTC day drift',
);

assert.equal(
  getNextAnnualOccurrence('2026-04-21', new Date(2026, 3, 21, 12, 0, 0)).getFullYear(),
  2026,
  'Expected an annual event happening today to stay on this year, not jump to next year after midnight',
);

assert.deepEqual(
  countdownDateParts(tomorrow, lateToday),
  { days: 1, hours: 0, minutes: 30, seconds: 0 },
  'Expected countdown day display to compare real local dates, not floor the remaining milliseconds to 0 days',
);

assert.equal(
  daysTogetherFrom('2026-04-20', lateToday),
  1,
  'Expected days together to compare the real local date with the input date',
);

assert.equal(
  daysTogetherFrom('2026-04-21', lateToday),
  0,
  'Expected same-day relationship age to be 0 completed calendar days',
);

assert.equal(
  daysUntilDate('2026-04-22', lateToday),
  1,
  'Expected countdown list days to compare target date with the real local date',
);

const homeSource = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8'));
assert.match(
  homeSource,
  /useEffect\(\(\) => \{[\s\S]*const start = countRef\.current;[\s\S]*const delta = target - start;/,
  'Expected Our Journey count-up to re-animate from the current displayed value whenever the real profile date changes',
);

const sourceChecks = [
  ['../views/Home.tsx', /daysTogetherFrom\(/],
  ['../views/OurRoom.tsx', /daysTogetherFrom\(/],
  ['../views/BonsaiBloom.tsx', /daysTogetherFrom\(/],
  ['../services/partnerIntelligence.ts', /daysTogetherFrom\(/],
  ['../services/relationshipModel.ts', /daysTogetherFrom\(/],
  ['../views/Countdowns.tsx', /daysUntilDate\(/],
  ['../views/SpecialDates.tsx', /daysUntilDate\(/],
];

for (const [path, pattern] of sourceChecks) {
  const source = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL(path, import.meta.url), 'utf8'));
  assert.match(source, pattern, `Expected ${path} to use the shared date-only helper instead of screen-local date math`);
}
