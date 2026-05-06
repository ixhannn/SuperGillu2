import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const publicSwSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

assert.match(
  swSource,
  /const CACHE_NAME = 'lior-v6';/,
  'Expected the service worker cache version to roll forward after startup safety fixes',
);

assert.match(
  publicSwSource,
  /const CACHE_NAME = 'lior-v6';/,
  'Expected the built public service worker to use the current cache version',
);

assert.match(
  publicSwSource,
  /url\.hostname\.includes\('workers\.dev'\)/,
  'Expected media worker requests to bypass the service worker cache',
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
