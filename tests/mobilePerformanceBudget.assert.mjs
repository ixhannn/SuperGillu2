import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const viewHeaderSource = readFileSync(new URL('../components/ViewHeader.tsx', import.meta.url), 'utf8');

const readPreloadArray = (name) => {
  const match = appSource.match(new RegExp(`const\\s+${name}:\\s+ViewState\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(match, `Expected ${name} to be declared as a named preload budget`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
};

const corePreloads = readPreloadArray('CORE_NAV_PRELOADS');
const secondaryPreloads = readPreloadArray('SECONDARY_NAV_PRELOADS');
const idlePreloads = new Set([...corePreloads, ...secondaryPreloads]);

for (const heavyView of [
  'mood-calendar',
  'bonsai-bloom',
  'private-space',
  'time-capsule',
  'surprises',
  'daily-video',
  'weekly-recap',
  'our-room',
  'partner-intelligence',
  'daily-drop',
]) {
  assert.equal(
    idlePreloads.has(heavyView),
    false,
    `Expected ${heavyView} to stay off the authenticated idle-preload path`,
  );
}

assert.doesNotMatch(
  appSource,
  /COMMON_NAV_PRELOADS/,
  'Expected route preloading to use explicit tiered budgets, not one broad common preload list',
);

assert.doesNotMatch(
  appSource,
  /import\s+\{\s*WhatsNew\s*\}\s+from\s+['"]\.\/components\/WhatsNew['"]/,
  'Expected the release-notes surface to stay off the static App.tsx bundle',
);

assert.match(
  appSource,
  /React\.lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/WhatsNew['"]\)/,
  'Expected WhatsNew to load only when the delayed release-notes surface is shown',
);

assert.match(
  appSource,
  /scheduleIdlePreload\(CORE_NAV_PRELOADS[\s\S]*scheduleIdlePreload\(SECONDARY_NAV_PRELOADS/,
  'Expected App to preload core routes first and defer secondary routes separately',
);

assert.doesNotMatch(
  viewHeaderSource,
  /requestAnimationFrame\(tick\)|cancelAnimationFrame\(raf\)/,
  'Expected ViewHeader visibility detection to avoid a permanent RAF polling loop',
);

assert.match(
  viewHeaderSource,
  /ResizeObserver|MutationObserver/,
  'Expected ViewHeader visibility detection to use observer-driven updates',
);
