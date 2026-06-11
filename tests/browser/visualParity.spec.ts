import { expect, test, type Page } from '@playwright/test';

// Home renders wall-clock state (days-together count, the live HH:MM:SS
// "Our time together" ticker, next-milestone countdowns), so the clock and
// timezone must both be pinned or the baselines rot daily and differ between
// the dev machine and CI runners.
const FIXED_NOW = new Date('2026-04-21T10:00:00Z');
test.use({ timezoneId: 'Asia/Kolkata' });

// CI runners rasterize fonts slightly differently than the dev machine that
// generated the baselines; give them a little extra antialiasing slack.
const MAX_DIFF_PIXEL_RATIO = process.env.CI ? 0.01 : 0.006;

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
  // setFixedTime (not install) keeps real timers running, so the ticker's
  // setInterval still fires — it just always reads the same frozen Date.
  await page.clock.setFixedTime(FIXED_NOW);
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
    // Seed a CONFIRMED partner link so the baseline represents a linked couple
    // (the screenshots show a partner). Solo-mode UI is gated on this being absent.
    localStorage.setItem('lior_link_lock', JSON.stringify({
      coupleId: '00000000-0000-4000-8000-000000000001',
      partnerUserId: '00000000-0000-4000-8000-000000000002',
      partnerName: profile.partnerName,
    }));
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

const waitForStableViewContent = async (page: Page, view: string) => {
  const ready = {
    home: page.getByText(/you've been together for/i),
    us: page.getByRole('heading', { name: 'Us', exact: true }),
    timeline: page.getByRole('heading', { name: 'Our Journey', exact: true }),
    'daily-moments': page.getByRole('heading', { name: /capture a moment that fades away/i }),
    'private-space': page.getByText('A stable private item'),
    sync: page.getByRole('heading', { name: /cloud sync/i }),
  }[view];

  if (ready) await expect(ready).toBeVisible({ timeout: 15_000 });
};

const openStableView = async (page: Page, view: string) => {
  await seedStableState(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/?e2e=1&view=${view}`);
  await page.locator('[data-tour-occluder="bottom-nav"]').waitFor({ state: 'visible' });
  if (view === 'private-space') {
    await page.getByRole('button', { name: /unlock private space/i }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await waitForStableViewContent(page, view);
  await freezeVisualMotion(page);
  await page.waitForTimeout(250);
};

for (const view of ['home', 'us', 'timeline', 'daily-moments', 'private-space', 'sync']) {
  test(`visual parity: ${view}`, async ({ page }) => {
    await openStableView(page, view);
    await expect(page).toHaveScreenshot(`${view}-393.png`, {
      fullPage: false,
      animations: 'disabled',
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    });
  });
}

// Solo mode: an UNLINKED user must never see a phantom partner or a
// heartbeat-to-nobody. Same seed, but with the partner link removed.
test('visual parity: home (unlinked / solo mode)', async ({ page }) => {
  await seedStableState(page);
  await page.addInitScript(() => localStorage.removeItem('lior_link_lock'));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?e2e=1&view=home');
  await page.locator('[data-tour-occluder="bottom-nav"]').waitFor({ state: 'visible' });
  await waitForStableViewContent(page, 'home');
  await freezeVisualMotion(page);
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot('home-unlinked-393.png', {
    fullPage: false,
    animations: 'disabled',
    maxDiffPixelRatio: 0.006,
  });
});
