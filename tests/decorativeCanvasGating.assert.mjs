import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── Contract: identical visuals on every device class ──────────────────────
// Previously we gated decorative WebGL / canvas overlays off for low-power
// phones to protect the frame budget. That produced two different-looking
// apps. The current contract is: every device renders the same scene; cost
// is held via per-tier frame stride and DPR inside each subscriber, never
// by hiding the visual element.

const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const deferredSource = readFileSync(new URL('../components/DeferredOverlays.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(
  ambientSource,
  /shouldGateHeavyView/,
  'AmbientVisuals must not gate the decorative WebGL scene on device tier — every device sees the same visual',
);

assert.doesNotMatch(
  deferredSource,
  /shouldGateHeavyView/,
  'DeferredOverlays must not gate decorative canvases on device tier — every device sees the same overlays',
);
