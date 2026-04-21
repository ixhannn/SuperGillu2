import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

assert.match(
  swSource,
  /const CACHE_NAME = 'lior-v5';/,
  'Expected the service worker cache version to roll forward after startup safety fixes',
);

assert.match(
  swSource,
  /return \(await caches\.match\(event\.request\)\) \|\| \(await caches\.match\('\/'\)\) \|\| Response\.error\(\);/,
  'Expected navigation requests to fall back to a real Response instead of leaving the app shell unresolved',
);

assert.match(
  swSource,
  /return Response\.error\(\);/,
  'Expected uncached asset failures to return an explicit error response instead of resolving undefined',
);
