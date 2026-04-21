import assert from 'node:assert/strict';

import {
  appendCoachmarkMetric,
  buildCoachmarkPreloadViews,
  summarizeCoachmarkMetrics,
} from '../services/coachmarkInsights.js';

const preloadViews = buildCoachmarkPreloadViews(
  {
    actionView: 'add-memory',
    route: 'home',
  },
  [
    { actionView: 'daily-moments', route: 'daily-moments' },
    { actionView: 'daily-moments', route: 'daily-moments' },
    { route: 'home' },
  ],
  'home',
);

assert.deepEqual(preloadViews, ['add-memory', 'daily-moments']);

const trimmed = appendCoachmarkMetric([
  { type: 'step_shown', key: 'a', at: 1 },
  { type: 'step_shown', key: 'b', at: 2 },
], { type: 'step_shown', key: 'c', at: 3 }, 2);

assert.deepEqual(trimmed, [
  { type: 'step_shown', key: 'b', at: 2 },
  { type: 'step_shown', key: 'c', at: 3 },
]);

const summary = summarizeCoachmarkMetrics([
  { type: 'step_shown', key: 'center-fab', at: 10 },
  { type: 'step_skipped', key: 'center-fab', at: 12 },
  { type: 'step_action_clicked', key: 'daily-moments', at: 14 },
  { type: 'fallback_card', key: 'countdowns', at: 16, reason: 'occluded' },
  { type: 'occlusion_failure', key: 'countdowns', at: 18 },
  { type: 'route_wait', key: 'aura-signal', at: 20, durationMs: 480 },
  { type: 'advance_complete', key: 'daily-moments', at: 22, durationMs: 190 },
], 300);

assert.equal(summary.shown, 1);
assert.equal(summary.skipped, 1);
assert.equal(summary.actions, 1);
assert.equal(summary.fallbacks, 1);
assert.equal(summary.occlusionFailures, 1);
assert.equal(summary.slowRouteWaits, 1);
assert.equal(summary.averageAdvanceMs, 190);
