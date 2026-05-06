import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privateSpaceSource = readFileSync(new URL('../views/PrivateSpace.tsx', import.meta.url), 'utf8');

assert.ok(
  privateSpaceSource.includes('const bottomNavClearanceStyle: React.CSSProperties = {'),
  'Expected Private Space to reserve explicit clearance for the fixed bottom nav',
);

assert.ok(
  privateSpaceSource.includes("paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 20px) + 8rem)'"),
  'Expected Private Space bottom clearance to include safe-area inset and nav height',
);

assert.ok(
  privateSpaceSource.includes('Nothing sealed yet') && privateSpaceSource.includes('Seal your first item'),
  'Expected the empty state to stay compact enough to clear the mobile bottom nav',
);
