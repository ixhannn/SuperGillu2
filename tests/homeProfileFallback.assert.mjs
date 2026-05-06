import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');

assert.match(
  homeSource,
  /myName: getDisplayName\(prof\.myName, 'You'\)/,
  'Expected the home view to fall back to a display-safe local name when profile identity is incomplete',
);

assert.match(
  homeSource,
  /partnerName: getDisplayName\(prof\.partnerName, 'Partner'\)/,
  'Expected the home view to fall back to a display-safe partner name when profile identity is incomplete',
);

assert.match(
  homeSource,
  /setDaysTogether\(daysTogetherFrom\(parsedAnniversary, now\)\);/,
  'Expected the home view to use the shared date-only helper so missing or invalid anniversary data resolves to 0',
);

assert.match(
  homeSource,
  /const anniv = getNextAnnualOccurrence\(anniversaryDate, now\);\s*if \(anniv\) \{/s,
  'Expected countdown generation to skip anniversary math when the stored anniversary date is invalid',
);
