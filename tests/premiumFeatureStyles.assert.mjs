import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = [
  readFileSync(new URL('../index.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../styles/premium-features.css', import.meta.url), 'utf8'),
].join('\n');

const requiredSelectors = [
  '.recap-view',
  '.recap-doc',
  '.recap-cover',
  '.recap-numbers',
  '.recap-mood',
  '.recap-highlight',
  '.recap-streak',
  '.recap-film',
  '.recap-insight',
  '.recap-share',
  '.dv-view',
  '.dv-today',
  '.dv-cycle',
  '.dv-strip',
  '.dv-past__card',
  '.dv-recorder',
  '.film-player',
];

for (const selector of requiredSelectors) {
  assert.ok(
    css.includes(selector),
    `Expected the app stylesheet bundle to define selector ${selector}`,
  );
}
