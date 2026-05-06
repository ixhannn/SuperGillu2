import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(
  layoutSource,
  /import\s+\{\s*LiveBackground3D\s*\}\s+from\s+['"]\.\/LiveBackground3D['"]/,
  'Expected Layout to avoid statically importing LiveBackground3D so Three.js is not on the cold-start path',
);

assert.doesNotMatch(
  layoutSource,
  /import\s+\{\s*FloatingHeartsScene\s*\}\s+from\s+['"]\.\/FloatingHeartsScene['"]/,
  'Expected Layout to avoid statically importing FloatingHeartsScene so react-three-fiber is not on the cold-start path',
);

assert.match(
  layoutSource,
  /<AmbientVisuals \/>/,
  'Expected Layout to route global ambient visuals through the lazy, profile-aware AmbientVisuals gate',
);

assert.doesNotMatch(
  layoutSource,
  /<AmbientVisuals[^>]*paused=/,
  'Expected Layout to avoid re-rendering the app shell by pushing transition pause state through AmbientVisuals props',
);
