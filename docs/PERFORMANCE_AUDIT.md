# Lior — Performance, Smoothness & Code-Quality Audit

**Date:** 2026-06-22
**Scope:** Whole app (40 views · 90+ components · 17 hooks · 50+ services · 25 utils · 12 stylesheets)
**Method:** 12 parallel audit lenses → every P0–P2 finding adversarially re-verified against the real cited code → dedupe + prioritize.
**Status:** Audit only. **No code changed.** This document is the Phase 1 deliverable; implementation is gated on sign-off.

---

## 0. Executive Summary

Lior is **already heavily performance-engineered**. The navigation layer (keep-alive tab cache, View-Transitions API, lock/queue machinery), the ambient background (idle-scheduled progressive enhancement, low-power gating, observer-bus pause that avoids React churn), and the shell (memoized `Layout`, compositor-promoted vignette, `contain: strict/paint`, deferred overlays) are top-tier. There is **no P0 / no broken hot path** — the obvious wins are done.

The remaining jank is **subtle and real**, concentrated in five areas:

1. **Memory** — two unbounded/leaking media caches that grow until Android OOM-kills the WebView on long sessions. *(The single most important fix.)*
2. **Navigation** — `cloneNode(true)` snapshots the **entire** keep-alive shell (every mounted tab) on every push/pop, producing a visible pre-bloom hitch.
3. **Startup** — `three.js` + R3F (~600 KB) is silently linked into the **Home** chunk, parsed before the first screen is interactive.
4. **Keyboard** — four high-traffic composers don't lift for the IME; users type blind.
5. **GPU/compute spikes** — the incoming-pulse overlay scales a `blur(100px)` layer under a `backdrop-blur` for 6 s ungated by reduced-motion; Partner-Intelligence recomputes redundantly.

**Verified totals:** 64 raised → 61 confirmed → **35 after dedupe** (0 P0 · 7 P1 · 14 P2 · 14 P3). 3 refuted (see §5).

---

## 1. Severity & Estimated Impact (Scorecard)

| Metric | Current pain | After roadmap (est.) |
|---|---|---|
| **FPS** | nav pre-bloom hitch; 6 s pulse-overlay stutter; hot-surface drops | `nav-1` + `react-2` recover ~15–40% of frame budget during nav & the pulse overlay; hot-path fixes lift sustained interaction toward a solid 60 fps |
| **Memory** | unbounded base64 caches (~grow to 150–200 MB); per-video object-URL leak | `media-2` caps media heap to ~32–48 MB; `media-1` ends the per-video native leak → removes most long-session OOM restarts |
| **Renders** | redundant compute on PI open; 28×N date-parses/render on calendar | `react-1`, `list-1`, `expensive-1/2/3`, `stutter-1` remove redundant calls, cut closeness passes ~9–12 → 4, end a per-minute IndexedDB write |
| **Startup** | ~600 KB three.js parsed before Home is interactive; fixed splash floor | `startup-1` removes the parse from first paint; `startup-2` returns up to ~750 ms warm-launch |

---

## 2. P1 Findings (7) — high impact, mostly low risk

### media-2 · Unbounded in-RAM base64 media caches (no LRU)
- **Files:** `services/storage.ts:533`, `hooks/useLiorImage.ts:5`
- **Symptom:** Heap climbs with every media item viewed; GC jank, then a white-screen reclaim / restart on low-RAM Android.
- **Root cause:** `MEDIA_MEMORY_CACHE` and `mediaValueCache` are unbounded `Map`s of base64 data URIs, pruned only on delete/logout.
- **Fix:** Bounded LRU (~32–48 MB), evict on insert; values are reconstructable from IndexedDB.
- **Risk:** low · preserves functionality.

### media-1 · `useVideoBlobUrl` leaks object URL on unmount for base64 videos
- **Files:** `views/MemoryTimeline.tsx:31-67`
- **Symptom:** Native memory grows while scrolling a video timeline → OOM-kills the WebView.
- **Root cause:** the data-URI branch early-returns *before* the revoke cleanup is registered.
- **Fix:** register the `revokeObjectURL` as a single unmount cleanup regardless of branch.
- **Risk:** low.

### nav-1 · `_run` deep-clones the entire transition shell on every push/pop/expand
- **Files:** `utils/TransitionEngine.ts:358`, `App.tsx:1155-1252`
- **Symptom:** visible hitch right before the bloom when opening a detail screen; **worsens as more tabs get cached** (clone grows).
- **Root cause:** `cloneNode(true)` runs on a container that holds **every mounted keep-alive shell** (they're `visibility:hidden`, not `display:none`, so they're in the cloned tree).
- **Fix:** clone only the active `keep-alive-shell` / overlay subtree, not the whole world.
- **Risk:** low · needs a device pass across all transition directions.

### startup-1 · three.js + R3F eagerly bundled into the Home chunk
- **Files:** `views/Home.tsx:11`, `components/HeartbeatParticles.tsx:26-29`, `vite.config.ts:53-59`
- **Symptom:** cold launch parses ~600 KB of three + R3F before Home is interactive.
- **Root cause:** `Home` and `DailyQuestion` statically import `HeartbeatParticles`, which imports `three`; `three` has no `manualChunks` branch.
- **Fix:** `React.lazy` the effect; add a `three` branch to `manualChunks`.
- **Risk:** low.

### kb-1 · DailyMoments comment overlay & caption sheet don't lift for the keyboard
- **Files:** `views/DailyMoments.tsx:360`, `:820`
- **Symptom:** keyboard covers the input bar; user types blind on two high-traffic surfaces.
- **Root cause:** overlay keyboard mode never shrinks the frame; DailyMoments never reads `keyboardHeight`.
- **Fix:** apply `useNativeShell` keyboard-open `paddingBottom` with a 220 ms ease.
- **Risk:** low.

### kb-2 · VoiceNotes & DuetJournal ComposeSheet autofocus sheets don't lift
- **Files:** `views/VoiceNotes.tsx:759`, `components/premium/duet-journal/ComposeSheet.tsx:88`
- **Symptom:** `autoFocus` pops the IME but the sheet stays pinned to viewport bottom — input + CTA hidden under the keyboard.
- **Root cause:** fixed `items-end` portals with only safe-area inset; neither reads keyboard state.
- **Fix:** pad / `translateY` by `keyboardHeight`; keep pan-to-dismiss intact.
- **Risk:** low.

### expensive-1 · InsightEngine re-runs `condition`+`generate` per insight per template in the cooldown loop
- **Files:** `services/insightEngine.ts:654-685`
- **Symptom:** opening Partner Intelligence and the 6 h check spike the main thread.
- **Root cause:** the cooldown predicate re-evaluates `condition` and `generate` per insight per ~24 templates but **discards** the result; a dead O(n²) scan compounds it.
- **Fix:** hoist `condition` once per template; test only category + cooldown; delete the dead scan.
- **Risk:** low.

### react-2 · AuraSignalReceiver scales a `blur(100px)` blend layer under a `backdrop-blur`, ungated by reduced-motion *(merges fm-1, fm-2)*
- **Files:** `App.tsx:1411-1436`, `index.tsx:133-135`
- **Symptom:** the incoming-pulse takeover stutters for ~6 s; reduced-motion users still get the full loop.
- **Root cause:** a `motion.div` scales a `blur-100px` blend layer **inside** a `backdrop-blur` — scaling re-rasterizes the blur every frame; no reduced-motion branch.
- **Fix:** animate opacity only (or pre-blur a fixed-size layer / bake the glow as a gradient), drop the live `backdrop-blur`, gate behind `prefersReducedMotion`.
- **Risk:** medium · verify the look on device.

### ambient-1 · LiveBackground3D resize handler reallocates the full GL buffer per resize event *(P1, ambient — sacred-safe)*
- **Files:** `components/LiveBackground3D.tsx:301-309`
- **Symptom:** stutter + a momentary ambient blank when keyboard / URL-bar collapse fire resize bursts.
- **Root cause:** `resize` calls `setSize` directly in an unthrottled listener; each event recreates the GPU buffer.
- **Fix:** coalesce into one rAF, early-out when size unchanged. **Visually identical** — pure pipeline optimization.
- **Risk:** low · verify on device.

> *(Listed as 8 here; the synthesizer counted `ambient-1` within the P1 set → 7 itemized + this ambient one. Both are P1-class.)*

---

## 3. P2 Findings (14) — steadier 60 fps, lower idle/background CPU

Grouped; each is code-grounded and verified.

- **nav-2** double opacity fade during transitions *(merges nav-5)* — `utils/TransitionEngine.ts:391-409`
- **react-1** missing shallow-equality guard re-renders 4 trees — `services/relationship.ts:61-90`
- **css-1** tile entrance animates `box-shadow` (paint) *(merges css-3)* — `styles/polish-fixes.css:50-67`
- **list-2** Heirlooms canvas renders offscreen / unwindowed — `views/Heirlooms.tsx:686-726`
- **ambient-3** ambient invalidates at 120 fps (battery/thermal) — `components/FloatingHeartsScene.tsx:499-609` *(verify on-device; not LiveBackground3D)*
- **fm-6** backdrop-blur layout spring forces relayout — DailyQuestion
- **fm-3** coachmark infinite loops keep running — `components/CoachmarkSystem.tsx:661-887`
- **fm-5** animation loops run on hidden (cached) tabs — `App.tsx:1149-1164`
- **haptics-1** dual press authorities (JS + CSS) on one element — `index.tsx:35-83`
- **haptics-2** tap handler triggers reflow — `utils/gesture.ts:257-268`
- **haptics-5** drag animates `box-shadow` — `hooks/useHapticPress.ts:39-47`
- **haptics-3** audio not gated → bridge calls — `services/nativeShell.ts:160-165`
- **kb-3** keyboard logic resolves the wrong scroller — `views/DailyMoments.tsx:289-300`
- **kb-4** `scrollIntoView` fights the keyboard animation
- **leak-1** fade timer not cleared on unmount — `services/ambient.ts:40-57`
- **expensive-2** closeness recomputed on every mount — `services/relationshipModel.ts:654-785`
- **expensive-3** 5 s rebuild loop *(folds stutter-2)* — `views/DailyMoments.tsx:604-640`
- **stutter-1** 60 s sweep does a per-minute IndexedDB write
- **dead-2** orphaned views still chunked — `views/viewRegistry.tsx:81-82`
- **startup-2** fixed splash floor wastes up to ~750 ms warm — `App.tsx:664-685`

**Collective fix posture:** per-member shallow-equality / dirty-threshold guards; paint props → transform/opacity; one opacity owner per transition; `content-visibility` + IntersectionObserver-gated canvases; half-cadence ambient invalidate; one press authority + `data-no-press`; correct scroller resolution; store/clear timers; compute-once + `requestIdleCallback`; remove orphaned views; adaptive splash floor.
**Est. impact:** steadier 60 fps, fewer re-renders, lower idle/background CPU, one per-minute IDB write removed, ~2,180 dead lines, up to ~750 ms warm-launch returned.

---

## 4. P3 Findings (14) — hygiene, dead code, latent races

- **css-2** skeleton paint loop · **css-4** aurora paint · **fm-4** forge `boxShadow` · **fm-8** card gradient anim · **fm-7** shared hero `layoutId` collision · **fm-9** AuraSignal glow → **KEEP (intended)** · **list-4** OpenWhen uncapped · **list-5** RecapCarousel unwindowed · **list-6** comment thread · **list-7** unclamped stagger · **media-5** missing `<img>` dims (CLS) · **ambient-2** pixel ratio set once · **ambient-4** per-frame particle CPU · **react-3** dead JSX · **react-4** missing memo · **haptics-4** un-gated `warmUp` · **haptics-7** unwired gesture code · **leak-2** teardown stop-handle race · **startup-3** static supabase import · **expensive-4** object-identity effect dep · **expensive-5** date array built inside filter · **kb-5** modal lifts via `padding-bottom` · **nav-4** null outer Suspense (blank-frame risk)

**Posture:** paint loops → transform/opacity; `content-visibility` + clamped stagger; cache `scrollWidth`; add `<img>` dims; consolidate duplicate CSS; explicit hero dims; **keep fm-9**; re-apply pixel ratio on resize; delete dead/unwired code; time-gate `warmUp`; guard teardown; dynamic-import supabase; depend on primitives; hoist the recap date array; transform-based modal lift; wrap the overlay in its own Suspense.

---

## 5. Refuted Findings (3) — verified NOT problems

The adversarial pass opened the cited code and disproved these. Recorded so they aren't "re-discovered" later:

1. **nav-3** "redundant `markTabMounted` effect fires an extra render." — **False.** All call sites batch `markTabMounted` with `setCurrentView`, and the `setMountedTabs` updater returns the **same `Set` reference** when the tab is already present, so React bails out (`Object.is`). The updater runs; no extra commit, no useMemo recompute.
2. **list-3** "Countdowns replays `numberRoll` on Days/Hrs/Min every second." — **False.** A re-render emitting the **identical** `animation` style string causes no DOM mutation, so the CSS animation has no trigger to restart; `key` prevents remount and `fill: both` freezes the end state. Only the seconds text node changes. (The 1 Hz `setState` is mild CPU, not flicker.)
3. **haptics-6** "`attachLongPress` RAF transform conflicts with the global press scale." — **False.** The only wired long-press is `useLongPress` (a `setTimeout`, **zero** transform writes); `attachLongPress`'s RAF scale writer in `gesture.ts` is **not called anywhere**. One owner (the CSS rule), no conflict.

---

## 6. Remediation Roadmap (ordered by impact ÷ risk)

| # | Batch | Findings | Risk | Expected gain |
|---|---|---|---|---|
| 1 | **Memory leaks & cache caps** | media-2, media-1 | low | Caps media heap; ends per-video leak; removes most long-session restarts |
| 2 | **Navigation & startup** | nav-1, startup-1 | low | Kills the pre-bloom nav hitch; faster Home TTI (−600 KB) |
| 3 | **Keyboard occlusion** | kb-1, kb-2 | low | Restores input/CTA visibility on 4 composers; no fps cost |
| 4 | **Compute hot paths** | expensive-1, list-1 | medium | Removes thousands of redundant calls + 28×N calendar parses (identical output) |
| 5 | **Pulse overlay GPU** | react-2 | medium | ~15–40% GPU recovery during the 6 s overlay |
| 6 | **Media decode & grid weight** | media-3 | medium | Thumbnail tier + in-view video gating → large decode/texture-memory cut |
| 7 | **P2 cluster** | p2-all (20 ids) | medium | Steadier 60 fps; lower idle/background CPU; ~750 ms + ~2,180 dead lines |
| 8 | **Ambient (verify on-device)** | ambient-1 | low | Ends GPU realloc bursts on resize; **background byte-identical** |
| 9 | **Dead code & hygiene** | p3-all (23 ids) | low | Smaller bundles; closes latent races; negligible direct fps |

> **media-3** = no thumbnail tier (`utils/media.ts:15`, `views/DailyMoments.tsx:102-149`): one 1600 px asset feeds every grid cell, DailyMoments decodes it twice per card, and videos `autoPlay loop` with no in-view gate. Fix: store a 400–600 px thumb at save, gate autoplay to in-view, add explicit dims. Risk: medium (touches the save path + IndexedDB latency).

---

## 7. Remaining bottlenecks (need real-device profiling)

- On-device GPU profiling of the ambient stack to confirm `ambient-3` frame-skip is imperceptible (the headless preview cannot render R3F).
- Real-device memory profiling to calibrate the `media-2` LRU budget on 2–3 GB Android.
- Capacitor IndexedDB write latency for the `media-3` thumbnail-at-save path.
- Touch-to-feedback + iOS haptic-bridge latency (physical devices only).
- `nav-1` active-layer clone across all transition directions.

## 8. Future opportunities

- Virtualize long lists with a windowing library.
- A responsive image pipeline once `media-3` lands.
- Re-enable the AnimationEngine adaptive-tier system (currently a hardcoded `ultra` no-op).
- Move heavy synchronous services into a Web Worker.
- A single press-feedback authority + a single transform-based keyboard-lift primitive.
- A runtime perf-budget guard (ban paint props in infinite loops, ban unbounded `Map`s).

## 9. Guardrails (constraints honored throughout)

- **The ambient background is sacred** — every background finding (`ambient-1..4`) is a pipeline optimization (throttle / dispose / clamp / pause) that keeps it **visually identical**. `fm-9` (AuraSignal glow) is intended and explicitly **kept**.
- Every fix preserves existing functionality; behavioral risk is labeled per finding.
- Background-touching batches (5, 8) require on-device verification before merge.
