# Rollercoaster Tycoon Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lior feel significantly smoother on mobile and Capacitor without changing the visual design, layout, colors, copy, or interaction model.

**Architecture:** Treat performance as a product contract: visual snapshots lock the current UI, source-level assertions prevent hot-path regressions, and runtime work is moved behind frame-budgeted schedulers. The app keeps the same screens, animations, and styling, but expensive work is deferred, coalesced, chunked, or stopped when idle.

**Tech Stack:** React 19, Vite, TypeScript, Capacitor Android, Supabase, Playwright, existing assertion test runner, CSS containment, browser Performance APIs.

---

## Baseline From Current Build

Fresh `npm run build` baseline from 2026-05-09:

- `dist/assets/App-*.js`: 172.96 kB raw / 48.03 kB gzip.
- `dist/assets/index-*.js`: 180.10 kB raw / 57.11 kB gzip.
- `dist/assets/Sync-*.js`: 180.84 kB raw / 61.89 kB gzip.
- `dist/assets/supabase-*.js`: 162.37 kB raw / 41.49 kB gzip.
- `dist/assets/motion-*.js`: 135.39 kB raw / 44.50 kB gzip.
- `dist/assets/charts-*.js`: 331.51 kB raw / 98.96 kB gzip.
- `dist/assets/three.module-*.js`: 715.74 kB raw / 182.44 kB gzip.
- Largest source files on the smoothness path: `services/storage.ts` 2494 lines, `views/MoodCalendar.tsx` 1747 lines, `components/CoachmarkSystem.tsx` 1413 lines, `views/MemoryTimeline.tsx` 1274 lines, `views/Home.tsx` 1074 lines, `App.tsx` 855 lines.
- Critical existing bug-shaped hotspot: `utils/AnimationEngine.ts` starts a RAF loop at module load even when there are zero subscribers.

## Non-Negotiable Visual Contract

- No color, spacing, typography, nav shape, card styling, copy, route order, or feature removal.
- Optimizations may change when offscreen work loads, but not what the user sees when the screen is visible.
- Before touching runtime behavior, create Playwright snapshots of the current UI and run all optimization work against those snapshots.

## File Structure

- Create `tests/browser/visualParity.spec.ts`
  - Freezes animations and captures current mobile UI baselines for no-visual-change enforcement.

- Create `tests/rollercoasterPerformance.assert.mjs`
  - Source-level guardrails for scheduler usage, AnimationEngine idling, sync chunking, media coalescing, CSS containment, and haptic throttling.

- Create `utils/scheduler.ts`
  - Shared idle/paint/frame-budget scheduler so startup, sync, preload, and media work yield consistently.

- Modify `utils/AnimationEngine.ts`
  - Stop idle RAF loops. Start only when subscribers exist. Stop when the last subscriber unregisters.

- Modify `services/performance.ts`
  - Initialize runtime profile without forcing permanent ultra mode or waking the animation loop.

- Modify `App.tsx`
  - Use scheduler for route preloads, notification registration, and post-auth non-critical work.

- Modify `views/viewRegistry.tsx`
  - Add sequential frame-budgeted module preloading.

- Modify `services/sync.ts`
  - Delay initial cloud reconciliation until after first paint and process tables in frame-budgeted chunks.

- Modify `hooks/useLiorImage.ts`
  - Coalesce duplicate media reads, debounce storage-update retries, and avoid per-image retry timer storms.

- Modify `views/MemoryTimeline.tsx`, `views/DailyMoments.tsx`, `views/Home.tsx`
  - Add containment hooks and async image hints without changing layout or styling.

- Create `styles/performance.css`
  - Invisible CSS containment utilities.

- Modify `index.tsx`
  - Import `styles/performance.css` after existing style imports.

- Modify `services/haptics.ts` and `utils/feedback.ts`
  - Apply scroll suppression and sequence cooldowns to every haptic/audio path, not only basic taps.

- Create `services/frameHealth.ts`
  - Local-only long-task and frame-health diagnostics for proving smoothness work.

- Modify `services/diagnostics.ts`
  - Store frame-health events in the existing local diagnostics buffer.

- Modify `scripts/check-bundle-budget.mjs`
  - Add named budgets for hot chunks so future work cannot silently bloat startup.

---

### Task 1: Lock Current Visuals And Add Optimization Contract Tests

**Files:**
- Create: `tests/browser/visualParity.spec.ts`
- Create: `tests/rollercoasterPerformance.assert.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add visual parity browser test**

Create `tests/browser/visualParity.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

const freezeVisualMotion = async (page: Page) => {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
      [data-testid="ambient-visuals-3d"],
      canvas[aria-hidden="true"] {
        display: none !important;
      }
    `,
  });
};

const seedStableState = async (page: Page) => {
  await page.addInitScript(() => {
    const profile = {
      myName: 'Ishan',
      partnerName: 'Tulika',
      anniversaryDate: '2024-02-14',
      theme: 'rose',
    };
    localStorage.setItem('lior_identity', JSON.stringify({
      myName: profile.myName,
      partnerName: profile.partnerName,
    }));
    localStorage.setItem('lior_shared_profile', JSON.stringify(profile));
    localStorage.setItem('lior_onboarded', '1');
    localStorage.setItem('lior_memories', JSON.stringify([
      {
        id: 'visual-memory-1',
        text: 'A tiny baseline memory',
        date: '2026-04-20T10:00:00.000Z',
        mood: 'love',
        image: '',
      },
    ]));
    localStorage.setItem('lior_notes', JSON.stringify([
      {
        id: 'visual-note-1',
        title: 'Pocket note',
        content: 'Baseline note',
        date: '2026-04-20T10:00:00.000Z',
      },
    ]));
    localStorage.setItem('lior_private_space_items', JSON.stringify([
      {
        id: 'visual-private-1',
        kind: 'note',
        title: 'Sealed note',
        note: 'A stable private item',
        addedBy: 'Ishan',
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:00.000Z',
      },
    ]));
  });
};

const openStableView = async (page: Page, view: string) => {
  await seedStableState(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/?e2e=1&view=${view}`);
  await freezeVisualMotion(page);
  await page.locator('[data-tour-occluder="bottom-nav"]').waitFor({ state: 'visible' });
  if (view === 'private-space') {
    await page.getByRole('button', { name: /unlock private space/i }).click();
  }
  await page.waitForTimeout(250);
};

for (const view of ['home', 'us', 'timeline', 'daily-moments', 'private-space', 'sync']) {
  test(`visual parity: ${view}`, async ({ page }) => {
    await openStableView(page, view);
    await expect(page).toHaveScreenshot(`${view}-393.png`, {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: 0.006,
    });
  });
}
```

- [ ] **Step 2: Capture current snapshots before optimization**

Run:

```bash
npm run test:browser -- tests/browser/visualParity.spec.ts --update-snapshots
```

Expected: PASS and new snapshot files under `tests/browser/mobileRegression.spec.ts-snapshots` or `tests/browser/visualParity.spec.ts-snapshots`, depending on Playwright output naming.

- [ ] **Step 3: Add source-level optimization contract**

Create `tests/rollercoasterPerformance.assert.mjs`:

```js
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
const registrySource = read('views/viewRegistry.tsx');
const bundleBudgetSource = read('scripts/check-bundle-budget.mjs');
const indexSource = read('index.tsx');

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
  /preloadViewModulesSequential[\s\S]*scheduleIdleTask|preloadViewModulesSequential[\s\S]*yieldToMain/,
  'Route module preloading should be sequential and yield to the main thread.',
);

assert.match(
  appSource,
  /scheduleIdleTask[\s\S]*preloadViewModulesSequential/,
  'App route preloads should use the shared idle scheduler.',
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
  indexSource,
  /import ['"]\.\/styles\/performance\.css['"];/,
  'Performance CSS must load globally after existing app styles.',
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
```

- [ ] **Step 4: Add package script for visual parity**

Modify `package.json` scripts:

```json
"test:visual": "playwright test tests/browser/visualParity.spec.ts"
```

Keep the existing scripts unchanged.

- [ ] **Step 5: Run contract test and confirm expected failure**

Run:

```bash
npm test -- --runInBand
```

Expected: FAIL on missing `utils/scheduler.ts`, missing `styles/performance.css`, and hot-path assertions. This is the red phase.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/visualParity.spec.ts tests/rollercoasterPerformance.assert.mjs package.json
git add tests/browser/*-snapshots
git commit -m "test: lock visual parity and performance contracts"
```

---

### Task 2: Add Shared Scheduler Utilities

**Files:**
- Create: `utils/scheduler.ts`
- Test: `tests/rollercoasterPerformance.assert.mjs`

- [ ] **Step 1: Create scheduler implementation**

Create `utils/scheduler.ts`:

```ts
type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type CancelScheduledTask = () => void;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const afterNextPaint = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(resolve, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

export const yieldToMain = (): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

export const scheduleIdleTask = (
  task: () => void | Promise<void>,
  options: { timeout?: number; delay?: number } = {},
): CancelScheduledTask => {
  if (typeof window === 'undefined') return () => {};

  const win = window as IdleWindow;
  let cancelled = false;
  let idleId: number | null = null;
  let timerId: number | null = null;

  const run = () => {
    if (cancelled) return;
    void task();
  };

  const scheduleIdle = () => {
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(run, { timeout: options.timeout ?? 2000 });
      return;
    }
    timerId = window.setTimeout(run, options.timeout ?? 0);
  };

  if (options.delay && options.delay > 0) {
    timerId = window.setTimeout(scheduleIdle, options.delay);
  } else {
    scheduleIdle();
  }

  return () => {
    cancelled = true;
    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
    }
    if (timerId !== null) window.clearTimeout(timerId);
  };
};

export const runFrameBudgeted = async <T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void> | void,
  options: { budgetMs?: number; yieldEvery?: number } = {},
): Promise<void> => {
  const budgetMs = options.budgetMs ?? 8;
  const yieldEvery = options.yieldEvery ?? 1;
  let frameStartedAt = now();

  for (let index = 0; index < items.length; index += 1) {
    await worker(items[index], index);

    const spent = now() - frameStartedAt;
    const shouldYieldForBudget = spent >= budgetMs;
    const shouldYieldForCadence = yieldEvery > 0 && (index + 1) % yieldEvery === 0;

    if (shouldYieldForBudget || shouldYieldForCadence) {
      await yieldToMain();
      frameStartedAt = now();
    }
  }
};
```

- [ ] **Step 2: Run contract test**

Run:

```bash
npm test -- --runInBand
```

Expected: still FAIL, but no longer for missing `utils/scheduler.ts`.

- [ ] **Step 3: Commit**

```bash
git add utils/scheduler.ts tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: add shared frame budget scheduler"
```

---

### Task 3: Stop Idle RAF Work In AnimationEngine

**Files:**
- Modify: `utils/AnimationEngine.ts`
- Modify: `services/performance.ts`
- Test: `tests/rollercoasterPerformance.assert.mjs`

- [ ] **Step 1: Update AnimationEngine lifecycle**

In `utils/AnimationEngine.ts`, replace `unregister`, `setTier`, and the module boot block with:

```ts
  unregister(id: string): void {
    this.subs.delete(id);
    this.costs.delete(id);
    if (this.subs.size === 0) {
      this.stop();
    }
  }

  setTier(tier: QualityTier): void {
    if (this.tier === tier) {
      this._publishTier(tier);
      return;
    }
    this.tier = tier;
    this._publishTier(tier);
  }
```

At the bottom of `utils/AnimationEngine.ts`, delete:

```ts
// Boot the engine immediately so the CSS tier attribute is set before first paint
if (typeof document !== 'undefined') {
  AnimationEngine.start();
}
```

Keep this constructor behavior intact so CSS tier remains available without starting RAF:

```ts
  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.tier = 'ultra';
    }
  }
```

- [ ] **Step 2: Keep performance manager visual default unchanged**

In `services/performance.ts`, keep the visual tier at `ultra`, but do not wake the engine. Ensure `init()` ends with:

```ts
    AnimationEngine.setTier('ultra');
```

Do not call `AnimationEngine.start()` from `PerformanceManager`.

- [ ] **Step 3: Run assertion test**

Run:

```bash
npm test -- --runInBand
```

Expected: still FAIL on remaining scheduler/sync/media/haptics assertions, but AnimationEngine assertions should pass.

- [ ] **Step 4: Run visual parity**

Run:

```bash
npm run test:visual
```

Expected: PASS. The engine should start when real visual subscribers mount and remain visually identical.

- [ ] **Step 5: Commit**

```bash
git add utils/AnimationEngine.ts services/performance.ts tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: stop animation engine when idle"
```

---

### Task 4: Make Route Preloading Idle And Sequential

**Files:**
- Modify: `views/viewRegistry.tsx`
- Modify: `App.tsx`
- Test: `tests/rollercoasterPerformance.assert.mjs`

- [ ] **Step 1: Add sequential module preloading**

In `views/viewRegistry.tsx`, import `yieldToMain`:

```ts
import { yieldToMain } from '../utils/scheduler';
```

Add this export below `preloadViewModules`:

```ts
export const preloadViewModulesSequential = async (views: ViewState[]): Promise<void> => {
  const uniqueViews = filterPreloadableViews(views);
  for (const view of uniqueViews) {
    await preloadViewModule(view).catch(() => undefined);
    await yieldToMain();
  }
};
```

- [ ] **Step 2: Use idle scheduler in App route preload effect**

In `App.tsx`, update the imports:

```ts
import { scheduleIdleTask } from './utils/scheduler';
import { getViewComponent, isViewModuleLoaded, preloadViewModule, preloadViewModules, preloadViewModulesSequential } from './views/viewRegistry';
```

In the authenticated idle preload effect, replace direct `requestIdleCallback`/`setTimeout` management with:

```ts
    const cancelers: Array<() => void> = [];

    const scheduleIdlePreload = (views: ViewState[], timeout: number, delay: number) => {
      cancelers.push(scheduleIdleTask(() => {
        void preloadViewModulesSequential(views);
      }, { timeout, delay }));
    };

    scheduleIdlePreload(CORE_NAV_PRELOADS, 1600, 700);
    scheduleIdlePreload(SECONDARY_NAV_PRELOADS, 3200, 3600);

    return () => {
      cancelers.forEach((cancel) => cancel());
    };
```

Do not change `CORE_NAV_PRELOADS` or `SECONDARY_NAV_PRELOADS` in this task.

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- --runInBand
npm run test:visual
```

Expected: assertion suite still fails only on later tasks; visual parity passes.

- [ ] **Step 4: Commit**

```bash
git add App.tsx views/viewRegistry.tsx tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: preload routes through idle scheduler"
```

---

### Task 5: Defer And Chunk Cloud Reconciliation

**Files:**
- Modify: `services/sync.ts`
- Test: `tests/rollercoasterPerformance.assert.mjs`
- Test: `tests/browser/mobileRegression.spec.ts`

- [ ] **Step 1: Import scheduler helpers**

At the top of `services/sync.ts`, add:

```ts
import { runFrameBudgeted, scheduleIdleTask } from '../utils/scheduler';
```

- [ ] **Step 2: Add reconcile scheduler method**

Inside `SyncServiceClass`, near `reconcileInFlight`, add:

```ts
    private cancelInitialReconcile: (() => void) | null = null;

    private scheduleInitialReconcile() {
        this.cancelInitialReconcile?.();
        this.cancelInitialReconcile = scheduleIdleTask(() => {
            this.cancelInitialReconcile = null;
            void this.reconcileCloud();
        }, { timeout: 2400, delay: 650 });
    }
```

In `cleanupRealtimeState()`, add:

```ts
        this.cancelInitialReconcile?.();
        this.cancelInitialReconcile = null;
```

- [ ] **Step 3: Schedule initial reconcile instead of starting immediately**

In `init()`, replace:

```ts
        // Reconcile cloud with protection
        this.reconcileCloud();
```

with:

```ts
        // Reconcile cloud with protection after first paint settles.
        this.scheduleInitialReconcile();
```

- [ ] **Step 4: Chunk table reconciliation**

In `reconcileCloud()`, keep the current `tables`, `rowEnvelopeTables`, `localCollectionAccessors`, and `mediaPrefixes` declarations. Replace the `for (const table of tables) { ... }` loop with:

```ts
            await runFrameBudgeted(tables, async (table) => {
                try {
                    const getLocalItems = localCollectionAccessors[table];
                    const localItems = getLocalItems ? getLocalItems() : [];
                    for (const deletedId of getRemoteDeletedIdsToPurge(localItems, table, deletionLookup)) {
                        await StorageService.handleCloudDelete(table, deletedId);
                    }

                    const cloudItems = rowEnvelopeTables.has(table)
                        ? await SupabaseService.fetchAllRows(table)
                        : await SupabaseService.fetchAll(table);
                    if (cloudItems === null) return;

                    if (cloudItems.length === 0) {
                        await this.pushLocalTableToCloud(table, localItems, mediaPrefixes, deletionLookup);
                    } else {
                        await this.pullCloudTableToLocal(table, cloudItems, deletionLookup);
                    }
                } catch (tableError) {
                    console.warn(`Sync skipped for table ${table}:`, tableError);
                }
            }, { budgetMs: 8, yieldEvery: 1 });
```

Add these private methods below `reconcileCloud()` and move the existing push/pull logic into them exactly:

```ts
    private async pushLocalTableToCloud(
        table: string,
        localItems: any[],
        mediaPrefixes: Record<string, string>,
        deletionLookup: ReturnType<typeof createDeletionLookup>,
    ) {
        if (table === 'couple_profile') {
            const local = StorageService.getCoupleProfile();
            await SupabaseService.saveSingle(table, local);
            return;
        }
        if (table === 'pet_stats') {
            const local = StorageService.getPetStats();
            await SupabaseService.saveSingle(table, local);
            return;
        }
        if (table === 'together_music') {
            const local = await StorageService.getStoredTogetherMusicSource();
            const meta = StorageService.getTogetherMusicMetadata();
            if (!local) return;
            const needsMigration = local.startsWith('data:')
                || !(await MediaStorageService.isScopedToCurrentUser(local));
            if (needsMigration) {
                const payload = local.startsWith('data:')
                    ? local
                    : await MediaStorageService.downloadMedia(local);
                if (!payload) return;
                const path = await MediaStorageService.buildCustomPath('singleton', 'together-music', 'track', {
                    ownerUserId: meta?.ownerUserId,
                    timestamp: meta?.date,
                });
                const uploaded = await MediaStorageService.uploadMedia(payload, path);
                const verified = uploaded ? await MediaStorageService.probeR2Path(uploaded) : false;
                const cloudPayload = uploaded && verified === true
                    ? { music_url: uploaded, meta, ownerUserId: meta?.ownerUserId }
                    : { music_base64: payload, meta, ownerUserId: meta?.ownerUserId };
                await SupabaseService.saveSingle(table, cloudPayload);
                return;
            }
            await SupabaseService.saveSingle(table, { music_url: local, meta, ownerUserId: meta?.ownerUserId });
            return;
        }
        if (table === 'our_room_state') {
            const local = StorageService.getCoupleRoomState();
            await SupabaseService.saveSingle(table, local);
            return;
        }
        if (table === 'user_status') {
            const local = StorageService.getStatus();
            const profile = StorageService.getCoupleProfile();
            await SupabaseService.upsertItem(table, { id: profile.myName, ...local });
            return;
        }

        const uploadableItems = filterUploadableItems(localItems, table, deletionLookup, isDeletedLocally);
        for (const it of uploadableItems) {
            const toUpload = mediaPrefixes[table]
                ? await StorageService._getItemWithImages(it, mediaPrefixes[table])
                : it;
            await SupabaseService.upsertItem(table, toUpload);
        }
    }

    private async pullCloudTableToLocal(
        table: string,
        cloudItems: any[],
        deletionLookup: ReturnType<typeof createDeletionLookup>,
    ) {
        for (const item of cloudItems) {
            const logicalId = item?.data?.id || item?.id;
            if (logicalId && hasRecordedDeletion(deletionLookup, table, logicalId)) {
                await StorageService.handleCloudDelete(table, logicalId);
                await SupabaseService.deleteItem(table, logicalId);
                continue;
            }
            if (logicalId && isDeletedLocally(table, logicalId)) {
                await SupabaseService.deleteItem(table, logicalId);
                continue;
            }
            await StorageService.handleCloudUpdate(table, item);
            await this.backfillMissingCloudImagePayload(table, item?.data ?? item);
        }
    }
```

- [ ] **Step 5: Run sync-critical tests**

Run:

```bash
npm test -- --runInBand
npm run test:browser -- tests/browser/mobileRegression.spec.ts -g "offline mode|pairing hub"
```

Expected: PASS for pairing and offline flows. The full assertion suite may still fail until later tasks are finished.

- [ ] **Step 6: Run visual parity**

Run:

```bash
npm run test:visual
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/sync.ts tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: defer and chunk cloud reconciliation"
```

---

### Task 6: Coalesce Media Resolves And Remove Timer Storms

**Files:**
- Modify: `hooks/useLiorImage.ts`
- Test: `tests/rollercoasterPerformance.assert.mjs`
- Test: `tests/browser/mobileRegression.spec.ts`

- [ ] **Step 1: Add shared media request cache**

At the top of `hooks/useLiorImage.ts`, below imports, add:

```ts
const mediaRequestCache = new Map<string, Promise<string | null>>();
const mediaValueCache = new Map<string, string | null>();

const buildMediaKey = (mediaId?: string, fallbackData?: string, storagePath?: string) => (
    [mediaId || '', storagePath || '', fallbackData ? `fallback:${fallbackData.length}` : ''].join('|')
);

const resolveCachedMedia = async (mediaId?: string, fallbackData?: string, storagePath?: string) => {
    const key = buildMediaKey(mediaId, fallbackData, storagePath);
    if (mediaValueCache.has(key)) return mediaValueCache.get(key) ?? null;

    const existing = mediaRequestCache.get(key);
    if (existing) return existing;

    const request = StorageService.getImage(mediaId || '', fallbackData, storagePath)
        .then((value) => {
            mediaValueCache.set(key, value ?? null);
            return value ?? null;
        })
        .finally(() => {
            mediaRequestCache.delete(key);
        });

    mediaRequestCache.set(key, request);
    return request;
};
```

- [ ] **Step 2: Use cached resolver**

Replace both calls to:

```ts
StorageService.getImage(mediaId || '', fallbackData, storagePath)
```

with:

```ts
resolveCachedMedia(mediaId, fallbackData, storagePath)
```

- [ ] **Step 3: Replace per-instance retry timers with one debounced retry**

Delete the effect that declares:

```ts
const delays = [2000, 5000, 12000];
```

Add this effect in its place:

```ts
    useEffect(() => {
        if (!mediaId && !fallbackData && !storagePath) return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const retry = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                if (srcRef.current !== null) return;
                try {
                    const data = await resolveCachedMedia(mediaId, fallbackData, storagePath);
                    if (data) setSrc(data);
                } catch {
                    // Best-effort retry only.
                }
            }, 900);
        };

        storageEventTarget.addEventListener('storage-update', retry);
        return () => {
            if (timer) clearTimeout(timer);
            storageEventTarget.removeEventListener('storage-update', retry);
        };
    }, [mediaId, fallbackData, storagePath]);
```

- [ ] **Step 4: Invalidate cache on media error**

In `handleError`, before local fallback, add:

```ts
        mediaValueCache.delete(buildMediaKey(mediaId, fallbackData, storagePath));
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- --runInBand
npm run test:browser -- tests/browser/mobileRegression.spec.ts -g "daily moments|bottom nav"
npm run test:visual
```

Expected: visual parity passes and media upload browser flow still passes.

- [ ] **Step 6: Commit**

```bash
git add hooks/useLiorImage.ts tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: coalesce media resolution"
```

---

### Task 7: Add Invisible CSS Containment To Heavy Lists

**Files:**
- Create: `styles/performance.css`
- Modify: `index.tsx`
- Modify: `views/MemoryTimeline.tsx`
- Modify: `views/DailyMoments.tsx`
- Modify: `views/Home.tsx`
- Test: `tests/rollercoasterPerformance.assert.mjs`

- [ ] **Step 1: Add performance CSS**

Create `styles/performance.css`:

```css
.perf-list-item {
  content-visibility: auto;
  contain: layout paint style;
  contain-intrinsic-size: 320px;
}

.perf-card-shell {
  contain: layout paint style;
}

.perf-media {
  content-visibility: auto;
  contain: paint;
}

@supports not (content-visibility: auto) {
  .perf-list-item,
  .perf-media {
    contain: layout paint style;
  }
}
```

- [ ] **Step 2: Import performance CSS**

In `index.tsx`, after existing CSS imports, add:

```ts
import './styles/performance.css';
```

- [ ] **Step 3: Add containment hook to memory cards**

In `views/MemoryTimeline.tsx`, update the `MemoryCard` root `motion.div`:

```tsx
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, delay: staggerDelay, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { feedback.light(); onClick(); }}
            data-memory-card="true"
            data-perf-list-item="true"
            className="perf-list-item relative overflow-hidden cursor-pointer group"
```

- [ ] **Step 4: Add async image hints without changing markup shape**

In `views/Home.tsx` and `views/DailyMoments.tsx`, every non-critical `<img>` inside cards or previews should include:

```tsx
loading="lazy"
decoding="async"
```

Do not add these to logos or first-viewport brand assets that must paint immediately.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- --runInBand
npm run test:visual
npm run test:browser -- tests/browser/mobileRegression.spec.ts -g "primary mobile views"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add styles/performance.css index.tsx views/MemoryTimeline.tsx views/DailyMoments.tsx views/Home.tsx tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: add invisible list containment"
```

---

### Task 8: Tighten Haptics And Audio Feedback Budget

**Files:**
- Modify: `services/haptics.ts`
- Modify: `utils/feedback.ts`
- Test: `tests/rollercoasterPerformance.assert.mjs`
- Test: `tests/nativeMobilePolish.assert.mjs`

- [ ] **Step 1: Gate haptic sequences**

In `services/haptics.ts`, add this method after `_canFire`:

```ts
  private _canRunSequence(options: { allowDuringScroll?: boolean; cooldownMs?: number } = {}): boolean {
    const now = nowMs();
    const cooldownMs = options.cooldownMs ?? this._debounceMs;
    if (!options.allowDuringScroll && now - this._lastScrollLikeAt < this._scrollSuppressMs) return false;
    if (now - this._lastFiredAt < cooldownMs) return false;
    this._lastFiredAt = now;
    return true;
  }
```

- [ ] **Step 2: Apply the sequence gate**

Update these public methods so each starts with the matching gate:

```ts
  async success() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 180 })) return;
```

```ts
  async warning() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 180 })) return;
```

```ts
  async error() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 220 })) return;
```

```ts
  async toggleOn() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 160 })) return;
```

```ts
  async toggleOff() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 160 })) return;
```

```ts
  async heartbeat() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 360 })) return;
```

```ts
  async doubleBeat() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 900 })) return;
```

```ts
  async celebrate() {
    if (!this.enabled || !this._canRunSequence({ cooldownMs: 520 })) return;
```

```ts
  async longPressProgress(progress: number) {
    if (!this.enabled || !this._canRunSequence({ allowDuringScroll: true, cooldownMs: 120 })) return;
```

- [ ] **Step 3: Add audio cooldown**

In `utils/feedback.ts`, add fields to `FeedbackEngine`:

```ts
  private lastAudioAt = 0;
  private readonly audioDebounceMs = 70;
```

Add this method:

```ts
  private canPlayAudio(): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastAudioAt < this.audioDebounceMs) return false;
    this.lastAudioAt = now;
    return true;
  }
```

At the top of `playTone`, `playTick`, `playPop`, and `playSuccess`, use:

```ts
    if (!this.isEnabled || !this.canPlayAudio()) return;
```

- [ ] **Step 4: Run haptic tests**

Run:

```bash
npm test -- --runInBand
npm run typecheck:app
```

Expected: PASS for source assertions and TypeScript.

- [ ] **Step 5: Commit**

```bash
git add services/haptics.ts utils/feedback.ts tests/rollercoasterPerformance.assert.mjs tests/nativeMobilePolish.assert.mjs
git commit -m "perf: throttle haptic and audio feedback"
```

---

### Task 9: Add Local Frame Health Diagnostics

**Files:**
- Create: `services/frameHealth.ts`
- Modify: `services/diagnostics.ts`
- Modify: `App.tsx`
- Test: `tests/rollercoasterPerformance.assert.mjs`

- [ ] **Step 1: Create frame health service**

Create `services/frameHealth.ts`:

```ts
import { DiagnosticsService } from './diagnostics';

type PerfEntryWithDuration = PerformanceEntry & { duration: number };

class FrameHealthServiceClass {
  private started = false;
  private observer: PerformanceObserver | null = null;

  start() {
    if (this.started || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
    this.started = true;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerfEntryWithDuration[]) {
          if (entry.duration < 120) continue;
          DiagnosticsService.recordInfo('frame.longtask', 'Long main-thread task', {
            name: entry.name,
            durationMs: Math.round(entry.duration),
            startTimeMs: Math.round(entry.startTime),
          });
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this.observer = null;
    }
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.started = false;
  }
}

export const FrameHealthService = new FrameHealthServiceClass();
```

- [ ] **Step 2: Start diagnostics after app diagnostics**

In `App.tsx`, import:

```ts
import { FrameHealthService } from './services/frameHealth';
```

In the diagnostics startup effect:

```ts
  useEffect(() => {
    DiagnosticsService.start();
    FrameHealthService.start();
  }, []);
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- --runInBand
npm run typecheck:app
```

Expected: PASS after adding any source assertion for `FrameHealthService.start()`.

- [ ] **Step 4: Commit**

```bash
git add services/frameHealth.ts App.tsx tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: record local frame health"
```

---

### Task 10: Protect Hot Bundle Budgets

**Files:**
- Modify: `scripts/check-bundle-budget.mjs`
- Test: `npm run build`

- [ ] **Step 1: Add hot chunk budgets**

In `scripts/check-bundle-budget.mjs`, below `budgets`, add:

```js
const hotChunkBudgets = [
  { pattern: /^App-.*\.js$/, raw: 180 * kib, gzip: 52 * kib },
  { pattern: /^index-.*\.js$/, raw: 190 * kib, gzip: 60 * kib },
  { pattern: /^Sync-.*\.js$/, raw: 190 * kib, gzip: 64 * kib },
  { pattern: /^storage-.*\.js$/, raw: 100 * kib, gzip: 30 * kib },
  { pattern: /^supabase-.*\.js$/, raw: 170 * kib, gzip: 44 * kib },
];
```

Inside the asset loop, after generic budget checks, add:

```js
  for (const hotBudget of hotChunkBudgets) {
    if (!hotBudget.pattern.test(file)) continue;
    if (bytes.length > hotBudget.raw) {
      failures.push(`${file} hot raw ${formatKib(bytes.length)} exceeds ${formatKib(hotBudget.raw)}`);
    }
    if (gzipBytes.length > hotBudget.gzip) {
      failures.push(`${file} hot gzip ${formatKib(gzipBytes.length)} exceeds ${formatKib(hotBudget.gzip)}`);
    }
  }
```

- [ ] **Step 2: Run build budget**

Run:

```bash
npm run build
```

Expected: PASS. The current baseline should fit these budgets with a small margin.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-bundle-budget.mjs tests/rollercoasterPerformance.assert.mjs
git commit -m "perf: protect hot bundle budgets"
```

---

### Task 11: Add Browser Smoothness Regression

**Files:**
- Modify: `tests/browser/mobileRegression.spec.ts`

- [ ] **Step 1: Add long-task collector helper**

At the top of `tests/browser/mobileRegression.spec.ts`, after `expectNoHorizontalOverflow`, add:

```ts
const installLongTaskCollector = async (page: Page) => {
  await page.addInitScript(() => {
    window.__liorLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__liorLongTasks.push({
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      window.__liorLongTaskObserver = observer;
    } catch {
      window.__liorLongTasks = [];
    }
  });
};

const expectNoBadLongTasks = async (page: Page, maxDuration = 220) => {
  const tasks = await page.evaluate(() => window.__liorLongTasks ?? []);
  const bad = tasks.filter((task: { duration: number }) => task.duration > maxDuration);
  expect(bad).toEqual([]);
};
```

Add this global declaration near the top of the file:

```ts
declare global {
  interface Window {
    __liorLongTasks?: Array<{ name: string; duration: number; startTime: number }>;
    __liorLongTaskObserver?: PerformanceObserver;
  }
}
```

- [ ] **Step 2: Add smooth tab-switch test**

Append this test:

```ts
test('core tab switching avoids bad long tasks on mobile', async ({ page }) => {
  await installLongTaskCollector(page);
  await page.goto('/?e2e=1');

  const nav = page.locator('[data-tour-occluder="bottom-nav"]');
  await expect(nav).toBeVisible();

  await nav.getByLabel('Us').click();
  await expect(page.getByRole('heading', { name: 'Us', exact: true })).toBeVisible();

  await nav.getByLabel('Moments').click();
  await expect(page.getByText('Ephemeral Memories')).toBeVisible();

  await nav.getByLabel('Memories').click();
  await expect(page.getByRole('heading', { name: 'Our Journey', exact: true })).toBeVisible();

  await nav.getByLabel('Home').click();
  await expect(page.getByText(/days together/i)).toBeVisible({ timeout: 10_000 });

  await expectNoBadLongTasks(page, 220);
});
```

- [ ] **Step 3: Run browser regressions**

Run:

```bash
npm run test:browser
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/mobileRegression.spec.ts
git commit -m "test: guard mobile tab smoothness"
```

---

### Task 12: Final Verification And APK Build

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Run full web verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 2: Run visual parity**

Run:

```bash
npm run test:visual
```

Expected: PASS with no snapshot updates.

- [ ] **Step 3: Build web and sync Capacitor**

Run:

```bash
npm run build
npx cap sync android
```

Expected: both commands exit `0`.

- [ ] **Step 4: Build Android debug APK**

Run:

```bash
cd android
.\gradlew.bat assembleDebug
cd ..
```

Expected: `BUILD SUCCESSFUL` and APK at:

```text
C:\Users\Sameer\Downloads\Lior\android\app\build\outputs\apk\debug\app-debug.apk
```

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "perf: optimize mobile smoothness without visual changes"
```

Only commit the files touched by this plan. Do not stage unrelated dirty files already present in the repository.

---

## Self-Review

- Spec coverage: the plan optimizes startup, runtime animation, sync, media loading, haptics/audio, lists, diagnostics, bundle budgets, and browser smoothness while preserving visuals through snapshots.
- Placeholder scan: no task contains placeholder tokens or unspecified implementation work.
- Type consistency: scheduler APIs are `scheduleIdleTask`, `yieldToMain`, `runFrameBudgeted`, and `afterNextPaint`; later tasks use those exact names.
- Risk control: the visual parity test is created before runtime changes, so every later task must pass no-visual-change checks.
