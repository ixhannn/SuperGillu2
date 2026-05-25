# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visualParity.spec.ts >> visual parity: private-space
- Location: tests\browser\visualParity.spec.ts:94:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  4735 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: private-space-393.png

Call log:
  - Expect "toHaveScreenshot(private-space-393.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 4778 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 4735 pixels (ratio 0.02 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - img
  - generic [ref=e2]:
    - main [ref=e3]:
      - main [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]:
            - paragraph [ref=e14]:
              - img [ref=e15]
              - text: Only you two
            - heading "Private Space" [level=2] [ref=e19]
            - paragraph [ref=e20]: Hidden from memories and recaps.
          - generic [ref=e21]: 1 sealed
        - generic [ref=e22]:
          - button "All · 1" [ref=e23] [cursor=pointer]:
            - text: All
            - generic [ref=e24]: · 1
          - button "Notes" [ref=e25] [cursor=pointer]
        - button "A stable private item Apr 20, 2026" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]:
            - img [ref=e30]
            - paragraph [ref=e33]: A stable private item
            - paragraph [ref=e34]: Apr 20, 2026
    - generic [ref=e36]:
      - button "Home" [ref=e38] [cursor=pointer]:
        - img [ref=e40]
      - button "Us" [ref=e43] [cursor=pointer]:
        - img [ref=e45]
      - button "Add private item" [ref=e50] [cursor=pointer]:
        - img [ref=e52]
      - button "Moments" [ref=e53] [cursor=pointer]:
        - img [ref=e55]
      - button "Memories" [ref=e58] [cursor=pointer]:
        - img [ref=e60]
  - button "#" [ref=e63] [cursor=pointer]
  - banner [ref=e65]:
    - button "Go back" [ref=e66] [cursor=pointer]:
      - img [ref=e67]
    - generic [ref=e69]:
      - heading "Private Space" [level=2] [ref=e70]
      - paragraph [ref=e71]: shared vault
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