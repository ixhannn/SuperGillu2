import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const rootFixesSource = read('styles/root-fixes.css');
const nativePolishSource = read('styles/native-polish.css');
const transitionEngineSource = read('utils/TransitionEngine.ts');
const layoutSource = read('components/Layout.tsx');
const appSource = read('App.tsx');
const onboardingCss = read('styles/onboarding.css');

assert.match(
  rootFixesSource,
  /--lior-ease-silk:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/,
  'Global motion tokens should expose the premium deceleration curve used by app-wide transitions.',
);

// Cached tab switches must NOT use an entrance opacity fade. The incoming and
// outgoing tabs are both fully-painted keep-alive trees; the outgoing one is
// hidden in the same commit, so fading the incoming up from opacity:0 left a
// blank first frame that flashed the bare ambient background on every tab
// return ("everything flickers when I switch screens"). Tabs now swap instantly;
// route push/pop keep their single container fade in `_run`.
assert.doesNotMatch(
  rootFixesSource,
  /\.keep-alive-shell\.is-active[\s\S]{0,200}animation:\s*keep-alive-tab-enter/,
  'Cached tab shells must not run a keep-alive-tab-enter opacity fade — it flashes the background on tab return. Tabs swap instantly.',
);

assert.doesNotMatch(
  rootFixesSource,
  /@keyframes\s+keep-alive-tab-enter/,
  'The keep-alive-tab-enter keyframe should be removed — cached tab switches are an instant swap, not an opacity fade.',
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

// The background depth-recede (.lior-ambient-world, set via html[data-nav-depth])
// animates the LIVE full-screen WebGL background on every page open/close. It
// MUST stay on opacity + transform only: an animated `filter: blur()` there is a
// non-compositor Gaussian recomputed every frame and was the real cause of the
// ~340ms open/close hitch on mid-range Android (regression fixed 2026-06-19).
// The @keyframes scan above misses it because the recede is a CSS *transition*.
const ambientWorldBlocks = [...rootFixesSource.matchAll(/\.lior-ambient-world[^{]*\{([^}]*)\}/g)];
assert.ok(
  ambientWorldBlocks.length >= 2,
  'Expected the .lior-ambient-world depth-recede rules to exist in root-fixes.css.',
);
for (const [, body] of ambientWorldBlocks) {
  assert.doesNotMatch(
    body,
    /\b(?:filter|backdrop-filter|blur)\b/,
    'The background depth-recede (.lior-ambient-world) must not use filter/blur — it composites over the live full-screen WebGL canvas, so a per-frame Gaussian hitches mid-range Android. Use opacity + transform only; blur a static snapshot if ever needed.',
  );
}

// Onboarding (styles/onboarding.css) renders frosted glass + a dust/constellation
// canvas + cloud/mist that drift continuously. STATIC blur on bounded glass is
// fine, but ANIMATED filter/backdrop-filter is the same ~340ms blur-jank hazard.
// Guard the two ways it could sneak in: @keyframes and CSS transitions.
const onbKeyframes = [...onboardingCss.matchAll(/@keyframes\s+([^{\s]+)\s*\{((?:[^{}]+|\{[^{}]*\})*)\}/g)];
assert.ok(
  onbKeyframes.length >= 3,
  'Expected the onboarding ambient keyframes (card float, icon breath, days pop) to be declared.',
);
for (const [, name, body] of onbKeyframes) {
  assert.doesNotMatch(
    body,
    /\b(?:filter|backdrop-filter|blur)\b/,
    `onboarding @keyframes ${name} must animate transform/opacity only — it runs over the live constellation canvas + frosted glass, so an animated blur would hitch mid-range Android.`,
  );
}
const onbTransitions = [...onboardingCss.matchAll(/transition:\s*([^;}]+)[;}]/g)];
for (const [, decl] of onbTransitions) {
  assert.doesNotMatch(
    decl,
    /\b(?:filter|backdrop-filter|all)\b/,
    `onboarding "transition: ${decl.trim()}" must not animate filter/backdrop-filter (or use "all", which can implicitly animate blur over the live canvas).`,
  );
}
