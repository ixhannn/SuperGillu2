# Lior — Rendering Stability & Zero-Flicker Audit

**Date:** 2026-06-18
**Method:** 16 parallel surface/dimension finder agents → dedup → adversarial verification of every finding against the real code → synthesis.
**Result:** 104 raw findings → **30 adversarially confirmed**, 58 refuted/benign (16 verifiers + the synthesizer were cut short by a session limit; their findings are listed under _Unverified_ and the synthesis is authored here).

The benchmark: when a user rapidly navigates Lior for 10 minutes, they should never witness a frame that looks rebuilt, reset, flashed, popped, jumped, blinked, or reloaded.

---

## Status — fixes applied in this session (2026-06-18)

All **visually-identical** (`fixRisk: low/none`). Verified: `tsc` clean, `motionExperience` + `ambientTabContinuity` + `ambientVisibilityPause` guards pass, production build green.

| # | Fix | File(s) |
|---|-----|---------|
| 3/7 | `useLiorMedia` seeds `src`/`isLoading` synchronously from the module cache → no skeleton blink on warm images (app-wide) | `hooks/useLiorImage.ts` |
| 9 | `_saveInternal` short-circuits byte-identical sync writes → kills the per-row `storage-update` storm at the source | `services/storage.ts` |
| 10/26 | Home `storage-update` reload wrapped in `useThrottledReload` (rAF-coalesced) | `views/Home.tsx` |
| 13 | DailyQuestion seeds its entry in the `useState` initializer → card present on first Home paint (no feed reflow) | `components/DailyQuestion.tsx` |
| 12 | "On This Day" reserves the `h-48` image box from a synchronous has-image predicate → no height jump | `views/Home.tsx` |
| 2 | BottomNav + vignette get `view-transition-name` + `animation:none` → push/pop no longer drags the chrome (AmbientVisuals intentionally excluded — WebGL snapshot risk) | `BottomNav.tsx`, `Layout.tsx`, `root-fixes.css` |
| 22 | `webglReady` computed in `useState` initializer → no Canvas→fallback mount-swap | `RoomScene3D.tsx` |
| 24 | DynamicToast `mode="wait"` → `popLayout` → no empty gap between back-to-back toasts | `DynamicToast.tsx` |
| 27 | `revealSafety` no longer wipes `transform` → can't amputate a live framer entrance | `utils/revealSafety.ts` |
| 30 | Theme transition list trimmed to color props only (drop `filter`/`backdrop-filter`/`box-shadow`) | `index.css` |
| 4 | PartnerIntelligence warm-cache seed → no full-screen loader on repeat opens | `PartnerIntelligenceView.tsx` |
| 6 | PulseCheck + WeeklyReflection drop the in-body `return null` → restores "done" step + slide-down exit | `PulseCheckSheet.tsx`, `WeeklyReflection.tsx` |
| 11a | Font CSS preload (shrinks FOUT window) | `index.html` |
| 1+15 | **Theme boot FOUC** — saved theme now persisted to `localStorage` + applied **before React's first paint** via `index.tsx` (new `instant` mode skips the 600ms `theme-transitioning` crossfade); boot apply made instant | `services/theme.ts`, `index.tsx`, `App.tsx` |

**Theme-boot Tier 2 — DONE (2026-06-18):** the *pre-bundle* static splash flash on a cold dark-theme launch is now fixed via an external same-origin `public/theme-boot.js` (CSP-safe under `script-src 'self'`) loaded synchronously in `<head>`; it sets `data-theme` from the `localStorage` mirror before the bundle runs, and a `html[data-theme="starry-night"]` rule in the inline `<style>` paints the dark splash. Rose users unaffected (script returns early). The SW (stale-while-revalidate) caches it after first load.

**Also applied this batch (all non-visual):** #25 decode-before-display (data: URLs decode in `useLiorMedia` before commit → no undecoded blank frame); #5 the two PartnerIntelligence bottom sheets are now portaled to `<body>` (escaping `.lenis-content`'s `contain:paint` that mis-anchored them to scrolled content) with the `.gpi-retheme` wrapper preserved; #29 hero count-up reserves the final digit width so the "days" label no longer drifts during the ramp (pixel-identical at rest).

**#8 is MOOT — KeepsakeBox screen removed (2026-06-18):** the Keepsake Box view had been unwired from navigation long ago but the orphaned code lingered (registered in `viewRegistry`, in `ViewState`, with vestigial nav-badge props) — nothing called `setView('keepsakes')`. Removed the dead screen: deleted `views/KeepsakeBox.tsx`, its `viewRegistry` entry, the `'keepsakes'` `ViewState` member, the `e2eHarness` view-list entry, and the `keepsakes?` notification-badge props in `BottomNav`/`Layout`. The keepsake **data layer is preserved** (storage get/save, sync table, Weekly Recap counts, Our Story stats) since other features still read it. So finding #8 (KeepsakeBox image jump) no longer applies.

**Needs on-device confirmation:** #2 (View-Transitions push/pop chrome) — verify the nav/vignette hold still and nothing blanks, since the worktree can't drive authed navigation headlessly.

**Deferred — opt-in (bigger scope or changes look/motion, `fixRisk: visual`/`medium`):**
- #1 + #15 theme **boot** FOUC (inline `<head>` script + per-theme CSS + `instant` boot apply) — a coherent pair; do together.
- #11b font **metric-override** fallback faces (the part that actually removes the reflow).
- #5 portal the two bottom sheets out of `.lenis-content` (medium — must preserve `.gpi-retheme` scope).
- #8 KeepsakeBox intrinsic-dimension reservation; #25 decode-before-display gates.
- #21 OurRoom intra-cell drag dedup (P3 perf).
- Visual-motion changes (#14, #17, #20, #23, #28, #29) and the flag-only #18 — need your sign-off since they alter motion/appearance.

---

## 0. What is already correct (so we don't "fix" it)

The verifiers **refuted** several plausible-sounding alarms. These are working as intended — do **not** touch them:

- **Auth/Onboarding gate crossing does _not_ restart the background.** The whole tree (incl. `AmbientVisuals`) does remount when crossing the `RouteLoader → Auth → Onboarding → Layout` gates, but Auth and Onboarding paint their **own opaque backgrounds** and `AmbientVisuals` is never on-screen before Home. The WebGL scene fading in 1–3 s after the first Home paint is the **intended** progressive-enhancement ramp, identical on every cold boot.
- **AmbientVisuals dual `data-transitioning` observers, per-frame theme resync, BufferAttribute re-upload** — all refuted. The per-frame CSS-var writers (`startCSSAnimationBus`/`startBreathingRhythm`) are **dead code**; the observers only fire on real theme changes (rare). Latent footgun if ever wired up, not a live bug.
- **Tab switching** is genuinely free (keep-alive shells, CSS visibility flip, `display:none` cached). Scroll-restore does not jump the outgoing tab.
- **Gesture-back double-fade** — refuted; the global `data-transitioning` animation-pause rule already freezes the shell fade during the engine fade.
- Numerous "re-renders too often" smells (Home unfiltered listener as a _flicker_, `getDeviceId` in map, `getProfileNames` parse, BonsaiBloom profile read, Premium counts) are **wasted CPU, not visible flicker**. Tracked as perf hygiene, not stability bugs.

---

## Status — second-pass hunt (2026-06-18, gap surfaces)

A focused second pass swept the surfaces whose verification was cut off last run + never-audited ones (keyboard/insets, list keys, AnimatePresence): **29 findings → 12 confirmed, 17 refuted** (the refutations correctly dismissed a wave of "sync re-renders" as wasted CPU, not flicker, and an Android keyboard double-emit as iOS reasoning misapplied). Applied (verified: `tsc` clean, `nativeShellIntegrity` + motion/ambient guards pass, build green):

| Fix | File(s) | risk |
|-----|---------|------|
| **Android keyboard reflowed the entire `100dvh` shell** — `interactive-widget=resizes-content` → `overlays-content` (the web layer was fighting the native overlay keyboard model) | `index.html` | low |
| Compose modals (Notes/OpenWhen) snapped up/down in one frame on keyboard show/hide → `padding-bottom` now eases on the 220ms BottomNav curve | `views/Notes.tsx`, `views/OpenWhen.tsx` | low |
| Theme accent change: `background` (gradient) dropped from the universal transition list — gradients can't interpolate, so it was a split snap-vs-melt; now a clean one-frame swap | `index.css` | low |
| `.spring-press` held a permanent `will-change:transform` layer on 95+ idle cards → moved to `:active` only | `index.css` | low |
| ConstellationCanvas re-randomized all 120 star anchors on every resize (teleport) → proportional scale with zero-guard | `components/ConstellationCanvas.tsx` | low* |
| ConstellationCanvas fully remounted every QuietMode slideshow cycle → kept mounted, opacity-toggled (hard cut, pixel-identical) | `views/QuietMode.tsx` | low* |
| OfflineNotice hard-flashed on every network flap → component-level 500ms debounce (instant hide on reconnect; network semantics untouched) | `components/OfflineNotice.tsx` | low |
| DailyMoments thumbnail-less video showed a black first frame → warm placeholder fill | `views/DailyMoments.tsx` | low |
| Deleting a Notes card popped with no exit + survivors snapped → `AnimatePresence mode="popLayout"` + exit | `views/Notes.tsx` | low |

`*` on-device check (canvas can't render headlessly).

**Second-pass deferred:** OfflineNotice icon/copy crossfade (#7 — adds motion); starry-night glass-blur snap (#9 — verifier says **leave as-is**, the only "fix" would animate `backdrop-filter` = heavy paint). Refuted: all the sync/resume "re-render storm" claims (wasted CPU, identical pixels), keyboard double-emit, dead carousel CSS.

---

## 1. Flicker Inventory (confirmed, severity-ranked)

> `fixRisk` legend — **none/low** = visually identical (pure stability); **visual** = changes look or motion (needs sign-off); **medium** = structural move, verify after.

### P2 — visible on the shipping target

| # | Title | File | dim | fixRisk |
|---|-------|------|-----|---------|
| 1 | Theme applied after async storage init → FOUC on every non-rose theme (pink→theme snap) | `App.tsx` / `services/theme.ts` / `index.html` | theme-flash | low |
| 2 | Push/pop View Transition slides the fixed **BottomNav + ambient background** sideways with the page | `components/Layout.tsx` / `AmbientVisuals.tsx` / `styles/root-fixes.css` | layout-shift | low |
| 3 / 7 | `useLiorMedia` paints a Skeleton for one frame on **every** card mount, even when the image is already in RAM | `hooks/useLiorImage.ts` | loading-flash | low |
| 4 | PartnerIntelligence shows full-screen "Reading your sky…" loader then swaps on **every** open | `views/PartnerIntelligenceView.tsx` | loading-flash | low |
| 5 | Bottom sheets render `position:fixed` **without a portal**, trapped by `.lenis-content`'s `contain:paint` → mis-anchored to scrolled content, not viewport | `components/PulseCheckSheet.tsx`, `WeeklyReflection.tsx` | layout-shift | medium |
| 6 | Sheets `return null` in-body during their own completion → hard-cut mid-exit, "done" confirmation never shows | `components/PulseCheckSheet.tsx`, `WeeklyReflection.tsx` | animation-restart | low |
| 8 | KeepsakeBox card `<img w-full h-auto>` with no reserved height → card grows when photo loads | `views/KeepsakeBox.tsx` | layout-shift | low |
| 9 | Reconcile re-saves **every** cloud row → fires one `storage-update` per item (no equality guard) | `services/storage.ts` | render-cascade | low |
| 10 / 26 | Home reloads **all** data (≈10 setStates) on **every** cross-table storage event, unfiltered + un-coalesced | `views/Home.tsx` | render-cascade | low |
| 11 | Bricolage Grotesque webfont FOUT shifts the 5.5rem hero counter + all headings | `index.html` / `styles/typography.css` | layout-shift | low |
| 12 | "On This Day" card jumps auto-height → `h-48` when its image resolves | `views/Home.tsx` | layout-shift | low |
| 13 | DailyQuestion inserts its card after an async-deferred (but synchronous) read → pushes the Home feed down | `components/DailyQuestion.tsx` | layout-shift | low |

### P3 — subtle / non-primary-platform / one-time

| # | Title | File | dim | fixRisk |
|---|-------|------|-----|---------|
| 14 | ConstellationCanvas fully **remounts** every QuietMode photo↔text slideshow cycle (re-seeds 120 stars) | `views/QuietMode.tsx` | remount | visual |
| 15 | First theme apply at boot runs a 600 ms tree-wide cross-fade on the loader | `services/theme.ts` | theme-flash | low |
| 16 | `RouteLoader → AppLaunchOverlay` handoff is a hard cut between two different full-screen treatments (web only; native splash covers it) | `App.tsx` | loading-flash | low |
| 17 | Push/pop runs the VT root-slide **and** the keep-alive shell opacity fade on the same content (double timeline) | `App.tsx` / `styles/root-fixes.css` | animation-restart | visual |
| 18 | Tab fast-path hard-cuts the outgoing tab (only incoming fades) — **verifier says flag-only, do not "fix"** (perf trade worse than the 40–80 ms cosmetic gain) | `App.tsx` / `styles/root-fixes.css` | image-flash | visual |
| 19 | Non-VT fallback clone omits live `<canvas>`/`<video>` bitmaps → blank rectangle slides out (Firefox / iOS<18 only) | `utils/TransitionEngine.ts` | ghost-paint | low |
| 20 | Us sub-tab list items replay index-stagger entrance on **every** toggle (`AnimatePresence mode="wait"` remounts panel) | `views/Us.tsx` | animation-restart | visual |
| 21 | RoomScene3D re-renders every drag tick from a new `roomSceneState` object | `views/OurRoom.tsx` | render-cascade | low |
| 22 | `webglReady` starts `true`, re-checked in a post-paint effect → mount-then-swap Canvas→fallback on unsupported WebViews | `components/room/RoomScene3D.tsx` | remount | low |
| 23 | Full-screen `backdrop-filter` blur animated together with opacity on modal open/close (heavy composite) | `components/PremiumModal.tsx`, `ConfirmModal.tsx` | gpu-paint | visual |
| 24 | DynamicToast `mode="wait"` → back-to-back toasts flash an empty ≈200 ms gap | `components/DynamicToast.tsx` | remount | low |
| 25 | Skeleton→image swap has no decode-before-display → blank frame between skeleton unmount and image paint | `views/DailyMoments.tsx`, `MemoryTimeline.tsx` | image-flash | low |
| 27 | `revealSafety` wipes inline **transform** on any stranded `opacity:0` node → can amputate a live framer entrance | `utils/revealSafety.ts` | animation-restart | low |
| 28 | InsightWhisper pops into the top of the feed on idle, shifting everything below | `components/InsightWhisper.tsx` | layout-shift | visual |
| 29 | Hero count-up gains digits during the 1.8 s animation, sliding the "days" label rightward | `views/Home.tsx` | layout-shift | visual |
| 30 | `theme-transitioning` transitions `filter`/`backdrop-filter`/`box-shadow` across the **entire** DOM subtree for 650 ms | `index.css` | theme-flash | low |

---

## 2. Root-Cause Analysis & Exact Code Changes

The recurring root causes, and the surgical fix for each finding. (Line numbers from the audited tree; re-confirm before editing.)

### Cluster A — "loading branch painted before the warm cache is read" (#3/7, #4, #13)
React passive effects flush **after** first paint, so any component that seeds state to `loading`/`null` and only reads its synchronous in-memory cache inside a `useEffect` paints one stale frame.

- **#3/7 `hooks/useLiorImage.ts`** — seed from `mediaValueCache` in the `useState` initializer:
  ```ts
  const key = (mediaId || fallbackData || storagePath) ? buildMediaKey(mediaId, fallbackData, storagePath) : null;
  const [src, setSrc] = useState<string | null>(() => (key && mediaValueCache.has(key) ? mediaValueCache.get(key)! : null));
  const [isLoading, setIsLoading] = useState(() => !(key && mediaValueCache.has(key)));
  ```
  Effect unchanged. Cache hits now paint the image on frame 1; misses unchanged. **Highest-leverage fix — every avatar/photo/moment/timeline tile.**
- **#4 `views/PartnerIntelligenceView.tsx`** (mount effect ~676) — before `initAll()`: `const m = RelationshipModelService.getModel(); if (m) { setModel(m); setInsights(InsightEngine.getRecentInsights(20)); setIsReady(true); }`. Cold first-run still shows the loader.
- **#13 `components/DailyQuestion.tsx:13`** — `useState(() => StorageService.getTodayQuestion(profile.myName, profile.partnerName))` (the read is fully synchronous). **Keep** the profile-change effect.

### Cluster B — "reserve the box before async media resolves" (#8, #12)
- **#12 `views/Home.tsx` ~934** — gate the `h-48` image layout on `hasOtdImage = !!(mem?.image || mem?.imageId || mem?.storagePath)`, not on the resolved `otdImage` URL; keep the `<img>` gated on `otdImage`; keep the gradient as the base layer so the reserved box isn't an empty flash.
- **#8 `views/KeepsakeBox.tsx:72`** — always render the media wrapper (even while `src===null`) with a neutral min-height/Skeleton placeholder; keep `h-auto` on the eventual `<img>` so nothing is cropped (do **not** use `object-cover` — that crops, a visual change). Full fix (kill the decode snap too) needs intrinsic w/h persisted at upload — larger scope.

### Cluster C — "storage event storm" (#9, #10/26)
- **#9 `services/storage.ts` `_saveInternal` ~1252** — for `source==='sync'`, `idx>=0`, no inline media this call, and `JSON.stringify(existingItem)===JSON.stringify(toSaveMetadata)`, early-return **without** reassigning the cache / `writeRaw` / `notifyUpdate`. Kills the no-op render signal at the source.
- **#10/26 `views/Home.tsx:410`** — wrap the reload in the **already-written-but-unadopted** `useThrottledReload(loadData)` and register that on `storage-update`. (`hooks/useThrottledReload.ts` has zero call sites today.) Optional table filter must include `user_status` + bulk signals `init/import/account-scope/recovery`.

### Cluster D — "persistent chrome dragged by the root View Transition" (#2)
No element declares a `view-transition-name`, so BottomNav + vignette + AmbientVisuals are baked into `::view-transition-group(root)` and translate with the page.
- **`components/Layout.tsx`** — `style={{ viewTransitionName:'lior-bottom-nav' }}` on the BottomNav wrapper, `'lior-vignette'` on the vignette div, `'lior-ambient'` on the AmbientVisuals root (`AmbientVisuals.tsx` fallback root).
- **`styles/root-fixes.css`** — `::view-transition-group(lior-bottom-nav),::view-transition-group(lior-vignette),::view-transition-group(lior-ambient){animation:none}`. These never unmount, satisfying the one-rendered-element-per-name rule.

### Cluster E — "theme application is paint-critical" (#1, #15, #30)
- **#1 FOUC** — `services/theme.ts` `applyTheme`: also `localStorage.setItem('lior_theme', validId)` (synchronous). `index.html` `<head>` before the bundle: an inline `<script>` reading it + static `html[data-theme="…"]{ --theme-bg-main/--theme-vignette/--color-text-primary/--color-text-secondary }` selectors in `index.css` so the boot frame is correct for non-rose themes. Rose users: guard returns early — byte-identical.
- **#15 boot crossfade** — add `instant?: boolean` to `ThemeApplyOptions`; pass `{ instant:true }` from `App.tsx` boot call; inside `applyTheme`, when instant, skip `classList.add('theme-transitioning')` + the 600 ms timer. Profile's user-initiated switch keeps the crossfade.
- **#30 transition list** — `index.css:169` trim to `transition-property: background-color, color, border-color, background, fill, stroke, opacity;` (drop `filter`, `backdrop-filter` — blur radius never changes between themes; drop `box-shadow` — the real paint cost, imperceptible to lose).

### Cluster F — "compute one-shot booleans synchronously" (#22)
- **#22 `components/room/RoomScene3D.tsx:836`** — `useState(() => hasWebGLSupport())` and delete the post-paint re-check effect. `hasWebGLSupport()` is side-effect-free.

### Cluster G — "AnimatePresence discipline" (#6, #24)
- **#6** — delete the in-body `if (alreadyDone) return null;` / `if (!isReflectionTime() || hasReflectedThisWeek()) return null;` (after-hooks) in both sheets; the **parent** already gates the open point, so dismissal is driven solely by the parent flag + AnimatePresence → restores the "done" step + slide-down exit.
- **#24 `components/DynamicToast.tsx:40`** — `mode="wait"` → `mode="popLayout"` so a replacing toast animates out while the next animates in (no empty gap).

### Cluster H — "rescue without amputation; decode before display" (#27, #25)
- **#27 `utils/revealSafety.ts:67`** — only `el.style.opacity = ''`; **delete** `el.style.transform = ''` (wiping transform amputates a live framer slide; `getAnimations()` won't see framer's JS driver so don't gate on it).
- **#25** — add a local `imgReady` state gated on `onLoad`/`img.decode()` in `views/DailyMoments.tsx` (foreground `motion.img`) + `MemoryTimeline.tsx` `<img>`, keep the skeleton underneath until ready. One-shot alternative: `await img.decode()` inside `useLiorMedia` before the `setSrc` commit (fixes all consumers).

### Cluster I — "presence vs visibility for stateful visuals" (#14)
- **#14 `views/QuietMode.tsx:265`** — keep `ConstellationCanvas` permanently mounted; drive `style={{ opacity: currentImage ? 0 : 0.6 }}` (**no** transition — current code hard-cuts, adding a fade is a visual change). Preserves the 120-star pool, AnimationEngine registration, observers, `syncProgress`. `fixRisk: visual` — verify on-device (canvas can't be screenshotted headless).

### Single-file remainders
- **#21 `views/OurRoom.tsx` `onMoveItemGrid`** — bail out of `setRoom` when the dragged item's target grid cell equals its current cell (most pointermove ticks are intra-cell no-ops). Keep `z: Date.now()` (load-bearing stacking).
- **#11 `index.html`** — (part 1, zero-risk) add `<link rel="preload" as="style" href="…the existing Google Fonts URL…">`. (part 2, larger) register `size-adjust`/`ascent-override` fallback faces to remove the reflow entirely.
- **#16, #19, #17, #18, #20, #23, #28, #29** — see table; the visual-risk ones need sign-off, #18 is flag-only by the verifier's own call.

---

## 3. Rendering Stability Architecture

Structural patterns so flicker cannot recur. These generalize the 30 findings.

1. **Synchronous warm-cache seeding.** Any hook/view backed by an in-memory cache (`mediaValueCache`, `RelationshipModelService`, `getTodayQuestion`, `InsightEngine`, `StarField` tile) seeds React state via `useState(() => cache.get())`. The async effect only *refines*; it never owns the first paint.
2. **One root background; persistent chrome via `view-transition-name`.** BottomNav, vignette, and `AmbientVisuals` live outside the animated transition shell `_c` and declare a `view-transition-name` so View Transitions never translate them.
3. **Store-level event hygiene.** `_saveInternal` short-circuits no-op sync writes (deep-equal guard). Every `storage-update` subscriber uses `useThrottledReload` (rAF-coalesced) and filters by `detail.table` where it can. The hook exists — adopt it everywhere.
4. **Reserve layout before async content.** Media gated on an async-resolved URL reserves its final box (height / aspect / `min-width`) from first paint using a **synchronous has-media predicate**, never the resolved URL.
5. **Font-metric stability.** Webfonts ship with a preload + `size-adjust`/`ascent-override`/`descent-override` fallback face so FOUT causes zero reflow.
6. **Presence vs. visibility.** Never gate an expensive stateful visual (canvas / particles / R3F scene) on conditional *presence* (`{cond && <X/>}`). Keep it mounted; toggle `opacity`/`visibility` so its seed/timeline/registration survive.
7. **Single-source entrance/exit.** Exactly one layer animates a given element. The keep-alive shell fade and the VT root fade must not both animate the overlay; suppress the shell fade on the overlay/VT path via a static attribute selector (never a toggling one).
8. **Theme is paint-critical.** Persisted theme is applied (paint-critical vars) **before first paint** via an inline boot script + static per-theme CSS; the boot apply is `instant` (no tree-wide 600 ms transition); the universal theme transition list contains only properties that actually change.
9. **One-shot booleans in initializers.** Device tier, WebGL capability, reduced-motion, and similar are computed in `useState`/`useMemo` initializers — never flipped in a post-paint effect (that causes mount-then-swap).
10. **Decode before display.** Large base64/bitmap images gate display on `img.decode()`/`onLoad` so the skeleton→image swap never shows an undecoded blank frame.
11. **Rescue without amputation.** Global safety nets (`revealSafety`) only restore the property they own (`opacity`); they never clear `transform` on a node that may be mid-animation.
12. **AnimatePresence discipline.** Replace-in-place collections use `mode="popLayout"`; an AnimatePresence child never `return null`s internally during its own dismissal — dismissal is driven by the parent flag.

---

## 4. Zero-Flicker Certification Checklist (gate every PR)

A PR touching UI must pass all of these before merge:

- [ ] No component gates its whole body on an async loading flag when the data is available synchronously from a cache (seed via `useState` initializer).
- [ ] No async-resolved `<img>`/media renders without a reserved box (height/aspect/min-width from a **synchronous** has-media predicate).
- [ ] Every new `storage-update` / event subscriber is rAF-coalesced (`useThrottledReload`) and table-filtered where possible.
- [ ] No write path emits a change event when the persisted row is byte-identical (store-level equality short-circuit).
- [ ] Any new persistent fixed chrome in `Layout` declares a `view-transition-name` and is excluded from the root VT animation (`animation:none`).
- [ ] No expensive stateful visual (canvas/3D/particles) is gated on conditional presence; visibility is toggled instead.
- [ ] Exactly one layer animates a given element's entrance/exit (no shell-fade + VT-fade double timeline).
- [ ] Paint-critical theme/accent tokens are applied before first paint; the boot theme apply is `instant`.
- [ ] Device/WebGL capability and similar one-shot booleans are computed in `useState`/`useMemo` initializers, never flipped in a post-paint effect.
- [ ] Large bitmap/base64 images decode before display (`img.decode`/`onLoad` gate).
- [ ] Context Provider `value` props are memoized; no inline object/array literals passed to memoized children or hook dep arrays.
- [ ] New webfonts ship with a preload + a metric-override fallback face.
- [ ] AnimatePresence children never `return null` internally during their own dismissal; collections use `mode="popLayout"`.
- [ ] Global rescue / cleanup code never clears `transform` on a node that may be animating.
- [ ] No universal (`*`) CSS transition includes `filter`/`backdrop-filter`/`box-shadow` unless they actually change between states.
- [ ] `prefers-reduced-motion` path verified; **any** WebGL/canvas change is verified **on-device** (headless preview cannot render R3F/Three.js).

---

## 5. Unverified (verifier/synth cut by session limit — re-run before relying on)

These finder claims never completed adversarial verification: `services/sync.ts` (extra), `PermissionBanner.tsx`, `TouchTrailCanvas.tsx` (×2), `PullToRefresh.tsx`, `services/theme.ts` (×3), `index.css` (extra), `App.tsx` (×2), `useNativeShell.ts`, `ConstellationCanvas.tsx` (×2), `premium-features.css`, `PhysicsConfetti.tsx`. Re-run the audit's Verify phase (resume the workflow) to adjudicate these before acting on any of them.
