import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const deferredSource = readFileSync(new URL('../components/DeferredOverlays.tsx', import.meta.url), 'utf8');

// Visuals are LOCKED to 'ultra' on every device — device-based downgrade of the
// background was intentionally removed (product decision). The heavy 3D blob is
// instead gated by the user's Settings toggle, with Home ALWAYS on. These
// assertions keep that toggle gating wired so it can't silently regress.
assert.match(
  ambientSource,
  /import\s+\{\s*AmbientPrefs\s*\}\s+from\s+['"]\.\.\/services\/ambientPrefs['"]/,
  'Expected AmbientVisuals to gate the heavy 3D blob on the user AmbientPrefs toggle (device gating was intentionally removed).',
);

assert.match(
  ambientSource,
  /const\s+show3D\s*=\s*isHomeRoute\s*\|\|\s*enabled3D/,
  'Expected AmbientVisuals to derive show3D from the Home route (always on) OR the user toggle.',
);

assert.match(
  ambientSource,
  /paused=\{effectivePaused\s*\|\|\s*!show3D\}/,
  'Expected the WebGL ambient layers to be paused when the 3D blob is toggled off, so it costs nothing off-Home.',
);

assert.match(
  deferredSource,
  /import\s+\{\s*shouldGateHeavyView\s*\}\s+from\s+['"]\.\.\/utils\/runtimeProfile['"]/,
  'Expected DeferredOverlays to use runtime profile gating before mounting decorative canvases',
);

assert.match(
  deferredSource,
  /if\s*\(\s*shouldGateHeavyView\(\)\s*\)\s*return;/,
  'Expected DeferredOverlays to skip idle-mounted decorative canvases on compact/native/low-power devices',
);
