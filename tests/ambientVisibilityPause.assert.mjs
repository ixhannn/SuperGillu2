import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const layoutSource = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const policyUrl = new URL('../utils/ambientMotion.ts', import.meta.url);

assert.ok(
  existsSync(policyUrl),
  'Expected utils/ambientMotion.ts to define route-level ambient visibility rules',
);

const policySource = readFileSync(policyUrl, 'utf8');

assert.match(
  policySource,
  /AMBIENT_MOTION_PAUSED_VIEWS[\s\S]*'private-space'/,
  'Private space uses an opaque surface, so ambient motion should pause while it covers the background',
);

assert.match(
  policySource,
  /export const shouldPauseAmbientMotionForView/,
  'Expected a small route policy for deciding when decorative ambient motion is hidden',
);

assert.match(
  layoutSource,
  /shouldPauseAmbientMotionForView\(currentView\)/,
  'Layout should update the ambient pause policy from the active route',
);

assert.match(
  layoutSource,
  /dataset\.ambientMotionPaused/,
  'Layout should publish ambient route visibility through a document data attribute instead of prop-drilling render churn',
);

assert.match(
  ambientSource,
  /data-ambient-motion-paused/,
  'Ambient visuals should observe the document-level ambient pause attribute',
);

assert.match(
  ambientSource,
  /const effectivePaused = useAmbientMotionPaused\(paused\)/,
  'Ambient visuals should merge route visibility, page visibility, and explicit pause hints',
);

assert.match(
  ambientSource,
  /<AmbientMotionFallback paused=\{effectivePaused\} \/>[\s\S]*<LazyLiveBackground3D paused=\{effectivePaused[^}]*\}/,
  'The CSS and WebGL ambient layers should share the same effective pause state (the WebGL layer additionally pauses when the 3D blob is toggled off).',
);
