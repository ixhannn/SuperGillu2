import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const deferredSource = readFileSync(new URL('../components/DeferredOverlays.tsx', import.meta.url), 'utf8');

assert.match(
  ambientSource,
  /import\s+\{\s*isLowPowerDevice\s*\}\s+from\s+['"]\.\.\/utils\/runtimeProfile['"]/,
  'Expected AmbientVisuals to use low-power runtime gating before mounting decorative WebGL canvases',
);

assert.match(
  ambientSource,
  /if\s*\(\s*isLowPowerDevice\(\)\s*\)\s*return;/,
  'Expected AmbientVisuals to skip decorative WebGL canvases on genuinely low-power devices',
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
