import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');

assert.match(
  homeSource,
  /Send heartbeat[\s\S]*A soft pulse to them/,
  'Expected the heartbeat button to keep the restored two-line action copy.',
);
