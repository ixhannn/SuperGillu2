# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visualParity.spec.ts >> visual parity: sync
- Location: tests\browser\visualParity.spec.ts:94:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  10743 pixels (ratio 0.04 of all image pixels) are different.

  Snapshot: sync-393.png

Call log:
  - Expect "toHaveScreenshot(sync-393.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 10751 pixels (ratio 0.04 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 10743 pixels (ratio 0.04 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - img
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e9]:
        - generic [ref=e11]:
          - img [ref=e13]
          - generic [ref=e15]:
            - paragraph [ref=e16]: Status
            - paragraph [ref=e17]: Offline
          - button "Sync" [ref=e18] [cursor=pointer]:
            - img [ref=e19]
            - text: Sync
        - generic [ref=e24]:
          - generic [ref=e25]:
            - img [ref=e26]
            - paragraph [ref=e32]: Pairing Hub
          - generic [ref=e33]:
            - paragraph [ref=e34]: One-time private link
            - paragraph [ref=e35]: Show a QR or send the code. After it works once, you do not need to pair again.
            - paragraph [ref=e36]: Could not generate a code. Check sign-in and connection.
          - generic [ref=e37]:
            - button "My QR" [ref=e38] [cursor=pointer]
            - button "Scan Partner's QR" [ref=e39] [cursor=pointer]
          - generic [ref=e41]:
            - paragraph [ref=e42]: Generate a QR code for your partner to scan.
            - button "Generate QR" [ref=e43] [cursor=pointer]:
              - img [ref=e44]
              - text: Generate QR
        - generic [ref=e50]:
          - paragraph [ref=e51]: Cloud Tools
          - paragraph [ref=e52]: Keep media safe and restore across devices.
          - button "Upload Images Push local media to cloud storage Cloud" [ref=e53] [cursor=pointer]:
            - generic [ref=e54]:
              - img [ref=e56]
              - generic [ref=e59]:
                - paragraph [ref=e60]: Upload Images
                - paragraph [ref=e61]: Push local media to cloud storage
            - generic [ref=e62]: Cloud
          - button "Recover Images Pull available media from cloud Restore" [ref=e63] [cursor=pointer]:
            - generic [ref=e64]:
              - img [ref=e66]
              - generic [ref=e71]:
                - paragraph [ref=e72]: Recover Images
                - paragraph [ref=e73]: Pull available media from cloud
            - generic [ref=e74]: Restore
        - generic [ref=e76]:
          - generic [ref=e77]:
            - paragraph [ref=e78]: Notifications
            - paragraph [ref=e79]: Disabled
          - button "Enable notifications" [ref=e80] [cursor=pointer]:
            - img [ref=e81]
        - button "Log Out" [ref=e87] [cursor=pointer]
    - generic [ref=e89]:
      - button "Home" [ref=e91] [cursor=pointer]:
        - img [ref=e93]
      - button "Us" [ref=e96] [cursor=pointer]:
        - img [ref=e98]
      - button "Add" [ref=e103] [cursor=pointer]:
        - img [ref=e105]
      - button "Moments" [ref=e106] [cursor=pointer]:
        - img [ref=e108]
      - button "Memories" [ref=e111] [cursor=pointer]:
        - img [ref=e113]
    - generic [ref=e116]:
      - img [ref=e118]
      - generic [ref=e120]: Could not generate QR. Are you signed in?
  - button "#" [ref=e121] [cursor=pointer]
  - banner [ref=e123]:
    - button "Go back" [ref=e124] [cursor=pointer]:
      - img [ref=e125]
    - heading "Cloud Sync ★" [level=2] [ref=e128]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | 
  3   | const freezeVisualMotion = async (page: Page) => {
  4   |   await page.addStyleTag({
  5   |     content: `
  6   |       *, *::before, *::after {
  7   |         animation-duration: 0s !important;
  8   |         animation-delay: 0s !important;
  9   |         transition-duration: 0s !important;
  10  |         transition-delay: 0s !important;
  11  |         scroll-behavior: auto !important;
  12  |       }
  13  |       [data-testid="ambient-visuals-3d"],
  14  |       canvas[aria-hidden="true"] {
  15  |         display: none !important;
  16  |       }
  17  |     `,
  18  |   });
  19  | };
  20  | 
  21  | const seedStableState = async (page: Page) => {
  22  |   await page.addInitScript(() => {
  23  |     const profile = {
  24  |       myName: 'Ishan',
  25  |       partnerName: 'Tulika',
  26  |       anniversaryDate: '2024-02-14',
  27  |       theme: 'rose',
  28  |     };
  29  |     localStorage.setItem('lior_identity', JSON.stringify({
  30  |       myName: profile.myName,
  31  |       partnerName: profile.partnerName,
  32  |     }));
  33  |     localStorage.setItem('lior_shared_profile', JSON.stringify(profile));
  34  |     localStorage.setItem('lior_onboarded', '1');
  35  |     localStorage.setItem('lior_memories', JSON.stringify([
  36  |       {
  37  |         id: 'visual-memory-1',
  38  |         text: 'A tiny baseline memory',
  39  |         date: '2026-04-20T10:00:00.000Z',
  40  |         mood: 'love',
  41  |         image: '',
  42  |       },
  43  |     ]));
  44  |     localStorage.setItem('lior_notes', JSON.stringify([
  45  |       {
  46  |         id: 'visual-note-1',
  47  |         title: 'Pocket note',
  48  |         content: 'Baseline note',
  49  |         date: '2026-04-20T10:00:00.000Z',
  50  |       },
  51  |     ]));
  52  |     localStorage.setItem('lior_private_space_items', JSON.stringify([
  53  |       {
  54  |         id: 'visual-private-1',
  55  |         kind: 'note',
  56  |         title: 'Sealed note',
  57  |         note: 'A stable private item',
  58  |         addedBy: 'Ishan',
  59  |         createdAt: '2026-04-20T10:00:00.000Z',
  60  |         updatedAt: '2026-04-20T10:00:00.000Z',
  61  |       },
  62  |     ]));
  63  |   });
  64  | };
  65  | 
  66  | const waitForStableViewContent = async (page: Page, view: string) => {
  67  |   const ready = {
  68  |     home: page.getByText(/you've been together for/i),
  69  |     us: page.getByRole('heading', { name: 'Us', exact: true }),
  70  |     timeline: page.getByRole('heading', { name: 'Our Journey', exact: true }),
  71  |     'daily-moments': page.getByRole('heading', { name: /capture a moment that fades away/i }),
  72  |     'private-space': page.getByText('A stable private item'),
  73  |     sync: page.getByRole('heading', { name: /cloud sync/i }),
  74  |   }[view];
  75  | 
  76  |   if (ready) await expect(ready).toBeVisible({ timeout: 15_000 });
  77  | };
  78  | 
  79  | const openStableView = async (page: Page, view: string) => {
  80  |   await seedStableState(page);
  81  |   await page.setViewportSize({ width: 393, height: 852 });
  82  |   await page.goto(`/?e2e=1&view=${view}`);
  83  |   await page.locator('[data-tour-occluder="bottom-nav"]').waitFor({ state: 'visible' });
  84  |   if (view === 'private-space') {
  85  |     await page.getByRole('button', { name: /unlock private space/i }).click();
  86  |     await page.evaluate(() => window.scrollTo(0, 0));
  87  |   }
  88  |   await waitForStableViewContent(page, view);
  89  |   await freezeVisualMotion(page);
  90  |   await page.waitForTimeout(250);
  91  | };
  92  | 
  93  | for (const view of ['home', 'us', 'timeline', 'daily-moments', 'private-space', 'sync']) {
  94  |   test(`visual parity: ${view}`, async ({ page }) => {
  95  |     await openStableView(page, view);
> 96  |     await expect(page).toHaveScreenshot(`${view}-393.png`, {
      |                        ^ Error: expect(page).toHaveScreenshot(expected) failed
  97  |       fullPage: false,
  98  |       animations: 'disabled',
  99  |       maxDiffPixelRatio: 0.006,
  100 |     });
  101 |   });
  102 | }
  103 | 
```