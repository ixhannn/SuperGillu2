# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visualParity.spec.ts >> visual parity: home
- Location: tests\browser\visualParity.spec.ts:94:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  28037 pixels (ratio 0.09 of all image pixels) are different.

  Snapshot: home-393.png

Call log:
  - Expect "toHaveScreenshot(home-393.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 31379 pixels (ratio 0.10 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 3848 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 250ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 4498 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 500ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 28037 pixels (ratio 0.09 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - img
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - button "Alex and Sam, open profile" [ref=e10] [cursor=pointer]:
            - img [ref=e14]
            - generic [ref=e16]:
              - heading "Alex & Sam" [level=1] [ref=e17]
              - paragraph [ref=e18]: Tap to edit profile
          - button "Open cloud sync" [ref=e19] [cursor=pointer]:
            - img [ref=e21]
            - generic [ref=e23]: Sync
        - generic [ref=e26] [cursor=pointer]:
          - generic:
            - img
          - generic [ref=e27]:
            - generic [ref=e28]:
              - generic [ref=e29]:
                - img [ref=e30]
                - text: Our Journey
              - img [ref=e33]
            - generic [ref=e36]:
              - generic [ref=e37]:
                - paragraph [ref=e38]: You've been together for
                - generic [ref=e39]:
                  - heading "827" [level=2] [ref=e40]
                  - generic [ref=e41]: days
                - paragraph [ref=e42]:
                  - img [ref=e43]
                  - text: Every day matters
              - generic:
                - paragraph: That is exactly
                - heading "2 Years, 3 Months, 7 Days" [level=2]
                - paragraph:
                  - img
                  - text: and counting...
        - generic [ref=e47]:
          - generic [ref=e49]:
            - img [ref=e51]
            - generic [ref=e53]:
              - generic [ref=e54]: Send heartbeat
              - generic [ref=e55]: A soft pulse to them
          - img [ref=e58]
        - generic [ref=e63]:
          - generic [ref=e64]:
            - img [ref=e66]
            - generic [ref=e72]:
              - generic [ref=e73]: Sam · Awake
              - generic [ref=e74]: Status unknown
          - generic [ref=e75] [cursor=pointer]:
            - img [ref=e77]
            - generic [ref=e83]:
              - generic [ref=e84]: You · Awake
              - generic [ref=e85]: tap to switch
        - generic [ref=e90] [cursor=pointer]:
          - generic [ref=e91]:
            - generic [ref=e92]:
              - img [ref=e93]
              - generic [ref=e95]: Countdown
            - heading "Our Anniversary" [level=3] [ref=e96]
            - paragraph [ref=e97]: In 269 days
          - img [ref=e99]
        - generic [ref=e102] [cursor=pointer]:
          - generic [ref=e103]:
            - img [ref=e104]
            - generic [ref=e107]: Today's Question
          - paragraph [ref=e108]: "\"What's a conspiracy theory you kind of half-believe?\""
          - generic [ref=e111]: Tap to answer today's question
        - generic [ref=e112]:
          - generic [ref=e115] [cursor=pointer]:
            - img [ref=e118]
            - generic [ref=e121]: Open When
            - generic [ref=e122]: Letters for any moment
          - generic [ref=e125] [cursor=pointer]:
            - img [ref=e128]
            - generic [ref=e131]: Dinner?
            - generic [ref=e132]: Can't decide? We will.
          - button "Open Aura Board" [ref=e134] [cursor=pointer]:
            - generic [ref=e135]:
              - img [ref=e138]
              - generic [ref=e141]: Aura Board
              - generic [ref=e142]: Your shared pulse
          - generic [ref=e145] [cursor=pointer]:
            - img [ref=e148]
            - generic [ref=e150]: Bonsai
            - generic [ref=e151]: Watch us grow together
          - generic [ref=e155] [cursor=pointer]:
            - img [ref=e157]
            - generic [ref=e160]:
              - paragraph [ref=e161]: Private Space
              - paragraph [ref=e162]: 1 sealed item
            - img [ref=e163]
          - button "Premium features 6 exclusive experiences" [ref=e166] [cursor=pointer]:
            - generic [ref=e167]:
              - generic [ref=e168]:
                - img [ref=e170]
                - generic [ref=e172]:
                  - generic [ref=e173]: Premium features
                  - generic [ref=e174]: 6 exclusive experiences
              - img [ref=e176]
    - generic [ref=e179]:
      - button "Home" [ref=e181] [cursor=pointer]:
        - img [ref=e183]
      - button "Us" [ref=e186] [cursor=pointer]:
        - img [ref=e188]
      - button "Add" [ref=e193] [cursor=pointer]:
        - img [ref=e195]
      - button "Moments" [ref=e196] [cursor=pointer]:
        - img [ref=e198]
      - button "Memories" [ref=e201] [cursor=pointer]:
        - img [ref=e203]
  - button "#" [ref=e206] [cursor=pointer]
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