import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
const usSource = readFileSync(new URL('../views/Us.tsx', import.meta.url), 'utf8');

assert.match(
  layoutSource,
  /VIEW_SURFACES:[\s\S]*'private-space': '#f1edf3'/,
  'Private Space should register its own scroll-shell surface color.',
);

assert.doesNotMatch(
  layoutSource,
  /VIEW_SURFACES:[\s\S]*us: 'var\(--theme-bg-main\)'/,
  'The Us page scroll shell must stay transparent so native ambient motion is not covered on APK builds.',
);

assert.doesNotMatch(
  usSource,
  /className="us-view min-h-screen pb-32"\s+style=\{\{\s*background:\s*'var\(--theme-bg-main\)'\s*\}\}/,
  'The Us page root must not paint an opaque full-screen theme background over the ambient layer.',
);

assert.match(
  layoutSource,
  /const viewSurface = VIEW_SURFACES\[currentView\] \?\? 'transparent'/,
  'Layout should derive the active view surface from currentView.',
);

assert.match(
  layoutSource,
  /className="lenis-wrapper[\s\S]*background: viewSurface[\s\S]*className="lenis-content[\s\S]*background: viewSurface/,
  'The active view surface must cover both the scroll viewport and its bottom safe-area padding.',
);
