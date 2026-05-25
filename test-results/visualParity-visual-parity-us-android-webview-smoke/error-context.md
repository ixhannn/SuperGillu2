# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visualParity.spec.ts >> visual parity: us
- Location: tests\browser\visualParity.spec.ts:94:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  36573 pixels (ratio 0.11 of all image pixels) are different.

  Snapshot: us-393.png

Call log:
  - Expect "toHaveScreenshot(us-393.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 36565 pixels (ratio 0.11 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 36573 pixels (ratio 0.11 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - img
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - paragraph [ref=e9]: Shared Spaces
          - generic [ref=e10]:
            - button "Our Room Decorate together" [ref=e11] [cursor=pointer]:
              - img [ref=e13]
              - generic [ref=e16]:
                - paragraph [ref=e17]: Our Room
                - paragraph [ref=e18]: Decorate together
            - button "Presence Feel each other" [ref=e19] [cursor=pointer]:
              - img [ref=e21]
              - generic [ref=e25]:
                - paragraph [ref=e26]: Presence
                - paragraph [ref=e27]: Feel each other
            - button "Draw Together Shared canvas" [ref=e28] [cursor=pointer]:
              - img [ref=e30]
              - generic [ref=e34]:
                - paragraph [ref=e35]: Draw Together
                - paragraph [ref=e36]: Shared canvas
            - button "Quiet Mode Ambient memories" [ref=e37] [cursor=pointer]:
              - img [ref=e39]
              - generic [ref=e41]:
                - paragraph [ref=e42]: Quiet Mode
                - paragraph [ref=e43]: Ambient memories
        - button "Aura Signal Send a feeling across the distance, wordlessly Send" [ref=e45] [cursor=pointer]:
          - img [ref=e47]
          - generic [ref=e50]:
            - paragraph [ref=e51]: Aura Signal
            - paragraph [ref=e52]: Send a feeling across the distance, wordlessly
          - generic [ref=e53]:
            - text: Send
            - img [ref=e54]
        - generic [ref=e58]:
          - button "Bucket List" [ref=e59] [cursor=pointer]:
            - img [ref=e60]
            - generic [ref=e63]: Bucket List
          - button "Wishlist" [ref=e64] [cursor=pointer]:
            - img [ref=e65]
            - generic [ref=e69]: Wishlist
          - button "Milestones" [ref=e70] [cursor=pointer]:
            - img [ref=e71]
            - generic [ref=e73]: Milestones
        - generic [ref=e74]:
          - generic [ref=e75]:
            - img [ref=e76]
            - textbox "An adventure to add…" [ref=e79]
            - button [ref=e80] [cursor=pointer]:
              - img [ref=e81]
          - generic [ref=e82]:
            - img [ref=e84]
            - paragraph [ref=e87]: The world is yours
            - paragraph [ref=e88]: Add adventures to share together
    - generic [ref=e90]:
      - button "Home" [ref=e92] [cursor=pointer]:
        - img [ref=e94]
      - button "Us" [ref=e97] [cursor=pointer]:
        - img [ref=e99]
      - button "Add" [ref=e104] [cursor=pointer]:
        - img [ref=e106]
      - button "Moments" [ref=e107] [cursor=pointer]:
        - img [ref=e109]
      - button "Memories" [ref=e112] [cursor=pointer]:
        - img [ref=e114]
  - button "#" [ref=e117] [cursor=pointer]
  - banner [ref=e119]:
    - button "Go back" [ref=e120] [cursor=pointer]:
      - img [ref=e121]
    - generic [ref=e123]:
      - heading "Us" [level=2] [ref=e124]
      - paragraph [ref=e125]: our world together
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