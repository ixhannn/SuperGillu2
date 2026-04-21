import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDailyMomentCountdown } from '../shared/mediaRetention.js';

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

assert.equal(unknownCountdown.state, 'unknown');
assert.equal(unknownCountdown.label, 'Expiring soon');
assert.equal(unknownCountdown.compactLabel, 'Soon');

const dailyMomentsView = readFileSync(new URL('../views/DailyMoments.tsx', import.meta.url), 'utf8');

assert.ok(
  dailyMomentsView.includes('getDailyMomentCountdown('),
  'Expected DailyMoments to use getDailyMomentCountdown() for timer labels',
);
