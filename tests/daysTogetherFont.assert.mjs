import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');

assert.match(
  homeSource,
  /const DAYS_TOGETHER_LEGACY_FONT_STYLE[\s\S]*"Outfit", "Playfair Display", Georgia, serif/,
  'Expected the Days Together card to keep the previous local font stack.',
);

assert.match(
  homeSource,
  /text-\[5\.5rem\][\s\S]*style=\{DAYS_TOGETHER_LEGACY_FONT_STYLE\}/,
  'Expected the large days counter to use the restored local font stack.',
);

assert.match(
  homeSource,
  /text-xl text-white\/50 italic[\s\S]*style=\{DAYS_TOGETHER_LEGACY_UNIT_STYLE\}/,
  'Expected the days unit label to use the restored local font stack.',
);

assert.match(
  homeSource,
  /text-3xl font-bold[\s\S]*style=\{DAYS_TOGETHER_LEGACY_FONT_STYLE\}/,
  'Expected the detailed duration state to use the restored local font stack.',
);
