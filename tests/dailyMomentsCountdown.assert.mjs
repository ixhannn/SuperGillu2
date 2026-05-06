import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDailyMomentCountdown, isDailyMomentExpired } from '../shared/mediaRetention.js';

const fallbackCountdown = getDailyMomentCountdown(
  {
    expiresAt: 'not-a-date',
    createdAt: '2026-04-18T10:00:00.000Z',
  },
  Date.parse('2026-04-18T11:30:00.000Z'),
);

assert.equal(fallbackCountdown.state, 'active');
assert.equal(fallbackCountdown.label, '22h 30m left');
assert.equal(fallbackCountdown.compactLabel, '22h 30m');

const unknownCountdown = getDailyMomentCountdown(
  {
    expiresAt: 'not-a-date',
    createdAt: 'also-not-a-date',
  },
  Date.parse('2026-04-18T11:30:00.000Z'),
);

assert.equal(unknownCountdown.state, 'expired');
assert.equal(unknownCountdown.label, 'Expired');
assert.equal(unknownCountdown.compactLabel, 'Expired');
assert.equal(
  isDailyMomentExpired({ expiresAt: 'not-a-date', createdAt: 'also-not-a-date' }, Date.parse('2026-04-18T11:30:00.000Z')),
  true,
);

const dailyMomentsView = readFileSync(new URL('../views/DailyMoments.tsx', import.meta.url), 'utf8');

assert.ok(
  dailyMomentsView.includes('getDailyMomentCountdown('),
  'Expected DailyMoments to use getDailyMomentCountdown() for timer labels',
);

assert.ok(
  dailyMomentsView.includes('scheduleNextExpirySweep'),
  'Expected DailyMoments to schedule a local sweep at the next expiry boundary',
);
