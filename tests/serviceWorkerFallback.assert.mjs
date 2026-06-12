import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// public/sw.js is the single source of truth: index.tsx registers '/sw.js',
// which Vite serves from public/. (A drifting duplicate at the repo root was
// removed — do not reintroduce it.)
const publicSwSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

assert.match(
  publicSwSource,
  /const CACHE_NAME = 'lior-v6';/,
  'Expected the service worker cache version to roll forward after startup safety fixes',
);

assert.match(
  publicSwSource,
  /url\.hostname\.includes\('workers\.dev'\)/,
  'Expected media worker requests to bypass the service worker cache',
);

assert.match(
  publicSwSource,
  /return \(await caches\.match\(event\.request\)\) \|\| \(await caches\.match\('\/'\)\) \|\| Response\.error\(\);/,
  'Expected navigation requests to fall back to a real Response instead of leaving the app shell unresolved',
);

assert.match(
  publicSwSource,
  /return Response\.error\(\);/,
  'Expected uncached asset failures to return an explicit error response instead of resolving undefined',
);
