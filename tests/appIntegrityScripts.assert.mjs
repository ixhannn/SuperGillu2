import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = pkg.scripts ?? {};

assert.match(
  scripts.build,
  /vite build && node scripts\/check-bundle-budget\.mjs/,
  'Expected npm run build to enforce the Capacitor bundle budget after Vite emits assets',
);

for (const requiredStep of [
  'npm run lint',
  'npm run test:unit',
  'npm test',
  'npm run typecheck',
  'npm run build',
  'npm run test:browser',
]) {
  assert.match(
    scripts.verify,
    new RegExp(requiredStep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `Expected npm run verify to include ${requiredStep}`,
  );
}

assert.equal(
  scripts.integrity,
  'npm run verify',
  'Expected npm run integrity to be the canonical app integrity gate',
);
