import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const appSource = read('App.tsx');
const animationSource = read('utils/AnimationEngine.ts');
const syncSource = read('services/sync.ts');
const mediaHookSource = read('hooks/useLiorImage.ts');
const hapticsSource = read('services/haptics.ts');
const feedbackSource = read('utils/feedback.ts');
const timelineSource = read('views/MemoryTimeline.tsx');
const dailyMomentsSource = read('views/DailyMoments.tsx');
const usSource = read('views/Us.tsx');
const privateSpaceSource = read('views/PrivateSpace.tsx');
const registrySource = read('views/viewRegistry.tsx');
const bundleBudgetSource = read('scripts/check-bundle-budget.mjs');
const indexSource = read('index.tsx');
const viewHeaderSource = read('components/ViewHeader.tsx');
const layoutSource = read('components/Layout.tsx');
const schedulerSource = read('utils/scheduler.ts');
const ambientSource = read('components/AmbientVisuals.tsx');
const deferredOverlaySource = read('components/DeferredOverlays.tsx');
const cssBusSource = read('services/CSSAnimationBus.ts');
const floatingHeartsSource = read('components/FloatingHeartsScene.tsx');
const liveBackground3DSource = read('components/LiveBackground3D.tsx');
const roomScene3DSource = read('components/room/RoomScene3D.tsx');

assert.ok(
  existsSync(new URL('../utils/scheduler.ts', import.meta.url)),
  'Expected shared scheduler utilities for idle and frame-budgeted work.',
);

assert.ok(
  existsSync(new URL('../styles/performance.css', import.meta.url)),
  'Expected invisible CSS performance utilities.',
);

assert.doesNotMatch(
  animationSource,
  /AnimationEngine\.start\(\);\s*$/m,
  'AnimationEngine must not start a RAF loop at module load.',
);

assert.match(
  animationSource,
  /unregister\(id: string\)[\s\S]*if\s*\(this\.subs\.size === 0\)[\s\S]*this\.stop\(\)/,
  'AnimationEngine should stop when the last subscriber unregisters.',
);

assert.match(
  registrySource,
  /preloadViewModulesSequential[\s\S]*(scheduleIdleTask|yieldToMain)/,
  'Route module preloading should be sequential and yield to the main thread.',
);

assert.match(
  appSource,
  /scheduleIdleTask[\s\S]*preloadViewModulesSequential/,
  'App route preloads should use the shared idle scheduler.',
);

assert.match(
  appSource,
  /const KeepAliveTabContent = React\.memo[\s\S]*<TabView setView=\{setView\} \/>[\s\S]*<KeepAliveTabContent[\s\S]*tab=\{tab\}/,
  'Keep-alive tab children should be memo-isolated from active shell class changes so hidden screens do not re-render during tab switches.',
);

assert.match(
  appSource,
  /NavigationActionsContext[\s\S]*const navigationActionsValue = useMemo[\s\S]*<NavigationActionsContext\.Provider value=\{navigationActionsValue\}>/,
  'Navigation actions should live in a stable context so fixed headers do not re-render on every tab currentView change.',
);

assert.match(
  viewHeaderSource,
  /useNavigationActions[\s\S]*const \{ goBack \} = useNavigationActions\(\)/,
  'ViewHeader should consume stable navigation actions instead of the full currentView navigation context.',
);

assert.match(
  syncSource,
  /scheduleInitialReconcile[\s\S]*scheduleIdleTask/,
  'Initial cloud reconciliation should be scheduled after first paint instead of starting immediately.',
);

assert.match(
  syncSource,
  /runFrameBudgeted[\s\S]*tables/,
  'Cloud reconciliation should process tables through a frame-budgeted queue.',
);

assert.match(
  mediaHookSource,
  /const mediaRequestCache = new Map/,
  'Media hook should coalesce duplicate reads through a shared cache.',
);

assert.match(
  mediaHookSource,
  /if \(src !== null\) return;[\s\S]*storageEventTarget\.addEventListener\('storage-update', retry\)/,
  'Resolved media should remove its storage-update retry listener so large timelines do not keep hundreds of idle listeners alive.',
);

assert.doesNotMatch(
  mediaHookSource,
  /const delays = \[2000, 5000, 12000\]/,
  'Media hook must not create three retry timers for every image instance.',
);

assert.match(
  timelineSource,
  /data-perf-list-item="true"/,
  'Memory timeline cards should opt into invisible CSS containment.',
);

assert.match(
  timelineSource,
  /const MemoryCard = React\.memo\(MemoryCardBase\)[\s\S]*const CommentBubble = React\.memo\(CommentBubbleBase\)/,
  'Memory cards and comment bubbles should be memoized so modal/input state changes do not repaint the whole journey grid.',
);

assert.doesNotMatch(
  timelineSource,
  /onClick=\{\(\) => setSelectedMemory\(/,
  'Memory cards should receive stable open handlers instead of inline parent state setters that force card re-renders.',
);

assert.match(
  dailyMomentsSource,
  /const PhotoCard = React\.memo\(PhotoCardBase\)[\s\S]*const PhotoGridItem = React\.memo/,
  'Daily moment grid cards should be memoized so caption/comment typing cannot repaint every thumbnail.',
);

assert.match(
  dailyMomentsSource,
  /const CommentBubble = React\.memo\(CommentBubbleBase\)[\s\S]*const topLevelComments = useMemo[\s\S]*const repliesByParent = useMemo/,
  'Daily moment comments should keep stable memoized thread structure while typing.',
);

assert.doesNotMatch(
  dailyMomentsSource,
  /layoutId=\{`photo-\$\{photo\.id\}`\}|viewport=\{\{ once: false/,
  'Daily moment thumbnails should not run shared-layout measurement or replay viewport reveal animations while scrolling.',
);

assert.doesNotMatch(
  usSource + privateSpaceSource,
  /motion\.(?:div|button)[\s\S]{0,80}\slayout\b/,
  'Hot mobile grids should not use Framer layout measurement props that can flicker while items update.',
);

assert.match(
  indexSource,
  /import ['"]\.\/styles\/performance\.css['"];/,
  'Performance CSS must load globally after existing app styles.',
);

assert.doesNotMatch(
  indexSource,
  /services\/CSSAnimationBus/,
  'Unused CSSAnimationBus must not boot from index.tsx and wake the global RAF at app startup.',
);

assert.doesNotMatch(
  cssBusSource,
  /^AnimationEngine\.register\(\{/m,
  'CSSAnimationBus should be opt-in, not a module-load AnimationEngine subscriber.',
);

assert.doesNotMatch(
  layoutSource,
  /startBreathingRhythm\(\)/,
  'Layout should not start an unused root CSS-variable breathing RAF on every screen.',
);

assert.match(
  schedulerSource,
  /(scheduler\.yield|MessageChannel|isInputPending)/,
  'Shared scheduler should yield quickly when browser task-yield or pending-input primitives are available.',
);

assert.match(
  hapticsSource,
  /private _canRunSequence[\s\S]*_scrollSuppressMs/,
  'All haptic sequences should share scroll suppression and cooldown logic.',
);

assert.match(
  feedbackSource,
  /private lastAudioAt[\s\S]*audioDebounceMs/,
  'Audio feedback should have a tight cooldown to avoid cheap-feeling bursts.',
);

assert.match(
  bundleBudgetSource,
  /hotChunkBudgets[\s\S]*App[\s\S]*Sync[\s\S]*index/,
  'Bundle budget script should protect hot chunks by name.',
);

assert.match(
  appSource,
  /scheduleIdleTask\(\(\)\s*=>\s*\{[\s\S]*NotificationsService\.applySchedule[\s\S]*NotificationsService\.registerPushToken/,
  'Notification scheduling and push registration should run in an idle task after first paint.',
);

assert.doesNotMatch(
  appSource,
  /preloadViewModules\(/,
  'Navigation prefetch should use sequential yielding preloads, not parallel module parse bursts.',
);

assert.match(
  ambientSource,
  /ambientStage[\s\S]*scheduleIdleTask[\s\S]*setAmbientStage\('live-3d'\)[\s\S]*scheduleIdleTask[\s\S]*setAmbientStage\('hearts'\)/,
  'Ambient WebGL layers should mount in staged idle slices instead of parsing both heavy chunks together.',
);

assert.match(
  deferredOverlaySource,
  /scheduleIdleTask/,
  'Deferred decorative overlays should use the shared scheduler instead of a local idle/timer implementation.',
);

assert.match(
  floatingHeartsSource,
  /AnimationEngineFrameInvalidator[\s\S]*AnimationEngine\.register[\s\S]*invalidate\(\)/,
  'FloatingHeartsScene should be driven by AnimationEngine so R3F does not run a second independent RAF.',
);

assert.match(
  floatingHeartsSource,
  /frameloop="demand"/,
  'FloatingHeartsScene Canvas should render on AnimationEngine demand frames.',
);

assert.doesNotMatch(
  floatingHeartsSource,
  /frameloop=\{effectivePause \? 'never' : 'always'\}/,
  'FloatingHeartsScene must not use an always-running R3F frameloop.',
);

assert.match(
  roomScene3DSource,
  /RoomSceneInvalidator[\s\S]*AnimationEngine\.register[\s\S]*invalidate\(\)/,
  'RoomScene3D should be driven by AnimationEngine so the room does not create an independent R3F RAF.',
);

assert.match(
  roomScene3DSource,
  /frameloop="demand"/,
  'RoomScene3D Canvas should render on AnimationEngine demand frames.',
);

assert.match(
  roomScene3DSource,
  /propTextureCache/,
  'RoomScene3D should cache generated prop textures so repeated items do not rebuild canvases and GPU textures.',
);

assert.doesNotMatch(
  roomScene3DSource,
  /\.clone\(\)\.multiplyScalar/,
  'RoomScene3D animation ticks must not allocate cloned vectors every frame.',
);

assert.doesNotMatch(
  liveBackground3DSource,
  /setInterval\(\(\) => \{[\s\S]*AnimationEngine\.tier/,
  'LiveBackground3D should not keep a watchdog interval alive while the adaptive tier is locked.',
);
