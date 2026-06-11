import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const rootFixesSource = read('styles/root-fixes.css');
const nativePolishSource = read('styles/native-polish.css');
const transitionEngineSource = read('utils/TransitionEngine.ts');
const layoutSource = read('components/Layout.tsx');
const appSource = read('App.tsx');

assert.match(
  rootFixesSource,
  /--lior-ease-silk:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/,
  'Global motion tokens should expose the premium deceleration curve used by app-wide transitions.',
);

assert.match(
  rootFixesSource,
  /@keyframes keep-alive-tab-enter[\s\S]*from \{ opacity: 0; \}[\s\S]*to\s+\{ opacity: 1; \}/,
  'Cached tab switches should use an opacity-only silk fade so heavy root tabs stay on the cheapest compositor path.',
);

assert.match(
  rootFixesSource,
  /\.keep-alive-shell\.is-active[\s\S]*animation:\s*keep-alive-tab-enter var\(--lior-motion-tab\) var\(--lior-ease-silk\) both;[\s\S]*will-change:\s*opacity;/,
  'Cached tab switches should use the global silk timing while only promoting opacity.',
);

assert.match(
  rootFixesSource,
  /\.keep-alive-shell\.is-cached[\s\S]*position:\s*absolute;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/,
  'Cached tab shells should stay warm off-flow instead of returning from display:none on every tab switch.',
);

assert.doesNotMatch(
  rootFixesSource,
  /\.keep-alive-shell\.is-cached[\s\S]*display:\s*none/,
  'Cached tab shells should not use display:none because it causes cold layout work on heavy tab returns.',
);

assert.match(
  appSource,
  /const T_KEEP_ALIVE_TAB\s*=\s*240[\s\S]*setCurrentView\(destination\);[\s\S]*transitionLockRef\.current = false;[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*finalizeNavigation\(navToken\);[\s\S]*\}, T_KEEP_ALIVE_TAB\)/,
  'Fast tab transitions should release the navigation lock immediately while keeping diagnostics aligned with the animation duration. The deferred finalize must be token-scoped so a stale timeout cannot unlock a later in-flight View Transition.',
);

assert.match(
  layoutSource,
  /data-lior-motion-veil="true"/,
  'Layout should include a zero-idle-cost transition sheen layer for big navigation moments.',
);

assert.match(
  rootFixesSource,
  /html\[data-transitioning="1"\]\s+\[data-lior-motion-veil="true"\][\s\S]*animation:\s*lior-motion-veil/,
  'The transition sheen should only animate while TransitionEngine marks a big navigation in progress.',
);

assert.match(
  rootFixesSource,
  /::view-transition-group\(root\)[\s\S]*isolation:\s*isolate/,
  'Native View Transitions should isolate root snapshots so richer page motion does not bleed into fixed chrome.',
);

assert.doesNotMatch(
  rootFixesSource + transitionEngineSource + nativePolishSource,
  /cubic-bezier\([^)]*1\.56|bounce|elastic/i,
  'App-wide transition and press motion should avoid bounce/elastic curves that feel less refined and can read as jitter.',
);

const navigationKeyframes = [
  ...rootFixesSource.matchAll(/@keyframes\s+(keep-alive[^{\s]*|lior-vt[^{\s]*|lior-motion[^{\s]*)\s*\{[\s\S]*?\n\}/g),
];

assert.ok(
  navigationKeyframes.length >= 8,
  'Expected tab, route, modal, and transition-sheen keyframes to be declared.',
);

for (const [block, name] of navigationKeyframes) {
  assert.doesNotMatch(
    block,
    /\b(?:height|width|top|left|margin|padding|filter|backdrop-filter)\b/,
    `${name} should stay on transform and opacity only for smooth compositor-thread animation.`,
  );
}
