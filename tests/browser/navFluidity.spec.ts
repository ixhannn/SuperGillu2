import { expect, test, type Page } from '@playwright/test';

/**
 * Navigation fluidity contract.
 *
 * Pins the invariants that keep taps smooth (2026-07-02 nav-jank overhaul):
 *  - a navigation tap NEVER runs a large synchronous task in its own frame
 *    (commits are time-sliced via startTransition; the old flushSync commits
 *    blocked 61-142ms per tap even on desktop)
 *  - the engine's outgoing snapshot (.te-clone) is always removed and
 *    <html data-transitioning> always clears — no wedged transitions
 *  - the reveal is gated: the destination overlay only becomes visible with
 *    real painted content (never a half-mounted flash)
 *  - the transition container's inline style is fully restored after every
 *    navigation (a leftover transform kept a permanent full-screen composited
 *    layer and broke position:fixed descendants)
 *
 * If a regression re-couples commits to the tap frame or leaks transition
 * state, this fails before users feel the jank.
 */

const OVERLAY = '.keep-alive-shell.is-active[data-keep-alive-tab="__overlay__"]';

// Generous CI headroom: the pre-fix behavior measured 122ms on a fast desktop,
// so anything ≥150ms inside the tap window is a real regression, not noise.
const TAP_BLOCK_BUDGET_MS = 150;
const TAP_WINDOW_MS = 400;

const armLongTaskObserver = (page: Page) =>
  page.evaluate(() => {
    interface LT { start: number; dur: number }
    const w = window as unknown as { __lt: LT[] };
    w.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, dur: e.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask API unavailable — budget assertion degrades to a no-op below.
    }
  });

const tapBlockingTasks = (page: Page, tapAt: number) =>
  page.evaluate(
    ([t0, windowMs, budget]) => {
      const w = window as unknown as { __lt: { start: number; dur: number }[] };
      return (w.__lt ?? []).filter(
        (lt) => lt.start >= t0 - 50 && lt.start < t0 + windowMs && lt.dur >= budget,
      );
    },
    [tapAt, TAP_WINDOW_MS, TAP_BLOCK_BUDGET_MS] as const,
  );

const settled = async (page: Page) => {
  // Snapshot removed + transition flag cleared + container style restored.
  await expect(page.locator('.te-clone')).toHaveCount(0, { timeout: 8_000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-transitioning', '1', { timeout: 8_000 });
  const style = (await page.locator('[data-transition-shell="true"]').getAttribute('style')) ?? '';
  expect(style).not.toContain('visibility');
  expect(style).not.toContain('scale');
  expect(style).not.toContain('will-change');
};

test('tile open and back stay off the tap frame and always settle clean', async ({ page }) => {
  await page.goto('/?e2e=1');
  const activeHome = page.locator('.keep-alive-shell.is-active[data-keep-alive-tab="home"]');
  const tile = activeHome.locator('.bento-card, button', { hasText: 'Open When' }).first();
  await expect(tile).toBeVisible();

  // Warm-up open/back (untimed): the FIRST visit pays a one-time lazy-chunk
  // parse/compile on the main thread, which is not the regression this spec
  // pins (the old flushSync commit blocked EVERY tap, warm or cold). Measure
  // the warm path.
  await tile.click();
  await expect(page.locator('html')).toHaveAttribute('data-route', 'open-when', { timeout: 8_000 });
  await page.locator('[data-tour-occluder="bottom-nav"]').getByLabel('Home', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-route', 'home', { timeout: 8_000 });
  await expect(page.locator('.te-clone')).toHaveCount(0, { timeout: 8_000 });

  await armLongTaskObserver(page);

  // ── OPEN (warm) ───────────────────────────────────────────────────────────
  const openAt = await page.evaluate(() => performance.now());
  await tile.click();

  // Reveal is gated: overlay becomes visible only as the active layer.
  await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('html')).toHaveAttribute('data-route', 'open-when', { timeout: 8_000 });
  await settled(page);

  const openBlockers = await tapBlockingTasks(page, openAt);
  expect(openBlockers, `tap-frame blocking tasks on OPEN: ${JSON.stringify(openBlockers)}`).toEqual([]);

  // ── BACK ──────────────────────────────────────────────────────────────────
  const backAt = await page.evaluate(() => performance.now());
  await page.locator('[data-tour-occluder="bottom-nav"]').getByLabel('Home', { exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute('data-route', 'home', { timeout: 8_000 });
  await expect(page.locator('.keep-alive-shell.is-active[data-keep-alive-tab="home"]')).toBeVisible();
  await settled(page);

  const backBlockers = await tapBlockingTasks(page, backAt);
  expect(backBlockers, `tap-frame blocking tasks on BACK: ${JSON.stringify(backBlockers)}`).toEqual([]);
});

test('rapid open-back-open sequence never wedges the engine', async ({ page }) => {
  await page.goto('/?e2e=1');
  const nav = page.locator('[data-tour-occluder="bottom-nav"]');
  const activeHome = page.locator('.keep-alive-shell.is-active[data-keep-alive-tab="home"]');
  const tile = activeHome.locator('.bento-card, button', { hasText: 'Open When' }).first();
  await expect(tile).toBeVisible();

  // Tap back-out faster than the open transition completes — the queued nav
  // must replay and land on home, never leave the engine locked.
  await tile.click();
  await page.waitForTimeout(120);
  await nav.getByLabel('Home', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-route', 'home', { timeout: 10_000 });

  // A follow-on open must still work after the rapid sequence. This test
  // guards ENGINE state (not the pointer pipeline — the first test covers real
  // clicks), and the tile sits in a below-fold content-visibility section
  // whose re-renders flake Playwright's actionability checks — so dispatch the
  // click in-page once the tile exists.
  await expect(activeHome.locator('.bento-card, button', { hasText: 'Dinner?' }).first()).toBeAttached();
  await page.evaluate(() => {
    const shell = document.querySelector('.keep-alive-shell.is-active[data-keep-alive-tab="home"]');
    const el = [...(shell?.querySelectorAll('.bento-card, button') ?? [])]
      .find((n) => n.textContent && n.textContent.includes('Dinner?')) as HTMLElement | undefined;
    el?.click();
  });
  await expect(page.locator('html')).toHaveAttribute('data-route', 'dinner-decider', { timeout: 10_000 });

  // Whatever happened in between, the engine must settle completely.
  await expect(page.locator('.te-clone')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-transitioning', '1', { timeout: 10_000 });
});
