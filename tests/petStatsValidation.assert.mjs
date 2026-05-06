import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const petCharacterSource = readFileSync(new URL('../components/PetCharacter.tsx', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /const PET_TYPE_VALUES = new Set\(\['dog', 'cat', 'bunny', 'bear'\]\);/,
  'Expected runtime pet type validation for legacy or corrupted pet stats.',
);

assert.match(
  storageSource,
  /const normalizePetStats = \(value: unknown\): PetStats => \{[\s\S]*PET_TYPE_VALUES\.has\(String\(input\.type\)\)[\s\S]*equipped: normalizePetEquipment\(input\.equipped\),/,
  'Expected pet stats to normalize type, inventory, equipment, and counters before rendering.',
);

assert.match(
  storageSource,
  /getPetStats:\s*\(\): PetStats => \{[\s\S]*return normalizePetStats\(JSON\.parse\(str\)\);[\s\S]*return normalizePetStats\(null\);/,
  'Expected getPetStats to return normalized defaults instead of raw persisted data.',
);

assert.match(
  storageSource,
  /savePetStats:\s*\(s: PetStats, source: 'user' \| 'sync' = 'user'\) => \{[\s\S]*const sanitizedStats = normalizePetStats\(sanitizeUserContent\(s\)\);/,
  'Expected savePetStats to write normalized pet stats so bad cloud/local data does not persist.',
);

assert.match(
  petCharacterSource,
  /const safeType = isPetType\(type\) \? type : 'bear';[\s\S]*const colors = PALETTES\[safeType\];[\s\S]*const BodySVG = BODY_MAP\[safeType\];/,
  'Expected PetCharacter to guard its runtime type before reading palette/style maps.',
);
