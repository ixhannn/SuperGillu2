import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moodCalendarSource = readFileSync(new URL('../views/MoodCalendar.tsx', import.meta.url), 'utf8');
const auraRewindSource = readFileSync(new URL('../views/AuraRewind.tsx', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const petSource = readFileSync(new URL('../services/pet.ts', import.meta.url), 'utf8');
const couplePetSource = readFileSync(new URL('../components/CouplePet.tsx', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /const normalizeMoodEntry = \(value: unknown\): MoodEntry \| null => \{[\s\S]*coerceIsoDate\(input\.timestamp\)[\s\S]*if \(!id \|\| !userId \|\| !mood \|\| !timestamp\) return null;/,
  'Expected mood entries to be normalized before storage or display.',
);

assert.match(
  storageSource,
  /getMoodEntries: \(\): MoodEntry\[\] => \{[\s\S]*try \{[\s\S]*normalizeMoodEntries\(JSON\.parse\(str\)\)[\s\S]*\} catch \{/,
  'Expected corrupt mood localStorage to fail closed instead of crashing the Aura Board.',
);

assert.match(
  storageSource,
  /saveMoodEntry: \(entry: MoodEntry[\s\S]*const normalized = normalizeMoodEntry\(sanitizeUserContent\(entry\)\);[\s\S]*if \(!normalized\) return;/,
  'Expected mood saves to reject malformed entries.',
);

assert.match(
  moodCalendarSource,
  /const getMoodTheme = \(value\?: string \| null\)(?:: MoodTheme)? => moodThemes\[normalizeMoodKey\(value\)\] \|\| moodThemes\.default;/,
  'Expected Aura Board to use a fallback mood theme for unknown synced moods.',
);

assert.doesNotMatch(
  moodCalendarSource,
  /moodThemes\[myMood\.mood\]\.emoji|moodThemes\[partnerMood\.mood\]\.emoji/,
  'Aura Board must not directly dereference moodThemes for user-provided mood values.',
);

assert.match(
  moodCalendarSource,
  /const parseMoodDate = \(value: unknown\): Date \| null => \{[\s\S]*Number\.isFinite\(date\.getTime\(\)\)/,
  'Expected Aura Board calendar math to ignore invalid timestamps.',
);

assert.match(
  auraRewindSource,
  /const getMoodWeight = \(value\?: string \| null\): number => moodWeights\[normalizeMoodKey\(value\)\] \?\? moodWeights\.default;/,
  'Expected Aura Rewind to score unknown moods through a safe fallback.',
);

assert.match(
  auraRewindSource,
  /const myName = profile\.myName\?\.trim\(\) \|\| 'You';[\s\S]*const partnerName = profile\.partnerName\?\.trim\(\) \|\| 'Partner';/,
  'Expected Aura Rewind to render sensible names when profile data is incomplete.',
);

assert.match(
  auraRewindSource,
  /const parseMoodDate = \(value: unknown\): Date \| null => \{[\s\S]*Number\.isFinite\(date\.getTime\(\)\)/,
  'Expected Aura Rewind to ignore invalid timestamps.',
);

assert.doesNotMatch(
  petSource,
  /console\.error\("Pet AI Error:"/,
  'Optional pet dialogue network failures should not be reported as app-level crashes.',
);

assert.match(
  couplePetSource,
  /try \{[\s\S]*PetAIService\.generateDialogue[\s\S]*\} catch \{[\s\S]*\} finally \{[\s\S]*aiLoadingRef\.current = false;/,
  'Expected pet dialogue loading state to recover even if optional AI dialogue throws.',
);
