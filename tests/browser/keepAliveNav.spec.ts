import { expect, test, type Page } from '@playwright/test';

/**
 * Keep-alive navigation contract.
 *
 * Tab switches are CSS class flips over cached, permanently-mounted shells:
 *  - exactly ONE shell is active at any time
 *  - inactive shells are display:none + inert + aria-hidden
 *  - the float-in (`is-entering`) plays ONLY on bottom-nav tab switches and
 *    is removed when it finishes
 *  - pushing a non-tab view keeps the previous tab cached, and going back
 *    re-activates it without remounting
 *
 * These invariants are what keep tab taps landing on the next frame; if a
 * regression re-couples shell classes to React renders or re-mounts tabs,
 * this spec fails before users feel the lag.
 */

const shells = (page: Page) =>
  page.locator('[data-keep-alive-tab]:not([data-keep-alive-tab="__overlay__"])');

const activeShells = (page: Page) =>
  page.locator('[data-keep-alive-tab].is-active:not([data-keep-alive-tab="__overlay__"])');

test('tab switches flip cached shells with a single active tab', async ({ page }) => {
  await page.goto('/?e2e=1');

  const nav = page.locator('[data-tour-occluder="bottom-nav"]');
  await expect(nav).toBeVisible();
  await expect(activeShells(page)).toHaveCount(1);
  await expect(page.locator('[data-keep-alive-tab="home"]')).toHaveClass(/is-active/);

  // Switch to Us — its shell mounts and becomes the only active one.
  await nav.getByLabel('Us', { exact: true }).click();
  const usShell = page.locator('[data-keep-alive-tab="us"]');
  await expect(usShell).toHaveClass(/is-active/);
  await expect(activeShells(page)).toHaveCount(1);

  // The float-in is granted for tab switches and self-removes on animationend.
  await expect(usShell).not.toHaveClass(/is-entering/, { timeout: 5_000 });

  // Home stays mounted but hidden + inert + aria-hidden.
  const homeShell = page.locator('[data-keep-alive-tab="home"]');
  await expect(homeShell).toHaveClass(/is-cached/);
  await expect(homeShell).toHaveAttribute('aria-hidden', 'true');
  await expect(homeShell).toHaveAttribute('inert', '');
  await expect(homeShell).toHaveCSS('display', 'none');

  // Back to Home — instant flip, still exactly one active shell.
  await nav.getByLabel('Home', { exact: true }).click();
  await expect(homeShell).toHaveClass(/is-active/);
  await expect(usShell).toHaveClass(/is-cached/);
  await expect(activeShells(page)).toHaveCount(1);

  // Both tabs remain mounted — the whole point of the keep-alive cache.
  await expect(shells(page)).toHaveCount(2);
});

test('push and back preserve the cached tab without remounting', async ({ page }) => {
  await page.goto('/?e2e=1');

  // Push a non-tab view from Home.
  await page.getByRole('button', { name: /open cloud sync/i }).click();
  const overlay = page.locator('[data-keep-alive-tab="__overlay__"]');
  await expect(overlay).toBeVisible();

  // Home's shell is still in the DOM (cached), just hidden.
  const homeShell = page.locator('[data-keep-alive-tab="home"]');
  await expect(homeShell).toHaveClass(/is-cached/);

  // Go back — Home re-activates from cache; no overlay remains.
  await page.getByRole('button', { name: /go back/i }).click();
  await expect(homeShell).toHaveClass(/is-active/, { timeout: 5_000 });
  await expect(overlay).toHaveCount(0);
  await expect(activeShells(page)).toHaveCount(1);
});
