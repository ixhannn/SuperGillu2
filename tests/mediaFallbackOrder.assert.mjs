import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageServiceSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');

assert.ok(
  storageServiceSource.includes('getMediaReferenceCandidates(storagePath?: string, cloudPayload?: string): string[]'),
  'Expected StorageService to build an ordered list of media reference candidates',
);

assert.ok(
  storageServiceSource.includes("const preserveLegacyImageRef = source === 'sync' && !!imageRef && imageRef !== toSaveMetadata.storagePath;"),
  'Expected sync saves to preserve legacy image refs when canonical storagePath is different',
);

assert.ok(
  storageServiceSource.includes("const preserveLegacyVideoRef = source === 'sync' && !!videoRef && videoRef !== toSaveMetadata.videoStoragePath;"),
  'Expected sync saves to preserve legacy video refs when canonical videoStoragePath is different',
);

assert.ok(
  storageServiceSource.includes('for (const candidate of referenceCandidates) {'),
  'Expected media reads to iterate through fallback candidates instead of trying only one path',
);
