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
  /setDaysTogether\(parsedAnniversary \? differenceInDays\(now, start\) : 0\);/,
  'Expected the home view to guard the together counter when anniversary data is missing or invalid',
);

assert.match(
  homeSource,
  /if \(parsedAnniversary\) \{\s*const anniv = new Date\(parsedAnniversary\);/s,
  'Expected countdown generation to skip anniversary math when the stored anniversary date is invalid',
);
