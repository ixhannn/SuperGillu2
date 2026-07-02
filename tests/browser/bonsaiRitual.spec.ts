import { expect, test, type Page } from '@playwright/test';

/**
 * The bonsai daily ritual, end-to-end in a real browser:
 * plant (hold-to-water) → watered state → note CTA → story sheet.
 * Runs against the e2e harness (`?e2e=1&view=bonsai-bloom`) with a seeded
 * local event log, no Supabase required.
 */

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    errors.push(message.text());
  });
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

const seedBloomHistory = async (page: Page, days: number) => {
  await page.addInitScript((dayCount: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const events: unknown[] = [];
    const today = new Date();
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const day = dayKey(d);
      for (const who of ['me', 'partner-sim']) {
        events.push({
          id: `solo_${day}_${who}_w`,
          coupleId: 'solo',
          authorId: who,
          type: 'water',
          day,
          note: null,
          targetEventId: null,
          createdAt: `${day}T0${who === 'me' ? 8 : 9}:00:00.000Z`,
        });
      }
    }
    localStorage.setItem(
      'lior_bonsai_events_v1',
      JSON.stringify({ coupleKey: 'solo', events, pendingIds: [] }),
    );
  }, days);
};

test('planting ceremony: hold-to-water plants the seed', async ({ page }) => {
  await page.goto('/?e2e=1&view=bonsai-bloom');
  const water = page.locator('.bonsai-water');
  await expect(water).toContainText('plant', { ignoreCase: true });

  // Press-and-hold for longer than the 1.3s ritual window.
  const box = await water.boundingBox();
  if (!box) throw new Error('water button not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();

  await expect(water).toContainText('Watered today');
  await expect(page.locator('.bonsai-note-cta')).toBeVisible();

  // The optimistic event landed in the local log with the deterministic id.
  const cache = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lior_bonsai_events_v1') || '{}'));
  expect(cache.events?.[0]?.id).toMatch(/_w$/);
});

test('releasing early cancels the watering', async ({ page }) => {
  await page.goto('/?e2e=1&view=bonsai-bloom');
  const water = page.locator('.bonsai-water');
  const box = await water.boundingBox();
  if (!box) throw new Error('water button not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400); // well under the 1.3s hold
  await page.mouse.up();
  await expect(water).not.toContainText('Watered today');
});

test('a grown tree shows streak, story and share', async ({ page }) => {
  await seedBloomHistory(page, 30);
  await page.goto('/?e2e=1&view=bonsai-bloom');

  await expect(page.locator('.bonsai-water')).toContainText('Watered today');
  await expect(page.locator('.bonsai-chip--streak')).toContainText('30');

  await page.locator('.bonsai-iconbtn--story').click();
  const sheet = page.locator('.bonsai-sheet');
  await expect(sheet).toContainText('The story of your tree');
  await expect(sheet.locator('.bonsai-story__stage.is-reached')).not.toHaveCount(0);
  await page.locator('.bonsai-sheet__close').click();
  await expect(page.locator('.bonsai-iconbtn--share')).toBeVisible();
});
