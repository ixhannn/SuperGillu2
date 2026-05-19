import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const live3dSource = readFileSync(new URL('../components/LiveBackground3D.tsx', import.meta.url), 'utf8');
const heartsSource = readFileSync(new URL('../components/FloatingHeartsScene.tsx', import.meta.url), 'utf8');
const transitionSource = readFileSync(new URL('../utils/TransitionEngine.ts', import.meta.url), 'utf8');

const tabTransitionStart = appSource.indexOf('const runTabTransition = useCallback');
const runNavigationStart = appSource.indexOf('const runNavigation = useCallback', tabTransitionStart);

assert.ok(tabTransitionStart >= 0, 'Expected App.tsx to define the fast tab transition path');
assert.ok(runNavigationStart > tabTransitionStart, 'Expected runNavigation to follow runTabTransition');

const tabTransitionBody = appSource.slice(tabTransitionStart, runNavigationStart);

assert.match(
  appSource,
  /const visibleMountedTabs = useMemo\(\(\) => \{[\s\S]*ROOT_TABS\.includes\(currentView\)[\s\S]*next\.add\(currentView\)/,
  'The active root tab should be rendered in the same commit as currentView to avoid a blank first frame before the keep-alive effect runs',
);

assert.doesNotMatch(
  tabTransitionBody,
  /dataset\.transitioning/,
  'Fast tab switches must not toggle data-transitioning because it pauses/restarts ambient visuals',
);

assert.match(
  transitionSource,
  /private _setTransitioning\(active: boolean\)/,
  'Push/modal navigation should keep the explicit heavy-transition throttle path',
);

assert.match(
  live3dSource,
  /const createSeededRandom = \(seed: number\)/,
  'LiveBackground3D should use local deterministic seeds for stable particle layout',
);

assert.doesNotMatch(
  live3dSource,
  /const rng = \(\(\) =>/,
  'LiveBackground3D must not use a module-level random generator that advances across remounts',
);

assert.match(
  live3dSource,
  /querySelector<HTMLElement>\('\.lenis-wrapper'\)[\s\S]*scrollRoot\.addEventListener\('scroll'/,
  'LiveBackground3D should track the app scroll root instead of window.scrollY so ambient parallax does not appear frozen inside the mobile shell',
);

assert.doesNotMatch(
  heartsSource,
  /Math\.random\(\)/,
  'FloatingHeartsScene dust placement should be deterministic across remounts',
);

assert.match(
  ambientSource,
  /data-testid="ambient-visuals-motion-fallback"/,
  'Compact/native devices should still get a lightweight mounted ambient motion layer when heavy WebGL is gated',
);

assert.match(
  ambientSource,
  /<AmbientMotionFallback paused=\{effectivePaused\} \/>[\s\S]*\{ambientStage !== 'fallback' &&/,
  'The lightweight ambient layer should stay mounted independently of the deferred heavy 3D scene',
);

assert.doesNotMatch(
  ambientSource,
  /useScrollPaused|scrollPaused|addEventListener\('scroll'[\s\S]*paused/,
  'Ambient visuals must not pause while scrolling; scroll should feel alive instead of freezing the background',
);
