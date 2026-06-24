import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Aura Board (MoodCalendar) and Aura Rewind views were removed once Daily
// Drop replaced them as the daily-return mechanic. The mood STORAGE layer lives
// on — partnerIntelligence, weeklyRecap, relationshipModel, our-story and
// heirlooms still read mood entries — so the storage-resilience guards below
// remain meaningful even though the views are gone.
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');
const cocoAppSource = readFileSync(new URL('../components/coco-pet/CocoApp.jsx', import.meta.url), 'utf8');
const cocoOverlaySource = readFileSync(new URL('../components/coco-pet/CocoPetOverlay.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');
const viewRegistrySource = readFileSync(new URL('../views/viewRegistry.tsx', import.meta.url), 'utf8');

assert.match(
  storageSource,
  /const normalizeMoodEntry = \(value: unknown\): MoodEntry \| null => \{[\s\S]*coerceIsoDate\(input\.timestamp\)[\s\S]*if \(!id \|\| !userId \|\| !mood \|\| !timestamp\) return null;/,
  'Expected mood entries to be normalized before storage or display.',
);

assert.match(
  storageSource,
  /getMoodEntries: \(\): MoodEntry\[\] => \{[\s\S]*try \{[\s\S]*normalizeMoodEntries\(JSON\.parse\(str\)\)[\s\S]*\} catch \{/,
  'Expected corrupt mood localStorage to fail closed instead of crashing mood-driven features.',
);

assert.match(
  storageSource,
  /saveMoodEntry: \(entry: MoodEntry[\s\S]*const normalized = normalizeMoodEntry\(sanitizeUserContent\(entry\)\);[\s\S]*if \(!normalized\) return;/,
  'Expected mood saves to reject malformed entries.',
);

// The Aura Board / Aura Rewind views were removed; the 'mood-calendar' and
// 'aura-rewind' routes must no longer be registered.
assert.doesNotMatch(
  viewRegistrySource,
  /'mood-calendar'|'aura-rewind'|MoodCalendar|AuraRewind/,
  'Expected the removed Aura Board / Aura Rewind views to be unregistered.',
);

// The old CouplePet page has been fully removed (components/CouplePet.tsx
// deleted); Home no longer references it — still asserted at the end of this file.

assert.match(
  cocoOverlaySource,
  /cocoPetCss\.replace[\s\S]*attachShadow\(\{ mode: 'open' \}\)/,
  'Expected supplied Coco CSS to run in Shadow DOM instead of leaking generic class names globally.',
);

assert.match(
  cocoOverlaySource,
  /:host\(\[data-coco-pet-page="true"\]\)[\s\S]*background: transparent;[\s\S]*:host\(\[data-coco-pet-page="true"\]\) \.screen[\s\S]*border-radius: 0;/,
  'Expected routed Coco pet page mode to remove modal backdrop and phone-card styling.',
);

assert.match(
  cocoOverlaySource,
  /setPortalTarget\(document\.body\)[\s\S]*if \(!portalTarget\) return;[\s\S]*\}, \[css, portalTarget\]\);[\s\S]*data-coco-pet-route-host="true"[\s\S]*createPortal\(host, portalTarget\)/,
  'Expected Coco pet to mount its full-screen host outside the app transition shell after the body portal exists.',
);

assert.match(
  cocoAppSource,
  /const STATE_KEY = 'lior_coco_pet_state_v1';[\s\S]*localStorage\.setItem\(STATE_KEY/,
  'Expected the new Coco pet page to persist its gameplay state locally.',
);

assert.match(
  viewRegistrySource,
  /'coco-pet': lazyNamedView\(\(\) => import\('\.\/CocoPetPage'\), 'CocoPetPage'\)/,
  'Expected Coco pet to be registered as a full app page.',
);

assert.match(
  homeSource,
  /setView\('coco-pet'\)/,
  'Expected Home pet button to navigate to the Coco pet page instead of opening a popup.',
);

assert.doesNotMatch(
  homeSource,
  /showPet|setShowPet|<CouplePet/,
  'Expected Home to stop rendering the pet as a local popup overlay.',
);
