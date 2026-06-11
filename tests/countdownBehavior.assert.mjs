import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildCountdownEvents, getCountdownEventStatus } from '../shared/countdowns.js';

const savedDates = [
  { id: 'future-trip', title: 'Future Trip', date: '2026-05-12', type: 'other' },
  { id: 'past-trip', title: 'Past Trip', date: '2026-05-08', type: 'other' },
  { id: 'birthday', title: 'Birthday', date: '2020-05-08', type: 'birthday' },
];

const events = buildCountdownEvents({
  dates: savedDates,
  anniversaryDate: '2020-05-10',
  now: new Date(2026, 4, 9, 9, 0, 0),
  // This case verifies saved-date filtering/rolling; generated milestones are
  // covered separately in tests/unit/countdowns.test.ts.
  includeMilestones: false,
});

assert.deepEqual(
  events.map((event) => event.id),
  ['anniv_main', 'future-trip', 'birthday'],
  'Expected countdowns to exclude past one-time dates while rolling annual dates forward',
);

assert.equal(
  events.find((event) => event.id === 'birthday')?.nextDate.getFullYear(),
  2027,
  'Expected birthdays that already passed this year to roll to their next annual occurrence',
);

const todayEvent = buildCountdownEvents({
  dates: [{ id: 'today-plan', title: 'Today Plan', date: '2026-05-09', type: 'other' }],
  anniversaryDate: '',
  now: new Date(2026, 4, 9, 18, 30, 0),
})[0];

assert.equal(
  getCountdownEventStatus(todayEvent, new Date(2026, 4, 9, 18, 30, 0)),
  'Today',
  'Expected a countdown that reaches zero to read as Today for the rest of that calendar day',
);

const countdownsSource = readFileSync(new URL('../views/Countdowns.tsx', import.meta.url), 'utf8');
assert.match(
  countdownsSource,
  /deleteSpecialDate/,
  'Expected Countdowns to expose deletion directly instead of requiring a hidden swipe in Special Dates',
);
assert.match(
  countdownsSource,
  /Trash2/,
  'Expected Countdowns to render a visible delete affordance for saved countdowns',
);
