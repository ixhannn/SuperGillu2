import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const capacitorSource = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const nativeShellSource = readFileSync(new URL('../services/nativeShell.ts', import.meta.url), 'utf8');
const notificationsSource = readFileSync(new URL('../services/notifications.ts', import.meta.url), 'utf8');
const hapticsSource = readFileSync(new URL('../services/haptics.ts', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
const ambientSource = readFileSync(new URL('../components/AmbientVisuals.tsx', import.meta.url), 'utf8');
const pullToRefreshSource = readFileSync(new URL('../components/PullToRefresh.tsx', import.meta.url), 'utf8');
const viewTransitionSource = readFileSync(new URL('../components/ViewTransition.tsx', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const polishCssSource = readFileSync(new URL('../styles/native-polish.css', import.meta.url), 'utf8');
const usSource = readFileSync(new URL('../views/Us.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../views/Home.tsx', import.meta.url), 'utf8');
const timelineSource = readFileSync(new URL('../views/MemoryTimeline.tsx', import.meta.url), 'utf8');
const androidStylesSource = readFileSync(new URL('../android/app/src/main/res/values/styles.xml', import.meta.url), 'utf8');
const androidColorsSource = readFileSync(new URL('../android/app/src/main/res/values/colors.xml', import.meta.url), 'utf8');
const mainActivitySource = readFileSync(new URL('../android/app/src/main/java/com/lior/app/MainActivity.java', import.meta.url), 'utf8');

assert.match(
  capacitorSource,
  /StatusBar:[\s\S]*style:\s*'LIGHT'[\s\S]*backgroundColor:\s*'#00000000'/,
  'Expected Capacitor to default to dark status-bar icons on the light native shell.',
);

assert.match(
  nativeShellSource,
  /theme === 'starry-night' \? Style\.Dark : Style\.Light/,
  'Expected runtime status-bar style mapping to use light icons only for the dark theme.',
);

assert.match(
  androidStylesSource,
  /android:statusBarColor">@android:color\/transparent/,
  'Expected Android themes to use a transparent status bar for edge-to-edge content.',
);

assert.match(
  androidStylesSource,
  /android:windowLightStatusBar">true/,
  'Expected Android themes to request dark status-bar icons on the light shell.',
);

assert.match(
  androidColorsSource,
  /<color name="colorPrimaryDark">#F8E7EC<\/color>/,
  'Expected the Android fallback status color to match the warm app background.',
);

assert.match(
  mainActivitySource,
  /setDecorFitsSystemWindows\(false\)[\s\S]*SYSTEM_UI_FLAG_LIGHT_STATUS_BAR/,
  'Expected MainActivity to opt into edge-to-edge layout with dark system-bar icons.',
);

assert.match(
  notificationsSource,
  /Capacitor\.isNativePlatform\(\)[\s\S]*getCapacitorPushNotifications/,
  'Expected push notification plugin access to be guarded to native Capacitor only, avoiding web-shell unhandled rejections.',
);

assert.doesNotMatch(
  indexSource,
  /Haptics\.tap\(\)/,
  'The global pointer-down path must not fire haptics while the user is scrolling over buttons.',
);

assert.match(
  indexSource,
  /pointermove[\s\S]*Math\.hypot[\s\S]*> 8[\s\S]*clearPressed/,
  'Expected global press state to cancel as soon as the gesture becomes a scroll.',
);

assert.match(
  hapticsSource,
  /_debounceMs = 140[\s\S]*_scrollSuppressMs = 220/,
  'Expected haptics to use a tight debounce plus scroll suppression.',
);

assert.match(
  hapticsSource,
  /touchmove[\s\S]*pointerdown[\s\S]*pointermove/,
  'Expected haptics to observe touch-scroll and pointer-drag gestures (pointer-aware) before firing interaction feedback.',
);

assert.match(
  hapticsSource,
  /async press\([\s\S]*?ImpactStyle\.Medium/,
  'Expected the standard button press to feel weighted (Medium) — a distinct tier above a Light row tap.',
);

assert.match(
  layoutSource,
  /const handleRipple = useCallback\(\(e: React\.MouseEvent[\s\S]*onClick=\{handleRipple\}/,
  'Expected global ripples to run on deliberate clicks, not pointer-down scroll starts.',
);

assert.match(
  ambientSource,
  /\[data-tier="css-only"\] \[data-lior-ambient-motion\][\s\S]*animation-iteration-count: infinite !important/,
  'Expected native CSS-only tier to keep the lightweight ambient motion layer alive.',
);

assert.match(
  indexSource,
  /import '\.\/styles\/native-polish\.css';/,
  'Expected native polish overrides to load after the main CSS.',
);

assert.match(
  polishCssSource,
  /\[data-pressing="true"\][\s\S]*scale\(0\.99\)/,
  'Expected press-state feedback to be restrained on touch devices.',
);

assert.match(
  usSource,
  /className="us-view min-h-screen pb-32"/,
  'Expected the Us page to expose a scoped hook for mobile header spacing.',
);

assert.match(
  polishCssSource,
  /\[data-native-shell="native"\] \.us-view \.vh-spacer[\s\S]*height: 4\.35rem/,
  'Expected the native Us header spacer to avoid excess empty space under the status bar.',
);

assert.doesNotMatch(
  viewTransitionSource,
  /transform:\s*'translateZ\(0\)'|backfaceVisibility/,
  'Fixed view headers must not live inside a transformed transition shell.',
);

assert.match(
  pullToRefreshSource,
  /closest<HTMLElement>\('\.lenis-wrapper'\)/,
  'Expected pull-to-refresh to read the real app scroll root instead of creating a nested scroller.',
);

assert.doesNotMatch(
  pullToRefreshSource,
  /overflow-y-auto|style=\{\{ y: pullHeight/,
  'Pull-to-refresh must not wrap pages in a transformed nested scroll layer.',
);

assert.doesNotMatch(
  timelineSource,
  /whileTap=\{\{ scale: 0\.97, rotate|whileHover=|autoPlay\s+loop|layout\s*$/m,
  'Journey cards should avoid scroll-triggered transform/layout work on mobile.',
);

assert.match(
  homeSource,
  /scrollRafRef[\s\S]*requestAnimationFrame[\s\S]*applyOverlay/,
  'Home scroll-linked header overlay should be rAF-throttled before writing styles.',
);

assert.doesNotMatch(
  homeSource,
  /setHeaderScrollTop/,
  'Home scroll-linked header state should avoid React state updates during scroll.',
);
