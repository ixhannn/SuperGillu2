# Lior — Render Stability Pass (2026-06-25)

**Method:** Full render-stability audit (multi-surface finders → adversarial verification of every finding against the real worktree code → synthesis).
**Scope:** Second pass building on `docs/RENDERING_STABILITY_AUDIT.md` (2026-06-18). Each finding is classed **APPLY-NOW** (real + visually-identical safe fix), **DEFER** (real but changes look/motion or is structural), or **REJECTED** (refuted or already fixed).

The benchmark, unchanged: when a user rapidly navigates Lior for 10 minutes, they should never witness a frame that looks rebuilt, reset, flashed, popped, jumped, blinked, or reloaded.

---

## 0. Status — APPLY-NOW fixes applied (2026-06-25)

All 13 APPLY-NOW findings are applied (12 files). Every change is `fixRisk: low/none` — pixel-identical at rest; motion is only introduced in a transient/keyboard-open state. **Verified:** `typecheck:app` clean, production `build` + bundle budget green (127 assets), 41 vitest unit tests pass, and 11 relevant guards pass (`motionExperience`, `androidKeyboardOverlay`, `decorativeCanvasGating`, `ambientTabContinuity`, `ambientVisibilityPause`, `nativeShellIntegrity`, `premiumFeatureStyles`, `typographySystem`, `daysTogetherFont`, `dailyVideoGeneration`, `mediaFallbackOrder`).

| Cluster | Fix | File(s) |
|---|---|---|
| A2.1 | `useVideoBlobUrl` seeds the blob:/http pass-through case in the `useState` initializer → no Skeleton blink on warm videos | `views/MemoryTimeline.tsx` |
| A2.2 | `DailyFilmStrip` FrameSlot: module-level thumbnail-URL cache + synchronous seed → no shimmer pulse on remount | `components/daily-video/DailyFilmStrip.tsx` |
| B2.1 | MemoryTimeline grid video: warm fill behind `<video>` → no black first frame | `views/MemoryTimeline.tsx` |
| B2.2 | FilmPlayer: `<video poster>` from the film thumbnail → no empty dark stage | `components/daily-video/FilmPlayer.tsx` |
| B2.3 | DailyMoments PostViewer: decorative blurred `<img>` gated `{!isVideo}` → backdrop paints + closes the `setSrc(null)` viewer-blanking cascade | `views/DailyMoments.tsx` |
| B2.4 | Time-capsule LetterCard: reserve the 56×56 thumbnail slot from the synchronous photo-metadata predicate → no title shift on cold-cache resolve | `components/premium/time-capsule/LetterCards.tsx` |
| C2.1 | DinnerDecider: `storage-update` handler filtered by `detail.table` → spin winner no longer wiped on unrelated events (optional storage stable-default fallback NOT applied — surgical scope) | `views/DinnerDecider.tsx` |
| D2.1 | QuietMode: `bleedImage` promoted to AmbientBackdrop only after the image decodes → no undecoded bleed pop on slideshow advance | `views/QuietMode.tsx` |
| D2.2 | ConstellationCanvas: resize rescales ALL stars' orbit centers (incl. the two partner stars) → partner thread no longer drifts on viewport change *(verify on-device — canvas)* | `components/ConstellationCanvas.tsx` |
| E2.1 | index.html: static pre-bundle splash base colors for the 7 light themes → no rose flash on cold launch | `index.html` |
| F2.1 | PulseCheck + WeeklyReflection: lift the bottom-anchored sheet above the IME via `useNativeShell` + `padding-bottom` (verbatim ComposeSheet pattern) | `components/PulseCheckSheet.tsx`, `components/WeeklyReflection.tsx` |
| G2.1 | Our Story `CountUp`: `tabular-nums` + width reserved on the final value → film stat counters no longer jiggle width | `components/premium/our-story/StoryPlayer.tsx` |

### 0b. DEFER — the 4 P2 items applied on sign-off (2026-06-25)

After review, the user approved the 4 P2 DEFER fixes. Applied + re-verified (typecheck/build/budget green, 41 vitest pass, guards incl. `dailyQuestionSelection`/`premiumFeatureStyles`/ambient/`androidKeyboardOverlay`/`decorativeCanvasGating` pass):

| Item | Fix | File(s) |
|---|---|---|
| **D-1** | DailyQuestion seeds `pair` synchronously via new `getTodayPairLocal()` (no async pop-in), **pre-marking `celebratedRef` when the seed is already revealed** so the reveal flourish never replays on mount | `services/dailyRitual.ts`, `components/DailyQuestion.tsx` |
| **D-7** | AmbientVisuals: gate WebGL promotion on `prefers-reduced-motion` → reduced-motion users stay on the static gradient | `components/AmbientVisuals.tsx` |
| **D-10** | PremiumModal / LetterReader / ComposeSheet / TimeCapsule: 18px `backdrop-filter` moved to a static sibling layer (persists through exit); only the tint scrim fades → no per-frame full-viewport blur re-resolve | `components/PremiumModal.tsx`, `components/premium/time-capsule/LetterReader.tsx`, `components/premium/duet-journal/ComposeSheet.tsx`, `views/TimeCapsule.tsx` |
| **D-13** | PulseCheck / WeeklyReflection: `layout` on the sheet panel eases its height between steps; keyboard lift (F2.1) stays on the CSS padding transition (layout measures at commit → no double-animation) | `components/PulseCheckSheet.tsx`, `components/WeeklyReflection.tsx` |

**Device-verify (headless can't confirm):** D-10 open/close *motion* changed — blur now appears instantly rather than fading (it holds through the close, then unmounts; no snap). D-13 `layout` + drag-to-dismiss coexist on PulseCheck (temporally disjoint — confirm a mid-flow step change + a keyboard open both read cleanly).

The remaining DEFER items below stay **unapplied — awaiting sign-off**: D-2, D-3, D-4, D-5, D-6, D-8, D-9, D-11, D-12, D-14, D-15, D-16, D-17 (these include the two P2 font/editorial-serif items — D-15 RecapNumbers `tabular-nums` and D-17 Bricolage metric-override — held back because they change resting editorial-display look or need measured font ratios + on-device verification).

> Note on dedup: the `providers-state` `dailyquestion-async-pop-1` and the `home-feed` `dailyq-null-seed-popin` findings are the **same underlying bug** (DailyQuestion seeds `pair=null` and returns null until an async read resolves). The verifiers disagreed on recommendation (one `apply-now`, one `defer-signoff`) because the safe fix requires also seeding the `celebratedRef` pre-mark synchronously. It is consolidated below as a single **DEFER** item (the celebration-replay risk makes a blind apply unsafe). The companion `dailyq-layout-size-noop-on-popin` is fully dependent on that same fix and is folded in.

---

## 1. Summary

| Severity | APPLY-NOW | DEFER (sign-off) | REJECTED / already-fixed | Total real |
|----------|-----------|------------------|--------------------------|------------|
| **P2** | 5 | 4 | — | 9 |
| **P3** | 8 | 9 | — | 17 |
| **Total** | **13** | **13** | **24** | **26 real** |

- **APPLY-NOW:** 13 findings (5 P2, 8 P3) — all `fixRisk: low/none`, pixel-identical at rest.
- **DEFER:** 13 findings (4 P2, 9 P3) — `fixRisk: visual` or structural; each changes motion/appearance or carries a control-flow nuance.
- **REJECTED / already-fixed:** 24 findings — refuted (no visible artifact / dead code) or confirmed already correct.

Counts after dedup (the two DailyQuestion duplicates collapse to one DEFER item; `dailyq-layout-size-noop-on-popin` is folded into it as dependent).

---

## 2. APPLY-NOW findings

All are `fixRisk: low/none`, verified pixel-identical at rest. Grouped by shared root-cause cluster.

### Cluster A2 — "warm value fed through a second hook that re-seeds null" (post-paint gap re-introduced)
`useLiorMedia` correctly seeds synchronously (audit fix #3/7), but downstream wrappers and per-cell thumbnail hooks declare `useState(null)` and only assign inside a post-paint `useEffect`, re-opening the exact one-frame gap the warm-seed eliminated.

#### A2.1 — `useVideoBlobUrl` seeds null → Skeleton blinks one frame on every warm-cache video (P2)
- **Files:** `views/MemoryTimeline.tsx:31-67` (hook), `:151-153` (grid `mediaLoading`), `:709-714` (full-screen viewer `mediaLoading`).
- **Symptom:** Every full-screen video open (and every video-only grid card) flashes the gray image Skeleton for one frame on mount/remount, even when the video source is already resolved in RAM.
- **Root cause:** `useVideoBlobUrl` declares `const [blobUrl, setBlobUrl] = useState<string | null>(null)` (line 32, literal null) and only assigns the URL inside a `useEffect` (lines 34-64), including the pass-through branch for `blob:`/`http` at lines 38-40. Passive effects flush after first paint, so `videoSrc`/`videoPreviewUrl` is null on frame 1 regardless of cache warmth → `isVideoPreviewPending` true (line 152) → `mediaLoading` true (lines 153 / 712-714) → Skeleton (lines 206 / 906-909) for one commit.
- **Surgical fix:** Seed the pass-through case synchronously:
  ```ts
  const [blobUrl, setBlobUrl] = useState<string | null>(
    () => (src && (src.startsWith('blob:') || src.startsWith('http')) ? src : null)
  );
  ```
  Keep the existing effect for `data:` decode + src changes.
- **Why it works:** `blob:`/`http` videos (the common cloud case) are already passed through verbatim by the effect, so seeding them in the initializer paints the `<video>` on frame 1; only genuine `data:`-decode videos keep the effect path. Scope correction (verified): grid cards that carry a distinct image thumbnail bypass this (`shouldResolveVideoPreview` false at line 145), so they never blinked — the reliably-affected surfaces are the full-screen viewer (every warm video) and video-only grid cards.
- **fixRisk:** low.

#### A2.2 — `DailyFilmStrip` FrameSlot seeds null + async IDB read → shimmer pulse before each frame (P3)
- **Files:** `components/daily-video/DailyFilmStrip.tsx:107-138`.
- **Symptom:** Each occupied film-strip cell briefly shows the animated shimmer pulse (`.gdv-strip__pulse`) before its thumbnail swaps in, every time the strip mounts — a synchronized shimmer-then-image blink across the visible cells.
- **Root cause:** `const [thumb, setThumb] = useState<string | null>(null)` (line 108) with no cache seed; resolves via `VideoMomentsService.getThumbnailUrl(clip)` inside a `useEffect` (lines 110-117) that awaits an IDB blob read and mints a fresh `createObjectURL` each call. There is no module-level value cache (unlike `useLiorImage`'s `mediaValueCache`), so the pulse always paints first, even for a previously-resolved clip.
- **Surgical fix:** Add a module-level `Map<thumbnailId, objectURL>` cache in `DailyFilmStrip` and seed `useState(() => cache.get(clip.thumbnailId) ?? null)`; populate the cache in the effect on first resolve. Do **not** add revoke-on-unmount (the cached URL is reused).
- **Why it works:** Mirrors `useLiorImage`'s warm-seed exactly; warm cells paint the thumbnail on frame 1, cold first load still pulses (correct).
- **fixRisk:** low (the only caveat — object-URL lifetime — is handled by caching the URL without revoking).

### Cluster B2 — "reserve / fill the media box before async resolve" (black/blank pre-decode + cold-cache layout shift)
Async-resolved media renders with no warm placeholder, no `poster`, or no reserved slot, so the pre-decode/pre-resolve window shows a black box, a blank backdrop, or a layout jump. (Generalizes audit Cluster B.)

#### B2.1 — MemoryTimeline grid video has no warm placeholder/poster → black first frame (P3)
- **Files:** `views/MemoryTimeline.tsx:208-221` (video branch), `:200-202` (card bg).
- **Symptom:** A video memory with no image thumbnail shows a hard black rectangle for the moment between the `<video>` mounting and its first frame decoding, against the cream (`#fffaf2`) card — a visible black blink on scroll-in.
- **Root cause:** The grid video branch renders `<video src object-cover preload=metadata>` (lines 209-221) with no `poster` and no warm fill behind it; the video is `absolute inset-0 object-cover` (line 211) so it occludes the cream card background, and an undecoded video paints UA-default black.
- **Surgical fix:** Mirror the shipped `DailyMoments` fix (`DailyMoments.tsx:114-119`): render an absolutely-positioned warm fill div behind the `<video>`:
  ```jsx
  <div className="absolute inset-0" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }} />
  ```
- **Why it works:** The fill is fully occluded once the first opaque frame decodes (pixel-identical at rest); only the transient pre-decode window changes from black to a faint warm tint. The sibling `DailyMoments` component already uses this exact pattern with an explicit comment that the team observed the black blink on-device.
- **fixRisk:** low.

#### B2.2 — FilmPlayer video has no poster → empty dark stage before first frame (P3)
- **Files:** `components/daily-video/FilmPlayer.tsx:57-67`, `styles/gold-daily-video.css:288-322`, `services/videoMoments.ts:633-640`.
- **Symptom:** On opening a finished film, a brief moment after `videoUrl` resolves but before the first frame decodes shows only the cinema's dark gradient backdrop (no image), then the video pops in. Perceptible empty-then-fill on the hero stage (mild — the dark backdrop masks most of it).
- **Root cause:** The `<video>` (lines 58-67) has no `poster`; the play overlay is gated on `loaded` (`onLoadedData`), so nothing covers the gap between URL assignment and first-frame paint. A film thumbnail blob exists (`VideoMomentsService.getFilmThumbnailUrl`, `videoMoments.ts:633-640`) but is unused.
- **Surgical fix:** Resolve `getFilmThumbnailUrl(film)` alongside `getFilmVideoUrl` in the existing effect; set `<video poster={thumbUrl}>` and revoke the blob URL on cleanup like the video URL.
- **Why it works:** First frame shows the film's own thumbnail instead of the empty stage; `thumbnailId` is optional so a missing poster is a graceful no-op; additive and pixel-identical at rest.
- **fixRisk:** low.

#### B2.3 — DailyMoments PostViewer blurred background uses `<img src={videoUrl}>` for video posts → backdrop never paints (+ latent source-blanking) (P3)
- **Files:** `views/DailyMoments.tsx:406-429`.
- **Symptom:** Opening a video daily-moment full-screen leaves the intended blurred-fill backdrop empty (the `<img>` cannot load a video source), leaving the plain black media container around the contained video instead of the soft blurred bleed shown for photos.
- **Root cause:** For both photo and video posts the decorative blurred background is rendered unconditionally as `<img src={mediaSrc} blur-3xl>` (lines 412-419). For video posts `mediaSrc` is the video URL; an `<img>` cannot decode video → `onError` fires and the backdrop stays blank. **Severity escalation (verified):** when the video resolves to a remote R2 `http` URL, the `<img>` `onError` (`handleMediaError`) passes `useLiorMedia`'s http-guard (`useLiorImage.ts:140`), deletes the cache key, and on local-miss calls `setSrc(null)` (line 148) — blanking the source for the **entire viewer**, dropping the real `<video>` to "Media Unavailable" too.
- **Surgical fix:** Guard the decorative `<img>` on `{!isVideo && (...)}` (it is purely cosmetic).
- **Why it works:** The black container is acceptable for contained video (no regression), and the guard also closes the latent source-blanking cascade for partner-synced R2 videos.
- **fixRisk:** none.

#### B2.4 — Time-capsule LetterCard thumbnail mounts conditionally → title text shifts on cold-cache resolve (P3)
- **Files:** `components/premium/time-capsule/LetterCards.tsx:103-129`.
- **Symptom:** On a cold image cache, an `OpenedLetterCard` with a photo first paints with no thumbnail and the title/message flush-left, then the 56×56 thumbnail pops in and (because the row is a flex with `layout`) the text slides ~70px rightward — a one-time horizontal jump per card.
- **Root cause:** Thumbnail rendered `{imageUrl && <img .../>}` (lines 121-129), so the fixed 56×56 box only enters the flex row (line 120, `layout` parent at 106-107) once `useLiorMedia` resolves. Cold cache seeds null (`useLiorImage.ts:55-56`), so the box is absent on frame 1; when it mounts, the `layout`-animated flex reflows the sibling text.
- **Surgical fix:** Reserve the 56×56 slot when a photo exists, gated on the **synchronous photo-metadata predicate** the sibling `SealedEnvelopeCard` already uses (`LetterCards.tsx:21`): `!!(capsule.imageId || capsule.image || capsule.storagePath)`. Render a neutral placeholder box while `imageUrl` is null, swap the `<img>` in on resolve.
- **Why it works:** Gated on photo metadata it is pixel-identical at rest (text-only letters get no box) and only stabilizes the cold-load path. Warm-cache opens were already immune (sync seed).
- **fixRisk:** low. **Critical:** must gate on the photo-metadata predicate, NOT render the box unconditionally (that would add a 56px slot to text-only letters and change their at-rest layout).

### Cluster C2 — "unfiltered storage-update handler churns derived state" (winner reset on unrelated events)
Generalizes audit Cluster C: a `storage-update` listener that does not filter by `detail.table` reacts to every cross-table event; combined with a non-stable returned reference it invalidates derived UI state on unrelated background activity.

#### C2.1 — DinnerDecider clears the spin winner on unrelated background storage events (P3)
- **Files:** `views/DinnerDecider.tsx:118-124` (handler), `:111-116` (winner-invalidation effect), `services/storage.ts:1965` (`getDinnerOptions`).
- **Symptom:** After a spin lands, the "Tonight you're having [X]" winner card and the highlighted wedge vanish with no user action when an unrelated background event fires (partner awake/asleep flip, a memory/profile sync, a theme write). Affects default-options users only.
- **Root cause:** The handler `load` (line 119) is unfiltered — runs `setOptions(StorageService.getDinnerOptions())` on every `storage-update`. `getDinnerOptions` (storage.ts:1965) returns the stable `DATA_CACHE.dinnerOptions` reference only when non-empty; with no saved options it allocates a **brand-new** default array each call, so every unrelated event yields a new `options` reference → re-runs the `useEffect(..., [options])` invalidation (lines 111-116) → `setWinner(null)`/`setWinnerId(null)`, wiping the result. Users with saved options are spared (stable reference, React bails).
- **Surgical fix:** Filter by table like every other view (`OurRoom.tsx:423`, `PrivateSpace.tsx:223`, `Us.tsx:100`, `LoveMissions.tsx:400`):
  ```ts
  const handleUpdate = (e) => {
    const t = (e as CustomEvent).detail?.table;
    if (!t || t === 'dinner_options' || t === 'init') load();
  };
  ```
  Optionally memoize the default fallback array to a module-level constant for a stable reference.
- **Why it works:** The winner-invalidation effect then only fires on genuine menu edits; DinnerDecider was the lone unfiltered handler.
- **fixRisk:** low.

### Cluster D2 — "ambient WebGL render-stability on the QuietMode surface" (undecoded bleed + partner-star resize drift)
Two independent QuietMode-only ambient defects; both deliberately-entered P3 surfaces, both `fixRisk: low/visual`.

#### D2.1 — QuietMode AmbientBackdrop swaps `backgroundImage` with no decode gate → undecoded bleed pop (P3)
- **Files:** `components/quiet/AmbientBackdrop.tsx:75-86`, `views/QuietMode.tsx:164-180`, `:346`.
- **Symptom:** On each slideshow advance the blurred photo-bleed layer's `background-image` is swapped in place; on a slow/large image the bleed shows a blank/half-decoded frame before resolving.
- **Root cause:** `AmbientBackdrop.tsx:79` sets `backgroundImage: url(${image})` directly from the prop (`QuietMode.tsx:346` passes raw `currentImage`); CSS background-images decode async. **Corrected mechanism (verified):** on a photo→photo advance `hasPhoto` stays true, so the wrapper's 1600ms opacity transition (line 75) **never fires** — the inner `backgroundImage` is swapped in place with zero crossfade masking. The finder's "1600ms crossfade masks it" claim is wrong; the pop is *less* masked than assumed.
- **Surgical fix:** Keep a `bleedImage` state in QuietMode set to `currentImage` only after the color-sampling Image (lines 164-180) fires `onload`/`decode`; pass `bleedImage` to AmbientBackdrop. Thread the accent effect's cache-hit (line 166), error (177), and cancellation (179) branches so the bleed is never left stale/blank.
- **Why it works:** Resting pixels identical (same image once settled); only delays bleed appearance by decode time.
- **fixRisk:** low (the control-flow threading is the only nuance; never a resting-pixel regression).

#### D2.2 — ConstellationCanvas resize rescales orbit centers for normal stars only → partner stars + thread drift (P3)
- **Files:** `components/ConstellationCanvas.tsx:60-77` (resize), `:104-116` (partner-star seed).
- **Symptom:** On a QuietMode viewport change (URL-bar collapse, rotation, keyboard) the 118 normal stars scale their orbit centers proportionally, but the two heartbeat "partner" stars (`stars[0]`/`stars[1]`) keep stale absolute centers; the glowing partner thread between them drifts out of alignment with the rescaled field.
- **Root cause:** The resize loop only does `s.ox *= sx; s.oy *= sy` where `s.isPartner === -1` (guard at line 71). Partner stars (`isPartner` 0 and 1) are seeded via `makeNormal()` at full `innerWidth`/`innerHeight` (lines 104-116), so they stay in the old coordinate space after a resize. The drift is gradual (slow spring, coeff 0.0008), not an instant teleport.
- **Surgical fix:** Drop the `if (s.isPartner === -1)` guard in the resize loop so all stars scale their `ox`/`oy` by `sx`/`sy`.
- **Why it works:** Size/opacity/heartbeat are unaffected; only the orbit center rescales, matching the rest of the field.
- **fixRisk:** visual (canvas can't be screenshotted headless — **verify on-device**).

### Cluster E2 — "theme application is paint-critical" (pre-bundle splash flash — extends audit Cluster E)
Audit Cluster E #1 claimed static per-theme boot CSS for all non-rose themes; in fact only `starry-night` was given the pre-bundle paint rule.

#### E2.1 — Pre-bundle splash paints rose for the 7 LIGHT non-rose themes (P3)
- **Files:** `public/theme-boot.js:8-15`, `index.html:174-183`, `index.tsx:25-30`, `services/theme.ts:699-796`.
- **Symptom:** On a cold launch by a user whose saved theme is one of the 7 light non-rose themes (baby-pink, warm-beige, teal, ocean, rosewood, sunset, lavender), the first painted frame is the ROSE pink gradient, then snaps to the saved theme's gradient the instant the JS bundle evaluates. Visible pink→theme flash whose duration equals the bundle-download window (clearly visible on a cold/slow load).
- **Root cause:** `theme-boot.js` sets `html[data-theme]` before the bundle, but `index.html`'s inline `<style>` only has a matching pre-bundle paint rule for `html[data-theme="starry-night"]` (background `#0B0D1E`). `index.css` has **no** static `html[data-theme="teal"|"ocean"|...]` rules carrying paint-critical vars, so every light non-rose theme falls through to the inline rose default (`#F8E7EC` + rose gradient). The correct values are written only once `index.tsx` runs `ThemeService.applyTheme(saved, {instant:true})` (`theme.ts:732` sets `--theme-bg-main`, `:787` sets `body.style.background`) — after the splash already painted rose.
- **Surgical fix:** Add static pre-bundle paint rules for the light themes mirroring the starry-night block, in `index.html`'s inline `<style>`:
  ```css
  html[data-theme="teal"], html[data-theme="teal"] body { background: #E2FBF7; background-color: #E2FBF7; }
  /* ...ocean #E8F2FF, baby-pink #FFF4FC, etc. — derive each from theme.ts bgMain first stop */
  ```
  A solid base color is enough for the splash frame; ThemeService paints the exact gradient when the bundle runs.
- **Why it works:** The pre-bundle frame for each light theme now reads as that theme's base color, not rose. Rose users unaffected (`theme-boot.js` returns early for `'rose'`).
- **fixRisk:** low.

### Cluster F2 — "keyboard lift on bottom-anchored fixed sheets" (overlay keyboard model)
Generalizes the shipped Notes/OpenWhen/ComposeSheet keyboard-lift work to two sheets that were missed.

#### F2.1 — PulseCheck / WeeklyReflection textareas are covered by the keyboard (no lift) (P2)
- **Files:** `components/PulseCheckSheet.tsx:161-177`, `components/WeeklyReflection.tsx:101-119`, `views/PartnerIntelligenceView.tsx:863-882` (portal), `services/nativeShell.ts:163-203`.
- **Symptom:** Tapping a note/gratitude/best/hard textarea raises the keyboard but the bottom-anchored sheet does not lift, so the field stays hidden behind the keyboard with no compensating shift. (Steady-state geometric occlusion while the keyboard is open, not a first-paint flash.) WeeklyReflection makes it deterministic via a 350ms autofocus.
- **Root cause:** The keyboard model is overlay (`interactive-widget=overlays-content` + `Keyboard.setResizeMode(None)`, `nativeShell.ts:153/156`), so the WebView never resizes. Unlike Notes/OpenWhen/ComposeSheet — which read `keyboardOpen`/`keyboardHeight` from `useNativeShell` and add bottom padding — these two sheets read neither and add no lift. `nativeShell.revealFocusedInput` only scrolls a `.lenis-wrapper` ancestor, but these sheets are `position:fixed`, portaled into `.gpi-retheme` at `document.body` (`PartnerIntelligenceView.tsx:863-883`) with no `.lenis-wrapper`, so the fallback `document.querySelector('.lenis-wrapper')` scrolls the page (which cannot move a fixed sheet).
- **Surgical fix:** Mirror the verbatim ComposeSheet pattern (`ComposeSheet.tsx:32`, `:97-98` already shipping in this repo):
  ```ts
  const { keyboardOpen, keyboardHeight } = useNativeShell();
  // on the sheet root / backdrop:
  style={{ marginBottom: keyboardOpen ? keyboardHeight : 0,
           transition: 'margin-bottom 220ms cubic-bezier(0.22,1,0.36,1)' }}
  ```
- **Why it works:** `useNativeShell` seeds synchronously (no mount flash); at rest `keyboardOpen=false` → style is 0 → pixel-identical when closed and on web/desktop. Motion is introduced only in the keyboard-open state, which is the desired correction.
- **fixRisk:** low.

### Cluster G2 — "count-up width drift on proportional display faces" (tabular-nums missed)
The Home hero (#29) was fixed with `tabular-nums` + a `ch`-reserved width; the identical defect was never applied to other animated counters. (The other two count-up width findings — RecapNumbers and Onboarding — are in DEFER because their fix visibly changes resting digit spacing on editorial type.)

#### G2.1 — Our Story film counters jiggle width during the count-up ramp (P2)
- **Files:** `components/premium/our-story/StoryPlayer.tsx:82-100` (CountUp), call sites `:310`, `:366`, `:388`, `:395`, `:435`.
- **Symptom:** On the full-screen Our Story premiere, the big stat numbers (e.g. `text-[4.6rem]` best-streak line 366, right-aligned `text-[3.6rem]` "dates" line 435, the `text-[2.3rem]` stat block line 310) grow and shift horizontally as they tick 0→value over 1.4s. Centered slides dance from center outward; the right-aligned dates slide's number slides because its left edge moves while the right edge is pinned. Snaps further at 1,000 when `toLocaleString()` inserts a comma. (Reduced-motion seeds final value, so absent there.)
- **Root cause:** `CountUp` (lines 82-100) renders `{display.toLocaleString()}` in `className='font-serif'` (→ `var(--font-display)` = Bricolage Grotesque, a **proportional** face) with no `fontVariantNumeric:'tabular-nums'` and no reserved width. Each intermediate value has a different rendered width.
- **Surgical fix:** In the CountUp span add tabular figures + reserve the **final** value's width:
  ```ts
  style={{ ...style, fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum" 1',
           display:'inline-block', minWidth:`${value.toLocaleString().length}ch`,
           textAlign: /* 'right' for line-435 dates, 'center' for centered slides */ }}
  ```
- **Why it works:** Reserving on the final value (incl. comma) is pixel-identical at rest while preventing mid-ramp width drift — the same fix shipped for the Home hero (#29, `Home.tsx:42-46/769`) and `VoiceNotes.tsx:679`. Note this is `font-serif` body-stat type (not the large editorial display face of RecapNumbers/Onboarding), so `tabular-nums` here matches existing precedent without a resting-look change.
- **fixRisk:** low.

---

## 3. DEFER (needs sign-off)

All `fixRisk: visual` or structural. Each changes the look or motion of a transition, or carries a control-flow/at-rest nuance that makes a blind apply unsafe.

### Home feed

#### D-1 — DailyQuestion seeds `pair=null` + returns null → card pops into Home feed, shoving DailyDrop / On-This-Day / bento grid down (P2)
*(Consolidates `dailyquestion-async-pop-1`, `dailyq-null-seed-popin`, and the dependent `dailyq-layout-size-noop-on-popin`.)*
- **Files:** `components/DailyQuestion.tsx:51`, `:74-91`, `:161`, `:245-258`; `views/Home.tsx:999-1002`; `services/dailyRitual.ts:240-261`, `:146-150`; `storage.ts:2649`.
- **Symptom:** On every cold Home open the "Today's Question" card is absent for at least one paint (its wrapper renders empty), then pops in ~120-160px tall and shoves the DailyDrop card, On-This-Day card and the bento grid downward. Because `layout="size"` (line 247) has no prior box to animate from, the shove is an instant hard jump, not eased.
- **Root cause:** `const [pair, setPair] = useState<DailyPair | null>(null)` (line 51) + `if (!pair) return null` (line 161); `pair` is only filled by the async `getTodayPair` inside a passive `useEffect` (lines 74-91). The promise is async only because of `getDailyPrompt`'s dynamic `import('./storage')` + optional cloud read — the first-paint data (`StorageService.getTodayQuestion`, `storage.ts:2649`) is fully synchronous. This is a regression of audit fix #13 (the migration to the sealed-reveal `dailyRitual` service replaced the synchronous seed with an async-only one). Sibling `DailyDropCard` is correct (`useDailyDrop` seeds via synchronous `useMemo(getTodayDrop)`), which is why it does not pop.
- **Why it needs sign-off (the control-flow nuance):** The safe fix is to seed `pair` synchronously from the local baseline in the `useState` initializer (export a sync `getTodayPairLocal(ctx)` from `dailyRitual.ts`). **But** the `celebratedRef` pre-mark that prevents the reveal flourish from replaying lives *inside* the async effect (lines 83-86), running before `setPair`. If you seed `pair` with a `revealed: true` baseline (the common reopen-after-both-answered case) **without also seeding `celebratedRef.current = e.date`** in the same initializer, the celebration effect (lines 139-159) fires a full flourish (Heavy haptic + 'confirm' chime + particle burst + toast) on **every Home mount**. The fix must seed *both* `pair` and the `celebratedRef` pre-mark synchronously — hence sign-off, not a blind apply. Once applied, `layout="size"` only animates genuine in-card height changes (its intended purpose) and the dependent pop-in finding is resolved with no separate change (do not add a height placeholder).
- **fixRisk:** low code-wise, but `visual` consequence if the celebration pre-mark is missed.

#### D-2 — PartnerIntelligence insight list double-animates each card's entrance (P3)
- **Files:** `views/PartnerIntelligenceView.tsx:350-367`, `components/InsightCard.tsx:43-47`.
- **Symptom:** Each insight card plays a doubled slide-in — the wrapper `motion.div` eases `y:18→0` while the inner `InsightCard` simultaneously eases `y:12→0` (card starts ~y=30, opacity multiplies 0×0), reading slightly over-animated. On reorder both `layout` springs fire on one logical element.
- **Root cause:** The list maps each insight into a `<motion.div key layout initial animate exit>` (lines 352-360, `GOLD_SOFT_SPRING`) that wraps `<InsightCard>`, whose own root is also a `<motion.div initial animate exit layout>` (`InsightCard.tsx:43-47`, framer default spring). Two nested motion elements own enter/exit/layout timelines for one visual card.
- **Why it changes motion:** Removing a layer changes the entrance feel. Cleanest surgical option (preserves the gold spring + themed classes on the wrapper): strip `initial`/`animate`/`exit`/`layout` from `InsightCard`'s root (plain div, or motion.div without those props) and let the wrapper own the timeline. The inner `whileTap` on the suggested-action button (lines 97-98) is independent and unaffected.
- **fixRisk:** visual.

### Shell / nav / transitions

#### D-3 — Us sub-tab panels replay index-staggered entrance on every toggle (P3)
- **Files:** `views/Us.tsx:389-393`, `:449-453`, `:585-586`.
- **Symptom:** Switching the Us segmented control (Bucket / Wishlist / Milestones) replays the full per-item cascade fade-in from opacity 0 every visit — the list re-staggers each time, reading as the screen rebuilding itself.
- **Root cause:** Three panels wrapped in `<AnimatePresence mode="wait">` (line 389) keyed by sub-tab, so each toggle fully unmounts/mounts. Each panel's items carry `transition={{ delay: i * 0.04 }}` (line 453; `0.03` at 586) with `initial={{opacity:0,...}}`, so framer replays the stagger on the fresh mount. (Audit finding #20, still present.)
- **Why it changes motion:** Either drop the per-index `delay` (items snap in), keep all three panels mounted and toggle visibility (architecture rule #6), or gate the stagger on a first-mount-this-session ref (delay:0 on revisits). All change the appearance.
- **fixRisk:** visual.

#### D-4 — Tab fast-path hard-cuts outgoing tab to `display:none` while incoming starts at opacity 0 → one frame of bare background (P3)
- **Files:** `App.tsx:434-461`, `index.css:2551-2558`, `styles/root-fixes.css:238-245`.
- **Symptom:** On a tab-to-tab switch, the first composited frame has the outgoing tab gone and the incoming tab at opacity 0, so the shared ambient background + vignette show through fully before the incoming fades up over 240ms — a faint flash/dip to background on each tab tap.
- **Root cause:** `runTabTransition` (lines 448-449) does `markTabMounted; setCurrentView` with no clone/exit. On commit the outgoing shell flips to `.is-cached` = `display:none !important` (index.css:2552) instantly; the incoming `.is-active` shell begins `keep-alive-tab-enter` from `opacity:0` (root-fixes.css:243). Transparent tabs over one shared background expose the gap frame. This is audit #18.
- **Why it stays deferred:** The verifier judged the perf cost of a cross-dissolve (two painted heavy tabs during the window) worse than the ~1-frame cosmetic gain. Leaving as-is is defensible; if pursued, overlap the outgoing `.is-cached` with a short `keep-alive-tab-exit` fade or raise the incoming opacity floor.
- **fixRisk:** visual (and a perf trade-off).

#### D-5 — RouteLoader → AppLaunchOverlay handoff is a hard cut between two full-screen Heart treatments (web cold boot) (P3)
- **Files:** `App.tsx:1189-1190`, `:1256-1258`, `components/AppLaunchOverlay.tsx:14-26`, `App.tsx:181-215`.
- **Symptom:** On web cold boot the user sees RouteLoader (24×24 glass Heart + "Waking the room softly"), and the instant `isInitialized` flips true it is replaced with no crossfade by AppLaunchOverlay (28×28 Heart + orbiting particles + "LIOR" cascade) which plays its own entrance — the two pink Heart screens visibly snap.
- **Root cause:** While `!isInitialized` the component early-returns `<RouteLoader/>` (line 1189); once true, AppLaunchOverlay mounts inside `<AnimatePresence>` (line 1256) with fresh `initial` animations. No shared element / crossfade. Audit #16; native is unaffected (native splash covers the window).
- **Why it changes look:** Fix is to make the two screens visually identical at the handoff (same Heart size/position/bg), or render AppLaunchOverlay unconditionally from the first paint and drop RouteLoader — both change the boot visuals.
- **fixRisk:** visual.

#### D-6 — JS clone snapshot (`_run`) cannot copy live `<canvas>`/`<video>` bitmaps → outgoing OurRoom WebGL recedes as a blank rectangle (P3)
- **Files:** `utils/TransitionEngine.ts:386-409`, `components/AmbientVisuals.tsx:218-235` (and `views/OurRoom.tsx:710` → `RoomScene3D.tsx:2-4`).
- **Symptom:** During a push/pop/expand, a live in-route `<canvas>` (OurRoom's R3F WebGL scene) renders as an empty/transparent rectangle in the receding clone for the duration of the animation, while the rest of the cloned page looks correct.
- **Root cause:** `_run` deep-clones the active layer (`activeLayer.cloneNode(true)`, line 390); `cloneNode` copies DOM structure but not a canvas backing store or a video's current frame. This is the **primary** route animator (VT disabled, `_supportsVT = false`), not just the VT fallback (corrects audit #19's scoping). Persistent `AmbientVisuals` lives outside the shell (sibling of `<main>`) so it is never cloned and is unaffected; DailyMoments video player/lightbox uses `createPortal` (`DailyMoments.tsx:361/845`) so it escapes the cloned subtree too. The practically-affected route is OurRoom (overlay shell, rendered inline).
- **Why it needs sign-off:** Fix changes transition motion output and has a real efficacy caveat — R3F's default `Canvas` does not set `preserveDrawingBuffer:true`, so clone-time `sourceCanvas.toDataURL()` typically returns blank unless captured in the same draw frame. The reliable remedy is option (b): skip the deep clone and crossfade the container for heavy-media routes. Warrants device sign-off.
- **fixRisk:** low at-rest (runs only during the transition), but motion-altering + the toDataURL timing subtlety.

### Ambient / WebGL

#### D-7 — Reduced-motion users still get the full animated WebGL ambient (bokeh + morphing glass blob) (P2)
- **Files:** `components/AmbientVisuals.tsx:160-216`, `:112-116`, `components/LiveBackground3D.tsx:349-379`, `components/FloatingHeartsScene.tsx:499-520`, `utils/runtimeProfile.ts:25-45`.
- **Symptom:** A user with `prefers-reduced-motion: reduce` still sees continuous background motion (bokeh drift on Lissajous orbits, camera Z-breathing, the dark-glass blob rotating/breathing/rippling). Only the static CSS wash/sheen fallback is frozen.
- **Root cause:** `AmbientVisualsImpl`'s staged-promotion effect gates only on `isLowPowerDevice()` (line 169) before promoting `fallback → live-3d → hearts`; it never consults `PerformanceManager.reducedMotion`. `isLowPowerDevice` checks only CPU cores / deviceMemory / save-data / connection. `LiveBackground3D.tick` and `FloatingHeartsScene`'s invalidate run unconditionally except for paused/transitioning flags. The only reduced-motion handling is the CSS `animation:none` scoped to the fallback wash.
- **Why it changes the experience (for the better, for those users):** Fix short-circuits WebGL promotion under reduced motion (`if (PerformanceManager.reducedMotion) return;` alongside line 169, matching `HeartbeatParticles.tsx:552/561/565`), so `ambientStage` stays `'fallback'` (static gradient). This is a visual change for reduced-motion users (who explicitly want less motion); all other users unaffected. Deferred because it visibly removes the signature animated layer for that cohort and should be a deliberate product call.
- **fixRisk:** visual.

### Motion / AnimatePresence

#### D-8 — InsightWhisper: AnimatePresence wraps a single keyless child + early `return null` → insight-to-insight swap hard-cuts (P3)
- **Files:** `components/InsightWhisper.tsx:171-243`, `:283-341`.
- **Symptom:** When a new insight replaces the current one via `insight-update`, the card text/colours swap in place with a hard pop (no crossfade).
- **Root cause:** The single inner `motion.div` has no `key`; on `insight-update` `loadInsight` keeps `isVisible=true` (lines 78-82, 129-131) and re-renders, so the same-type keyless child is reconciled in place — AnimatePresence sees no add/remove → no enter/exit. Separately `if (!isVisible) return null` (line 171) makes the `exit` prop dead, though a dismiss tween still plays (redundant, not a visible pop), and the dismiss-then-reload path *does* animate enter on remount.
- **Why it changes motion:** Fix gives the inner div `key={deepInsight?.id ?? legacyInsight?.id}` and drives presence by `{isVisible && <motion.div key=...>}` so swaps animate exit→enter — a new transition where there is currently a hard cut.
- **fixRisk:** visual. **Note:** verify this component is actually mounted before investing — see REJECTED `insightwhisper-not-mounted` (the standalone `InsightWhisper`/`InsightWhisperMini` have zero call sites; only `InsightCard` is live in PartnerIntelligence).

#### D-9 — Push/expand open: shell container (`_run`) and the new overlay shell both animate opacity 0→1 (double-eased fade) (P3)
- **Files:** `utils/TransitionEngine.ts:412-444`, `styles/root-fixes.css:231-245`, `App.tsx:1247-1251`.
- **Symptom:** On opening a pushed/expand detail view the incoming content fades in slightly muddily / double-eased.
- **Root cause:** `_run` transitions the container `_c` opacity 0→1 over 460/520ms (E_SPRING); the freshly-mounted overlay `.keep-alive-shell.is-active` runs `keep-alive-tab-enter` opacity 0→1 over 240ms (E_SILK). The overlay is nested inside `_c`, so rendered opacity = container × shell — two timelines on different curves multiply for the first 240ms.
- **Why it changes motion:** Fix suppresses the overlay's intrinsic fade during a route transition: `html[data-transitioning="1"] .keep-alive-shell[data-keep-alive-tab="__overlay__"].is-active{animation:none}`. Inert at rest (pixel-identical) and keeps the `motionExperience` guard green (separate scoped rule), but it changes the open animation, so sign-off.
- **fixRisk:** visual.

### Premium

#### D-10 — PremiumModal / LetterReader / ComposeSheet / TimeCapsule animate opacity over a live 18px backdrop-filter (P2)
- **Files:** `components/PremiumModal.tsx:126-132`, `components/premium/time-capsule/LetterReader.tsx:53-59`, `components/premium/duet-journal/ComposeSheet.tsx:88-100`, `views/TimeCapsule.tsx:439-445`.
- **Symptom:** On open and close, the dimmed paywall/letter backdrop stutters for a few frames on mid/low-end WebViews — the whole screen behind the sheet is backdrop-blurred while its opacity ramps 0→1 (and 1→0), so the compositor re-resolves an 18px full-viewport blur each frame, twice per visit.
- **Root cause:** The overlay `motion.div` carries a static `backdropFilter: blur(18px)` and animates only `opacity`. Animating opacity on a node owning a full-viewport backdrop-filter forces per-frame blur resolution. Audit #23 (deferred). Device-conditional — not guaranteed-visible on high-end hardware; cannot be confirmed a visible hitch from code alone.
- **Why it changes motion:** Fix pins the blur on an inner `inset-0` div at opacity 1 and fades only the outer scrim's `backgroundColor`. At rest pixel-identical, but the open/close *motion* changes — today blur+tint ease in together; after, the full 18px blur pops in instantly while only the tint ramps.
- **fixRisk:** visual.

#### D-11 — Opened-letter reading card jumps when its photo resolves async (no reserved box) (P3)
- **Files:** `components/premium/time-capsule/LetterReader.tsx:30`, `:91-98`.
- **Symptom:** Opening a letter with a photo on a cold/evicted cache paints title + body first, then the photo pops in between the divider and the message, shoving the message and Sealed/Opened footer down inside the scroll card.
- **Root cause:** `useLiorMedia(...)` returns `src=null` on a cold cache; the `<img>` is gated on `imageUrl &&` (line 91) with no reserved height. Warm path is safe (sync seed), so this only bites first-open / post-LRU-eviction.
- **Why it's grouped with DEFER (not a blind apply):** The fix is structurally identical to APPLY-NOW B2.4 (reserve the box from a synchronous has-photo predicate `!!(capsule.imageId || capsule.image || capsule.storagePath)`, swap the real `<img>` in on load). It is `fixRisk: low` mechanically but the verifier marked it `visual` because reserving a fixed-height media box on a reading card changes the at-rest scroll layout for letters mid-load; confirm the reserved height (e.g. `maxHeight 220` → a fixed min-height placeholder) matches design intent.
- **fixRisk:** visual (height-reservation appearance) — can be promoted to apply-now alongside B2.4 once the placeholder height is signed off.

#### D-12 — StoryPlayer blanks slide content for ~0.16s between every chapter (`mode="wait"` exit with no overlap) (P3)
- **Files:** `components/premium/our-story/StoryPlayer.tsx:751-775`.
- **Symptom:** Advancing a chapter, the current scene's text/numbers fade out completely and the screen shows only the palette gradient + grain for a beat before the next scene's staggered text rises in. On fast taps the premiere reads as flashing empty.
- **Root cause:** The slide-content AnimatePresence uses `mode="wait"` (line 751); the outgoing 0.16s exit must finish before the incoming mounts and runs its `goldStagger`. The palette layer cross-dissolves underneath (default-mode, 0.45s) so the background never flashes, but the foreground is genuinely absent during the wait. **This is a deliberate editorial film-cut, not a render-stability defect** — no loading-branch-before-cache flicker.
- **Why it needs sign-off:** Changing it (default-mode overlapping cross-fade, or zero exit) alters the intended cinematic feel. Confirm desired feel before changing; if intended, leave as-is.
- **fixRisk:** visual.

### Modals / sheets / keyboard

#### D-13 — PulseCheck / WeeklyReflection sheet jumps vertically on every step change (`mode="wait"` + `items-end` + no min-height) (P2)
- **Files:** `components/PulseCheckSheet.tsx:102-103`, `:78-86`; `components/WeeklyReflection.tsx:85-90`, `:64-71`.
- **Symptom:** Each step transition (score → note → gratitude → done; best → hard → done) makes the bottom-anchored sheet's top edge teleport up/down in one frame as the panel height snaps between short and tall steps.
- **Root cause (corrected):** Not an empty "collapse-to-padding" gap frame — `mode="wait"` swaps children atomically in one commit, so there is no painted empty frame. The real cause is that the bottom-pinned panel's **height** changes instantly (no `layout` prop, no height transition, no min-height) at the step swap; steps differ a lot in height (score/done = short; note/gratitude/best/hard = textarea + buttons), and `flex items-end` pins the bottom, so the top edge jumps.
- **Why it changes look/motion:** `min-h-[220px]` would force the short steps (especially `done`/`score`) into a 220px box — taller **at rest** than today, not pixel-identical. The `popLayout` + `layout` alternative animates height — a motion change. Both alter look or motion.
- **fixRisk:** visual.

#### D-14 — Notes grid uses stagger `variants` children inside `AnimatePresence mode="popLayout"` → survivors snap on delete (P3)
- **Files:** `views/Notes.tsx:205-266`, `:18-21`.
- **Symptom (corrected):** On delete, the surviving cards **snap** to their new grid positions in one frame instead of FLIP-sliding into the gap.
- **Root cause (corrected):** The finder bundled three claims; only one is real. Survivors do **not** replay the hidden→show entrance (the container's `animate="show"` is a constant string that never changes, so child variants don't re-fire). The undo-restored card running its entrance is intended re-mount behavior. The genuine artifact: `mode="popLayout"` (line 210) pops the exiting card out of flow so survivors reflow, but the cards (lines 212-216) have **no `layout` prop** — popLayout's whole purpose (animating survivors into the gap) requires `layout`, which is absent, so survivors snap.
- **Why it changes motion:** Fix adds `layout` to the per-card `motion.div` so popLayout FLIP-slides survivors; verify on-device since it changes delete/restore motion.
- **fixRisk:** visual.

### Text / font (count-up + FOUT)

#### D-15 — Weekly Recap "By the numbers" stats slide width as they count up (P2)
- **Files:** `components/weekly-recap/RecapNumbers.tsx:12-33`, `:53-60`, `styles/gold-weekly-recap.css:97-110`.
- **Symptom:** Each oversized serif stat (clamp up to 3.3rem) ramps 0→value over 1.5s on scroll-into-view; even (right-aligned) rows' left edge slides as digits/commas appear, odd rows push the adjacent suffix span rightward, and width snaps at 1,000.
- **Root cause:** `AnimatedNumber` (lines 12-33) renders `{display.toLocaleString()}` in `.grc-numbers__value.font-serif` with no `tabular-nums` and no reserved width. Same root cause as G2.1 / Home hero #29.
- **Why it needs sign-off (NOT pixel-identical at rest):** Applying `tabular-nums` to an oversized 3.3rem **editorial display serif** visibly changes the resting digit spacing/advance widths vs the current proportional figures, and `minWidth` in `ch` may slightly over-reserve. The fix is correct and worth doing, but it is a deliberate look change to an editorial-typography feature.
- **fixRisk:** visual.

#### D-16 — Onboarding "days together" counter dances width while counting up (P3)
- **Files:** `components/Onboarding.tsx:543-555`, `:739`, `styles/onboarding.css:659-669`.
- **Symptom:** On the anniversary step, the 48px centered Fraunces `.lo-ob-days` number counts 0→daysApart over ~1s; proportional digits widen/jitter and re-center as the value gains digits (and a comma past 1,000) before settling.
- **Root cause:** `daysDisplay` rAF count-up renders `{daysDisplay.toLocaleString()}` in `.lo-ob-days` (Fraunces, 48px, no `font-variant-numeric`); centered, so each intermediate width re-centers. Not FOUT (Fraunces is the intended face).
- **Why it needs sign-off:** Same as D-15 — `tabular-nums` + `ch`-reserved width changes resting digit spacing on a large editorial serif. Also consider short-circuiting the rAF when `prefers-reduced-motion` (the reduced-motion block only disables the `loObPop` CSS keyframe, not the JS count-up).
- **fixRisk:** visual.

#### D-17 — No metric-override fallback face: Bricolage FOUT reflows hero + headings (P2)
*(Two finders reported this as `font-bricolage-metric-override-1` and `font-fout-hero-reflow-1` — the same issue, deduped here. Audit #11 part 2, explicitly deferred.)*
- **Files:** `index.html:114-124`, `:120-124`, `styles/typography.css:1-67`.
- **Symptom:** On a cold/throttled load the 5.5rem hero day-count and every h1/h2/h3 first paint in the system fallback font, then reflow (line-height, glyph advances, word-wrap) when Bricolage Grotesque / Afacad Flux swap in (`display=swap` = FOUT). The hero's count-up `minWidth` reservation (#29) is in `ch` units (font-metric-relative), so the reserved box itself resizes on swap.
- **Root cause:** `index.html` ships only the preload + stylesheet (audit #11a applied). There is **no** `@font-face` with `size-adjust`/`ascent-override`/`descent-override`/`line-gap-override` declaring a metric-matched fallback (repo-wide grep returns zero matches). `typography.css` falls back to Afacad Flux / system-ui whose metrics differ from Bricolage. This is a browser font-swap reflow, independent of React effect timing.
- **Why it needs sign-off:** Fix registers metric-override fallback faces (`@font-face{font-family:'Bricolage Fallback';src:local('Arial');size-adjust:~97%;ascent-override:~92%;descent-override:~23%;line-gap-override:0%}`) and lists them in `--font-display`/`--font-ui`. The override percentages must be measured (capsize/fontkit) against the real Bricolage/Afacad/Fraunces metrics, and verified on a throttled cold load — a tuning/measurement task with cross-platform `local()` font-availability nuances, not a mechanical apply. Pixel-identical once the webfont loads.
- **fixRisk:** low mechanically, but `visual`/measurement risk until the ratios are tuned and verified on-device.

---

## 4. REJECTED / already-fixed

One line each with the refutation reason.

1. **`shell-double-fade-1`** (push/pop/expand double opacity timeline via VT path) — REFUTED: the global `html[data-transitioning="1"] *{animation-play-state:paused}` rule (root-fixes.css:115-119) freezes the shell keyframe during the engine transition; only one fade is ever visible. (The narrower normal-motion overlay variant is the real D-9, kept in DEFER.)
2. **`dead-vt-css-1`** (entire VT CSS block is dead) — REFUTED as a stability finding: technically dead code (`_supportsVT=false`), but the live `_run` path never touches the out-of-shell BottomNav/vignette, so no visible drag/flicker. Inert dead code, not an artifact.
3. **`expand-origin-stale-1`** (expand reads stale `--lior-open-x/y`) — REFUTED: useTileOpen writes vars + flag + calls navigate in four adjacent synchronous statements; the flag is consumed only by that same tap's navigate, so vars are never stale. NaN fallback unreachable for real taps.
4. **`insightwhisper-idle-popin-28`** (audit #28 idle pop-in) — REFUTED/MOOT: `InsightWhisper` has zero call sites (whole-tree grep finds only its own definition + docs); never mounted, so the feed reflow cannot occur.
5. **`memorytimeline-unfiltered-load-10`** (full reload on every storage event) — REFUTED as visible: real wasted CPU, but `React.memo` cards + stable keys + `AnimatePresence initial={false}` mean a new array wrapper causes no DOM mutation, no layout shift, no re-bloom. Honest non-finding (P3).
6. **`live3d-fallback-mount-swap-2`** (LiveBackground3D mount-then-swap) — REFUTED as visible: the frame-1 canvas is fully transparent (no GL context, no bg) over an identical underlying `<LiveBackground/>`, swapped for a pixel-identical static fallback on frame 2. On-screen pixels never change. Hygiene only.
7. **`us-wishlist-nested-presence-1`** (Wishlist `mode="wait"` child returns null → exit dead) — REFUTED: framer's `onlyElements` drops the `null` branch, so AnimatePresence always sees exactly one keyed child; the exit plays correctly. Equivalent to a single keyed child.
8. **`coachmark-presence-portal-child-1`** (Coachmark AnimatePresence children are portals → exit dead) — REFUTED: the direct children are valid `<SpotlightStep>`/`<CardStep>` *component elements* (pass `onlyElements`); presence bookkeeping is by React key + context, both portal-transparent, so exit/enter variants do play.
9. **`reveal-variants-recreated-1`** (Reveal recreates `variants` each render → restart) — REFUTED: framer 12.38 diffs *resolved value keys* and active *label strings*, never the variants object by reference; stable `hidden`/`visible` labels + stable `whileInView` IntersectionObserver mean no restart.
10. **`stagger-index-keys-1`** (Stagger keys children by index → remount replay) — REFUTED: the `Stagger` component has zero consumers (no import / no JSX anywhere); the index-key line never executes. Dead code.
11. **`useliorimage-warm-seed-present-1`** — ALREADY-FIXED (confirmation): `useLiorImage.ts:52-57` seeds `src`/`isLoading` synchronously from `mediaValueCache`; decode-before-display gate present (lines 81-87). Audit #3/7 live.
12. **`home-throttled-reload-present`** — ALREADY-FIXED (confirmation): `Home.tsx:435/440/471` wires `useThrottledReload(loadData)` on `storage-update`; N events/frame collapse to one `loadData`. Audit #10/26 live.
13. **`otd-h48-reserve-present`** — ALREADY-FIXED (confirmation): `Home.tsx:1016` computes `hasOtdImage` synchronously from Memory fields and gates the `h-48` box on it; height locked from first paint. Audit #12 live.
14. **`hero-countup-minwidth-reserve-present`** — ALREADY-FIXED (confirmation): `Home.tsx:769` reserves `minWidth` from the final `daysTogether` with `tabular-nums`; the "days" label never drifts. Audit #29 live.
15. **`insightwhisper-not-mounted`** — REFUTED/MOOT (dup of #4): both `InsightWhisper` and `InsightWhisperMini` have zero path-imports; only `InsightCard` is live (PartnerIntelligence). Dead code, not a live flicker. *(Relevant caveat for DEFER D-8.)*
16. **`premium-overlay-cold-blank-4`** (first open of a premium view shows a blank frame) — REFUTED: `navigateTo` preload-gates the lazy module (`App.tsx:576-611`) — `currentView` flips only after the module resolves, and the synchronous-thenable trick (`viewRegistry.tsx:48-59`) mounts in the same render pass. The previous screen stays painted during fetch; no blank frame.
17. **`goldgate-static-blur-children-5`** (GoldGate static blur re-rasterized by animating sibling) — REFUTED: the blur layer is a static sibling; transform/opacity animations on a sibling are GPU-composited and do not invalidate its cached raster. No per-frame repaint.
18. **`underlay-reflow-through-backdrop`** (keyboard padding snap visible through modal backdrop) — REFUTED: appending `padding-bottom` to `.lenis-content` (`flow-root`, `overflow-anchor:none`, `contain:paint`) only extends below-the-fold scroll height that is off-screen and occluded by the fixed `inset-0` backdrop; no above-fold content moves.
19. **`confirmmodal-blur-opacity-confirmed-ok`** (audit #23 flicker) — REFUTED as flicker: blur radius is a static literal, never interpolated per-frame; opacity-only fade is a smooth composite. (The perf-cost angle is the real D-10, kept in DEFER.)
20. **`text-home-hero-countup-reserved-29`** — ALREADY-FIXED (dup of #14): hero width reservation present and correct; `displayCount` rendered raw (no comma), so no jump.
21. **`text-countdowns-numberroll-restart-refuted`** (LiveCountdown per-second restart + digit drift) — REFUTED: stable `key`, byte-identical inline `animation` literal each render (no remount, no name change → no restart); `font-mono` falls back to system monospace + `padStart(2,'0')` = constant width. No JetBrains webfont loaded.
22. **`theme-color-meta-mismatch-1`** (static theme-color meta) — REFUTED for the named target: native Capacitor sets a transparent overlaying status bar (`nativeShell.ts:127-128`, `MainActivity.java:75-76`), so `<meta theme-color>` does not tint native chrome; the per-theme status-bar style is synced. Real only in plain Chrome/PWA, and there it's a persistent mismatch, not the claimed boot flash.
23. **`theme-transition-list-trimmed-ok`** — ALREADY-FIXED (confirmation): `index.css:181-182` transition list is `background-color, color, border-color, fill, stroke, opacity` only; `filter`/`backdrop-filter`/`box-shadow`/`background` correctly excluded. Audit #30 live.
24. **`ambient-world-blur-not-reintroduced-ok`** — ALREADY-FIXED (confirmation): `.lior-ambient-world` transitions opacity+transform only (root-fixes.css:165-192); no `filter:blur` on the live WebGL; guarded by `motionExperience.assert.mjs:96-107`. The 340ms-hitch fix is intact.

---

## 5. Architectural improvements (make flicker impossible)

These generalize this pass's clusters and extend the zero-flicker checklist in `docs/RENDERING_STABILITY_AUDIT.md` §3-4. Existing rules 1-12 still hold; this pass surfaced refinements and three NEW rules.

### Refinements to existing rules

- **Rule 1 (synchronous warm-cache seeding) — extend to *every hook in the chain*.** `useLiorMedia` seeds synchronously (✓), but its value is re-laundered through `useVideoBlobUrl` (A2.1) and per-cell thumbnail hooks (`DailyFilmStrip`, A2.2) that seed `useState(null)` and assign post-paint, re-opening the gap. **NEW corollary 1a:** *any* hook that consumes a warm value and re-derives a string must itself seed synchronously for the pass-through case (`useState(() => isPassThrough(src) ? src : null)`), and any per-item media must route through a module-level value cache — never a bare async IDB read with no warm-seed path.
- **Rule 3 (store-level event hygiene) — the `detail.table` filter is mandatory, not "where it can".** DinnerDecider (C2.1) was the lone unfiltered subscriber and it churned a freshly-allocated default array into derived state, wiping the spin winner on unrelated events. **NEW corollary 3a:** every `storage-update` subscriber MUST filter by `detail.table`; AND any cache getter that returns a default/empty fallback MUST return a *module-level stable reference* (never an array/object literal allocated per call), so React can bail on identical state.
- **Rule 4 (reserve layout before async content) — gate on a synchronous *metadata* predicate, never the resolved URL, and never render the reserved box unconditionally.** LetterCard (B2.4) and LetterReader (D-11) shift because the media box is gated on the resolved URL. The reserve predicate must be `!!(id || inlineData || storagePath)` (the pattern `SealedEnvelopeCard` already uses), and the box must be reserved *only when that predicate is true* — an unconditional reserved box changes the at-rest layout of content that has no media.
- **Rule 5 (font-metric stability) — the preload is half the fix.** Audit #11a (preload) shrinks the FOUT window; only a `size-adjust`/`ascent-override`/`descent-override` metric-matched `@font-face` removes the swap reflow (D-17). **NEW corollary 5a:** any layout box reserved in `ch`/`em` units over a webfont (the hero count-up `minWidth`) is itself font-metric-relative and resizes on the swap — so the metric-override fallback is a prerequisite for *every* `ch`-reserved counter, not just the headings.
- **Rule 9 (one-shot booleans in initializers) — applies to `prefers-reduced-motion` gating too.** The ambient WebGL promotion (D-7) gates only on `isLowPowerDevice()` and never consults `PerformanceManager.reducedMotion`. Reduced-motion is a one-shot capability check that must be read at the promotion decision point, exactly like WebGL support.

### NEW rules surfaced this pass

13. **Decode/poster before media paints (extends Rule 10 to `<video>` and CSS `background-image`).** A `<video>` thumbnail with no `poster` paints UA-black before its first frame (B2.1, B2.2); a CSS `background-image` swap decodes async and pops undecoded (D2.1). EVERY async-resolved media surface must either (a) carry a warm fill layer behind it, (b) set a `poster` from an available thumbnail blob, or (c) gate the swap on `img.decode()`/`onload`. Never let an undecoded `<video>`/`background-image` become the paint source over a contrasting background. **And never point an `<img>` at a video URL** (B2.3) — it not only fails to paint but can trip `useLiorMedia`'s `onError` into `setSrc(null)`, blanking the whole viewer.

14. **Bottom-anchored fixed sheets must subscribe to the keyboard model and reserve a stable height.** Overlay-keyboard sheets (`Keyboard.setResizeMode(None)`) do not get a WebView resize, and portaled `position:fixed` sheets escape the `.lenis-wrapper` reveal fallback (F2.1). Any such sheet MUST read `keyboardOpen`/`keyboardHeight` from `useNativeShell` and lift via `marginBottom`/`paddingBottom`. Separately, a bottom-anchored multi-step sheet whose steps differ in height teleports its top edge on each step (D-13) — reserve a stable min-height or animate height with `layout`; never let a bottom-pinned panel snap height across an atomic `mode="wait"` swap.

15. **Transitions clone the DOM, not GPU-backed bitmaps — keep live `<canvas>`/`<video>` out of the cloned subtree.** The primary `_run` transition deep-clones the active layer (D-6); `cloneNode` cannot copy a canvas backing store or a video frame, so in-route WebGL recedes as a blank rectangle. Heavy live media should live *outside* the cloned shell (sibling of `<main>`, like `AmbientVisuals`) or be rendered via `createPortal` (like the DailyMoments player) so it escapes the clone; routes that must keep inline live media should crossfade the container instead of deep-cloning. **Corollary:** `sourceCanvas.toDataURL()` snapshots are unreliable for R3F (default `preserveDrawingBuffer:false`) — do not rely on them.

### Additional checklist gates (append to §4 of the audit doc)

- [ ] No hook that consumes a warm-cache value re-seeds `useState(null)` and assigns the pass-through value only in a post-paint effect (seed the pass-through case in the initializer).
- [ ] Every per-item media thumbnail routes through a module-level value cache with a synchronous warm-seed (no bare async IDB read that always pulses/blinks first).
- [ ] Every `storage-update` subscriber filters by `detail.table`.
- [ ] Every cache getter returns a stable module-level reference for its default/empty fallback (no per-call literal).
- [ ] No `<video>` thumbnail/hero renders without a `poster` or a warm fill layer behind it; no CSS `background-image` swaps without a decode gate; no `<img>` is ever pointed at a video URL.
- [ ] Async-resolved media boxes are reserved from a synchronous *metadata* predicate and only when that predicate is true (text-only content keeps its at-rest layout).
- [ ] Reduced-motion (`PerformanceManager.reducedMotion`) is consulted at every expensive-visual promotion / animation decision, not only in CSS.
- [ ] Bottom-anchored fixed sheets read `keyboardOpen`/`keyboardHeight` and reserve a stable height across step changes.
- [ ] Heavy live `<canvas>`/`<video>` is kept out of any deep-cloned transition subtree (sibling-of-shell or portal), or the route crossfades instead of cloning.
- [ ] `ch`/`em`-reserved counter boxes over a webfont are paired with a metric-override fallback face.
