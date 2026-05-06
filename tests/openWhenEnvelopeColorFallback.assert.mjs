import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const openWhenSource = readFileSync(new URL('../views/OpenWhen.tsx', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');

assert.ok(
  openWhenSource.includes('const getEnvelopeColorParts = (color?: string) => {'),
  'Expected OpenWhen to derive envelope color classes through a fallback helper',
);

assert.ok(
  openWhenSource.includes('getEnvelopeColorParts(env.color)'),
  'Expected OpenWhen cards to read envelope colors through the guarded helper',
);

assert.ok(
  storageSource.includes('const normalizeEnvelopeColor = (value: unknown): string =>'),
  'Expected storage to normalize legacy envelope colors before returning saved envelopes',
);

assert.ok(
  storageSource.includes("saveEnvelope: (e: Envelope) => StorageService._saveInternal('envelopes', CACHE_KEYS.ENVELOPES, normalizeEnvelope(e), undefined, 'envelopes')"),
  'Expected saveEnvelope to persist normalized envelope colors',
);
