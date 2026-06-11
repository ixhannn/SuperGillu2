import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const openWhenSource = readFileSync(new URL('../views/OpenWhen.tsx', import.meta.url), 'utf8');

assert.match(
  openWhenSource,
  /Keepsake mailbox[\s\S]*Letters for the moments words matter/,
  'Expected Open When to use the new keepsake mailbox hero hierarchy.',
);

assert.match(
  openWhenSource,
  /Seal a letter[\s\S]*Pick the moment, then write what they need to hear/,
  'Expected the composer to feel like sealing a letter instead of a generic form.',
);

assert.ok(
  openWhenSource.includes('Waiting quietly for the exact moment.'),
  'Expected sealed envelope cards to explain their locked state clearly.',
);

assert.ok(
  openWhenSource.includes('Open when {momentText}'),
  'Expected envelope cards to keep the Open When prompt visible in the card title.',
);
