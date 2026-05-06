import { expect, test, type Page } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lCk6vAAAAABJRU5ErkJggg==',
  'base64',
);

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    errors.push(`${location.url}:${location.lineNumber}:${location.columnNumber} ${message.text()}`);
  });
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

const expectNoHorizontalOverflow = async (page: Page) => {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
};

test('bottom nav switches between core mobile tabs', async ({ page }) => {
  await page.goto('/?e2e=1');

  const nav = page.locator('[data-tour-occluder="bottom-nav"]');
  await expect(nav).toBeVisible();

  await nav.getByLabel('Moments').click();
  await expect(page.getByText('Ephemeral Memories')).toBeVisible();

  await nav.getByLabel('Memories').click();
  await expect(page.getByRole('heading', { name: 'Our Journey', exact: true })).toBeVisible();
});

test('daily moments exposes a share action after choosing a photo', async ({ page }) => {
  await page.goto('/?e2e=1&view=daily-moments');

  await expect(page.getByLabel('Share a photo moment')).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByLabel('Share a photo moment').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'moment.png', mimeType: 'image/png', buffer: tinyPng });

  await expect(page.getByText('Post Moment')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /share moment/i })).toBeVisible();

  await page.getByPlaceholder('Add a caption...').fill('Tiny regression moment');
  await page.getByRole('button', { name: /share moment/i }).click();

  await expect(page.getByText('Tiny regression moment')).toBeVisible({ timeout: 10_000 });
});

test('private space delete requires confirmation and can be undone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lior_private_space_items', JSON.stringify([
      {
        id: 'private-note-1',
        kind: 'note',
        title: 'Pocket note',
        note: 'Keep this until undo proves itself.',
        addedBy: 'Alex',
        createdAt: '2026-04-23T08:00:00.000Z',
        updatedAt: '2026-04-23T08:00:00.000Z',
      },
    ]));
  });

  await page.goto('/?e2e=1&view=private-space');
  await page.getByRole('button', { name: /unlock private space/i }).click();

  const privateItemCard = page.getByRole('button', { name: /keep this until undo proves/i });
  await privateItemCard.click();
  await page.getByRole('button', { name: /delete from private space/i }).click();
  await expect(page.getByRole('dialog', { name: /delete this private item/i })).toBeVisible();

  await page.getByRole('button', { name: /^delete$/i }).click();
  await expect(page.getByText('Removed Pocket note')).toBeVisible();
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();

  await page.getByRole('button', { name: /undo/i }).click();
  await expect(privateItemCard).toBeVisible();
});

test('offline mode is visible without blocking local interaction', async ({ page, context }) => {
  await page.goto('/?e2e=1');
  await expect(page.getByText('Our Journey')).toBeVisible({ timeout: 15_000 });

  await context.setOffline(true);
  await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/stay on this device/i)).toBeVisible();

  await context.setOffline(false);
});

test('primary mobile views fit 360, 393, and 430px widths without horizontal overflow', async ({ page }) => {
  const widths = [360, 393, 430];
  const views = ['home', 'daily-moments', 'add-memory', 'private-space', 'sync', 'partner-intelligence'];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });

    for (const view of views) {
      await page.goto(`/?e2e=1&view=${view}`);
      if (view === 'private-space') {
        await page.getByRole('button', { name: /unlock private space/i }).click();
      }
      await page.locator('[data-tour-occluder="bottom-nav"]').waitFor({ state: 'visible' });
      await expectNoHorizontalOverflow(page);
    }
  }
});

test('private space empty state clears the bottom nav on mobile', async ({ page }) => {
  await page.goto('/?e2e=1&view=private-space');

  await page.getByRole('button', { name: /unlock private space/i }).click();

  const emptyState = page.getByText('Nothing sealed yet');
  const nav = page.locator('[data-tour-occluder="bottom-nav"]');

  await expect(emptyState).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Seal your first item')).toBeVisible({ timeout: 10_000 });
  await expect(nav).toBeVisible();

  const emptyBox = await emptyState.boundingBox();
  const navBox = await nav.boundingBox();

  expect(emptyBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect((emptyBox?.y ?? 0) + (emptyBox?.height ?? 0) + 12).toBeLessThan(navBox?.y ?? 0);
});

test('heavy views stay gated on mobile until requested', async ({ page }) => {
  await page.goto('/?e2e=1&view=partner-intelligence');

  const loadVisuals = page.getByRole('button', { name: /load visual breakdown/i });
  await expect(loadVisuals).toBeVisible();
  await loadVisuals.click();
  await expect(page.getByText('Love Languages')).toBeVisible({ timeout: 10_000 });

  await page.goto('/?e2e=1&view=our-room');

  const openScene = page.getByRole('button', { name: /open room scene/i });
  await expect(openScene).toBeVisible();
  await openScene.click();
  await expect(page.locator('[data-testid="room-scene-3d"] canvas')).toBeVisible();
});
