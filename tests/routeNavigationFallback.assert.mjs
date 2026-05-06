import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

assert.match(
  appSource,
  /const RouteFallback = \(\) => null;/,
  'Expected route-level Suspense to keep the current screen visible while lazy view modules load',
);

assert.match(
  appSource,
  /<Suspense fallback=\{<RouteFallback \/>\}>/,
  'Expected the main route Suspense boundary to avoid the full-screen startup loader',
);

