import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The per-view full-bleed surface registry was refactored out of
// components/Layout.tsx into views/viewSurfaces.ts (exported as VIEW_SURFACES,
// consumed via getViewSurface). Layout now paints the resolved surface on both
// the scroll wrapper and its bottom safe-area padding. These assertions track
// that current wiring; the behaviour under test (Private Space registers its
// own surface, the Us page stays transparent, and the surface covers both
// scroll layers) is unchanged.
const layoutSource = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
const surfacesSource = readFileSync(new URL('../views/viewSurfaces.ts', import.meta.url), 'utf8');
const usSource = readFileSync(new URL('../views/Us.tsx', import.meta.url), 'utf8');

assert.match(
  surfacesSource,
  /VIEW_SURFACES[\s\S]*'private-space': '#f1edf3'/,
  'Private Space should register its own scroll-shell surface color.',
);

assert.doesNotMatch(
  surfacesSource,
  /\bus:\s*'var\(--theme-bg-main\)'/,
  'The Us page scroll shell must stay transparent so native ambient motion is not covered on APK builds.',
);

assert.doesNotMatch(
  usSource,
  /className="us-view min-h-screen pb-32"\s+style=\{\{\s*background:\s*'var\(--theme-bg-main\)'\s*\}\}/,
  'The Us page root must not paint an opaque full-screen theme background over the ambient layer.',
);

assert.match(
  layoutSource,
  /const viewSurface = getViewSurface\(currentView\)/,
  'Layout should derive the active view surface from currentView via the shared registry helper.',
);

// `lenis-content`'s className is conditional (scrollLocked ? … : …), so match
// the class name in either a string literal or an expression — the invariant
// under test is that BOTH scroll layers paint `background: viewSurface`.
assert.match(
  layoutSource,
  /lenis-wrapper[\s\S]*background: viewSurface[\s\S]*lenis-content[\s\S]*background: viewSurface/,
  'The active view surface must cover both the scroll viewport and its bottom safe-area padding.',
);
