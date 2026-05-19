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
      maxDiffPixelRatio: 0.006,
    });
  });
}
