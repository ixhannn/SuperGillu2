import { expect, test, type Page } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lCk6vAAAAABJRU5ErkJggg==',
  'base64',
);

const consoleErrors = new WeakMap<Page, string[]>();

declare global {
  interface Window {
    __liorLongTasks?: Array<{ name: string; duration: number; startTime: number }>;
    __liorLongTaskObserver?: PerformanceObserver;
  }
}

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

const installLongTaskCollector = async (page: Page) => {
  await page.addInitScript(() => {
    window.__liorLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__liorLongTasks?.push({
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
  const tasks = await page.evaluate(() => {
    const pending = window.__liorLongTaskObserver?.takeRecords() ?? [];
    for (const entry of pending) {
      window.__liorLongTasks?.push({
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime,
      });
    }
    return window.__liorLongTasks ?? [];
  });
  const bad = tasks.filter((task: { duration: number }) => task.duration > maxDuration);
  expect(bad).toEqual([]);
};

const resetLongTasks = async (page: Page) => {
  await page.evaluate(() => {
    window.__liorLongTaskObserver?.takeRecords();
    window.__liorLongTasks = [];
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.__liorLongTaskObserver?.takeRecords();
      window.__liorLongTasks = [];
      resolve();
    });
  }));
  await page.evaluate(() => {
    window.__liorLongTaskObserver?.takeRecords();
    window.__liorLongTasks = [];
  });
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

test('portaled view headers do not persist after returning home', async ({ page }) => {
  await page.goto('/?e2e=1');

  const nav = page.locator('[data-tour-occluder="bottom-nav"]');
  await expect(nav).toBeVisible();

  await nav.getByLabel('Us').click();
  await expect(page.locator('.vh-title', { hasText: 'Us' })).toBeVisible();

  await nav.getByLabel('Home').click();
  await expect(page.getByText(/you've been together for/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.vh-shell')).toHaveCount(0);
});

test('native ambient motion remains visible behind the Us page', async ({ page }) => {
  await page.goto('/?e2e=1&view=us');

  await expect(page.locator('[data-testid="ambient-visuals-motion-fallback"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Us', exact: true })).toBeVisible();

  const surfaces = await page.evaluate(() => {
    const getBackgroundColor = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).backgroundColor : 'missing';
    };

    return {
      wrapper: getBackgroundColor('.lenis-wrapper'),
      content: getBackgroundColor('.lenis-content'),
      us: getBackgroundColor('.us-view'),
    };
  });

  expect(surfaces).toEqual({
    wrapper: 'rgba(0, 0, 0, 0)',
    content: 'rgba(0, 0, 0, 0)',
    us: 'rgba(0, 0, 0, 0)',
  });
});

test('daily moments exposes a share action after choosing a photo', async ({ page }) => {
  await page.goto('/?e2e=1&view=daily-moments');

  await expect(page.getByLabel('Share a photo moment')).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByLabel('Share a photo moment').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'moment.png', mimeType: 'image/png', buffer: tinyPng });

  await expect(page.getByText('Post Moment')).toBeVisible({ timeout: 10_000 });
  const shareMomentButton = page.getByRole('button', { name: /share moment/i });
  await expect(shareMomentButton).toBeVisible();
  await expect(shareMomentButton).toBeEnabled({ timeout: 15_000 });

  await page.getByPlaceholder('Add a caption...').fill('Tiny regression moment');
  await shareMomentButton.click();

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

test('draw together tools fit above the bottom nav on mobile', async ({ page }) => {
  for (const { width, height } of [
    { width: 360, height: 640 },
    { width: 360, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/?e2e=1&view=canvas');

    const nav = page.locator('[data-tour-occluder="bottom-nav"]');
    const stage = page.locator('[data-testid="draw-together-stage"]');
    const toolbar = page.locator('[data-testid="draw-together-toolbar"]');

    await expect(page.getByRole('heading', { name: 'Draw Together', exact: true })).toBeVisible();
    await expect(stage).toBeVisible();
    await expect(toolbar).toBeVisible();
    await expect(nav).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const stageBox = await stage.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    const navBox = await nav.boundingBox();

    expect(stageBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(navBox).not.toBeNull();

    expect(stageBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((stageBox?.x ?? 0) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(width + 1);
    expect((stageBox?.y ?? 0) + (stageBox?.height ?? 0) + 10).toBeLessThan(toolbarBox?.y ?? 0);
    expect((toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0) + 10).toBeLessThan(navBox?.y ?? 0);
  }
});

test('comments and hot grids stay responsive while typing', async ({ page }) => {
  await installLongTaskCollector(page);
  const image = `data:image/png;base64,${tinyPng.toString('base64')}`;
  const seed = {
    memories: Array.from({ length: 8 }, (_, index) => ({
      id: `smooth-memory-${index}`,
      text: `Smooth memory ${index + 1}`,
      date: `2026-04-${String(20 - index).padStart(2, '0')}T10:00:00.000Z`,
      mood: index % 2 ? 'funny' : 'love',
      image,
    })),
    dailyPhotos: [
      {
        id: 'smooth-daily-1',
        caption: 'A tiny daily moment',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        image,
        senderId: 'e2e-device',
      },
    ],
    comments: [
      {
        id: 'smooth-comment-1',
        postId: 'smooth-memory-0',
        senderId: 'Alex',
        senderName: 'Alex',
        text: 'Already here, should not repaint while typing.',
        createdAt: '2026-04-20T10:05:00.000Z',
      },
      {
        id: 'smooth-comment-2',
        postId: 'smooth-daily-1',
        senderId: 'Tulika',
        senderName: 'Sam',
        text: 'Daily note stays stable too.',
        createdAt: '2026-04-20T10:06:00.000Z',
      },
    ],
    usBucketItems: Array.from({ length: 6 }, (_, index) => ({
      id: `smooth-bucket-${index}`,
      text: `Little plan ${index + 1}`,
      addedBy: index % 2 ? 'Sam' : 'Alex',
    })),
  };

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?e2e=1');
  await page.evaluate(async (data) => {
    localStorage.setItem('lior_onboarded', 'true');
    localStorage.setItem('lior_identity', JSON.stringify({ myName: 'Alex', partnerName: 'Sam' }));
    localStorage.setItem('lior_shared_profile', JSON.stringify({
      myName: 'Alex',
      partnerName: 'Sam',
      anniversaryDate: '2024-02-14',
      theme: 'rose',
    }));
    localStorage.setItem('lior_memories', JSON.stringify(data.memories));
    localStorage.setItem('lior_daily_photos', JSON.stringify(data.dailyPhotos));
    localStorage.setItem('lior_comments', JSON.stringify(data.comments));
    localStorage.setItem('lior_us_bucket_items', JSON.stringify(data.usBucketItems));

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('LiorVault_v11', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('metadata_store')) db.createObjectStore('metadata_store');
        if (!db.objectStoreNames.contains('image_vault')) db.createObjectStore('image_vault');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('metadata_store', 'readwrite');
        const store = tx.objectStore('metadata_store');
        store.put(data.memories, 'lior_memories');
        store.put(data.dailyPhotos, 'lior_daily_photos');
        store.put(data.comments, 'lior_comments');
        store.put(data.usBucketItems, 'lior_us_bucket_items');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, seed);
  await resetLongTasks(page);

  await page.goto('/?e2e=1&view=timeline');
  await expect(page.getByRole('heading', { name: 'Our Journey', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-memory-card="true"]').first().click();
  const memoryInput = page.getByPlaceholder(/write a note/i);
  await expect(memoryInput).toBeVisible();
  await resetLongTasks(page);
  await memoryInput.type('typing should stay calm', { delay: 8 });
  await expectNoBadLongTasks(page, 180);

  await page.goto('/?e2e=1&view=daily-moments');
  await expect(page.getByText('A tiny daily moment')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-daily-photo-card="true"]').first().click();
  const dailyInput = page.getByPlaceholder(/add a comment/i);
  await expect(dailyInput).toBeVisible();
  await resetLongTasks(page);
  await dailyInput.type('daily typing stays calm', { delay: 8 });
  await expectNoBadLongTasks(page, 180);

  await page.goto('/?e2e=1&view=us');
  await expect(page.getByRole('heading', { name: 'Us', exact: true })).toBeVisible({ timeout: 15_000 });
  const bucketInput = page.getByPlaceholder(/adventure to add/i);
  await expect(bucketInput).toBeVisible();
  await resetLongTasks(page);
  await bucketInput.type(' castle', { delay: 8 });
  await expectNoBadLongTasks(page, 180);
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

test('pairing hub links accounts with a manual partner code', async ({ page }) => {
  await page.addInitScript(() => {
    let linked = false;
    window.__liorPairingMock = {
      async getStatus() {
        return linked
          ? {
              isLinked: true,
              coupleId: 'couple-e2e',
              partnerUserId: 'partner-e2e',
              partnerName: 'Sam',
              memberCount: 2,
            }
          : {
              isLinked: false,
              coupleId: 'solo-e2e',
              partnerUserId: null,
              partnerName: null,
              memberCount: 1,
            };
      },
      async createInvite() {
        return {
          code: 'ABCD2345',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          coupleId: 'solo-e2e',
        };
      },
      async claimInvite(code) {
        if (code !== 'ABCD2345') return { ok: false, error: 'invalid' };
        linked = true;
        return {
          ok: true,
          coupleId: 'couple-e2e',
          partnerUserId: 'partner-e2e',
          partnerName: 'Sam',
        };
      },
    };
  });

  await page.goto('/?e2e=1&view=sync');
  await expect(page.getByText('Pairing Hub')).toBeVisible();

  await page.getByRole('button', { name: /scan partner/i }).click();
  await page.getByPlaceholder(/enter partner code/i).fill('ABCD-2345');
  await page.getByRole('button', { name: /link accounts/i }).click();

  await expect(page.getByText('Permanent link saved', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/connected to/i)).toBeVisible();
  await expect(page.getByText('You and Sam are sharing one private space.')).toBeVisible();
});

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
  await expect(page.getByText(/you've been together for/i)).toBeVisible({ timeout: 10_000 });

  await resetLongTasks(page);

  await nav.getByLabel('Us').click();
  await expect(page.getByRole('heading', { name: 'Us', exact: true })).toBeVisible();
  await expectNoBadLongTasks(page, 220);
  await resetLongTasks(page);

  await nav.getByLabel('Moments').click();
  await expect(page.getByText('Ephemeral Memories')).toBeVisible();
  await expectNoBadLongTasks(page, 220);
  await resetLongTasks(page);

  await nav.getByLabel('Memories').click();
  await expect(page.getByRole('heading', { name: 'Our Journey', exact: true })).toBeVisible();
  await expectNoBadLongTasks(page, 220);
  await resetLongTasks(page);

  await nav.getByLabel('Home').click();
  await expect(page.getByText(/you've been together for/i)).toBeVisible({ timeout: 10_000 });
  await expectNoBadLongTasks(page, 220);
});
