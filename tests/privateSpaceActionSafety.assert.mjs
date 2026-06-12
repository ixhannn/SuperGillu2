import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privateSpaceSource = readFileSync(new URL('../views/PrivateSpace.tsx', import.meta.url), 'utf8');
const bottomNavSource = readFileSync(new URL('../components/BottomNav.tsx', import.meta.url), 'utf8');

assert.ok(
  bottomNavSource.includes("currentView === 'private-space' && id === 'add-memory'"),
  'Expected the bottom nav add action to open Private Space composer contextually',
);

assert.ok(
  privateSpaceSource.includes("window.addEventListener('private-space:add', handlePrivateAdd)"),
  'Expected Private Space to listen for the contextual bottom-nav add event',
);

assert.ok(
  !privateSpaceSource.includes('quickActions.map'),
  'Expected Private Space to remove duplicate quick-action add paths from the main screen',
);

assert.ok(
  privateSpaceSource.includes('setDeleteCandidate(selected)'),
  'Expected Private Space delete to open a confirmation step before removal',
);

assert.ok(
  privateSpaceSource.includes('setPendingDelete(item)') && privateSpaceSource.includes('undoDelete'),
  'Expected Private Space delete to support a short undo window before final removal',
);

assert.ok(
  privateSpaceSource.includes('PrivacyLock.verifyPin') && privateSpaceSource.includes('<PinPad'),
  'Expected Private Space unlock to be gated behind real PIN verification',
);

assert.ok(
  !privateSpaceSource.includes('Tap to unlock'),
  'Expected the old tap-anywhere soft unlock to be removed',
);

assert.ok(
  privateSpaceSource.includes('Re-locks after a few minutes away'),
  'Expected Private Space to describe its relock behavior honestly',
);
