import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/LiveBackground.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(
  source,
  /animate-drift-/,
  'Expected LiveBackground to avoid continuously animating large fixed background layers',
);

assert.doesNotMatch(
  source,
  /filter:\s*['"]blur\(/,
  'Expected LiveBackground to avoid runtime blur filters on viewport-sized ambient layers',
);

assert.match(
  source,
  /radial-gradient/,
  'Expected LiveBackground to keep soft ambient depth through static radial gradients',
);

