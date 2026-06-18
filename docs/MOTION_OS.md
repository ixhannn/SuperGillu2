# The Lior Motion Operating System

*A complete, code-grounded motion language for a premium relationship app for couples.*

> Every movement in Lior must communicate **love, presence, warmth, emotional connection,
> delight, luxury, craftsmanship, fluidity, and human touch.** The target feel: Apple Photos
> Memories · Apple Journal · Dynamic Island · visionOS · Arc · Linear · Notion Calendar ·
> Airbnb · Raycast · Superhuman — fused into one coherent system.

**Provenance.** This is not theory. It is grounded, file-by-file, in Lior's shipped code as of
the `claude/serene-wiles-f859f4` fluid-motion redesign (true iOS push/pop, the `expand` tile
bloom, the `--lior-*` token ladder, global `MotionConfig` reduced-motion, the de-bounce sweep).
Every recommendation either pins an existing line or prescribes a change in the **canonical
tokens** below — nothing is invented in a vacuum. Where a section says "today it does X," that
X is real and cited.

---

## §0.1 — The Prime Directive: the background is the stage

The Home background animation (`components/AmbientVisuals.tsx` → `LiveBackground` radial wash +
`AmbientMotionFallback` sheen + lazy R3F `LiveBackground3D` + `FloatingHeartsScene`) is a **fixed
brand asset.** It is never redesigned, replaced, or substantially altered by this system.

> **The stage is the background. The performance is everything else.**
> Foreground motion must *never* compete with the stage. When the foreground performs (routes,
> sheets, celebrations), the stage quiets itself (it already reads `data-transitioning`). Ambient
> loops live at **≥ 2000ms** so they never beat against gesture-speed feedback. This is enforced
> structurally by the Layer Architecture (§3), not left to discipline.

---

## §0.2 — Canonical token quick-reference (the whole system in one screen)

Everything downstream uses *these exact values*. Do not reinvent; extend.

**Easing** (CSS `--lior-ease-*` in `styles/root-fixes.css`; mirrored in `utils/motion.ts`):

| Token | Curve | Use |
|---|---|---|
| `silk` | `cubic-bezier(0.16, 1, 0.3, 1)` | primary deceleration — entrances, settling |
| `soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | gentle standard / outgoing |
| `press` | `cubic-bezier(0.2, 0, 0, 1)` | sharp press-in |
| `exit` | `cubic-bezier(0.4, 0, 0.2, 1)` | accelerate-out |

**Duration ladder** (CSS `--lior-motion-*`): `press 90` · `feedback 140` · `micro 200` ·
`tab 240` · `pop 260` · `push 360` · `modal 380` · `morph 400` · *ambient loops ≥ 2000*.

**Springs** (`utils/motion.ts`, all critically damped — **no overshoot, anywhere**):
`springSmooth {260,30,0.9}` (default reveals) · `springSnappy {460,34,0.7}` (quick UI) ·
`springGentle {170,26,1}` (large surfaces).

**Route directions** (`utils/TransitionEngine.ts`, native View Transitions + JS fallback +
edge-swipe back): `tab` · `push` (true iOS push) · `pop`/`modal-close` (old slides off *on top*) ·
`modal` · **`expand`** (page blooms from the tapped tile's `--lior-open-x/y`).

**Haptics** (`services/haptics.ts`): `tap` `press` `heavy` `success` `warning` `error` `select`
`softTap` `heartbeat` `doubleBeat` `celebrate` `longPressProgress` `toggleOn/off`
`dragPickup/dragDrop`. **Rule:** haptics fire on *explicit product actions only*, never on raw
global pointerdown (removed for feeling noisy during scroll).

**Reduced motion:** global `<MotionConfig reducedMotion="user">` (opacity-only) + route layer +
CSS `@media` guards. **Never** add a blanket `* { animation: none }` — it breaks
`tests/motionExperience.assert.mjs`, which asserts specific keyframes *exist* and that all
`lior-vt-*` / `keep-alive*` / `lior-motion*` keyframes stay **transform + opacity only**.

---

## §0.3 — How this maps to the brief's deliverables

| Brief deliverable | Section |
|---|---|
| Motion Philosophy · Emotional Framework · Motion Principles · "what we won't do" | **§1** |
| Animation Token System · Timing · Easing · Spatial · Opacity · Scale · Accessibility | **§2** |
| Motion Layer Architecture (around the fixed background) | **§3** |
| Tab Bar (frame-by-frame) · Navigation language · Shared-Element library | **§4** |
| Home · Timeline · Daily Questions blueprints | **§5** |
| Connection (DuetJournal/Pulse/VoiceNotes) · Relationship Profile · Premium · Settings | **§6** |
| Delight Moments · Gesture System · Haptic + Motion sync | **§7** |
| Loading Experiences · Performance Engineering · Motion Priority Matrix | **§8** |
| Developer Implementation Spec (Framer Motion, primitives, tokens-as-code) | **§9** |

---

## Table of Contents

1. **Motion Audit, Philosophy & Principles**
2. **The Lior Motion Design System (Tokens)**
3. **Motion Layer Architecture** (around the fixed background)
4. **Tab Bar, Navigation & Shared-Element Transitions**
5. **Screen Blueprints — Home, Timeline, Daily Questions**
6. **Screen Blueprints — Connection, Relationship Profile, Premium, Settings**
7. **Delight Moments, Gestures & Haptic Synchronization**
8. **Loading Experiences, Performance Engineering & Priority Matrix**
9. **Developer Implementation Specification**

---
## 1. Motion Audit, Philosophy & Principles

> **Scope.** This is the foundation document of the Lior Motion Operating System. It audits the
> *current* state of motion in the app (post the committed fluid-motion redesign on this
> worktree — true iOS push, expand bloom, the silk token ladder, app-wide reduced-motion), then
> defines the philosophy and the numbered principles every subsequent blueprint (sections 2–N)
> must obey. All findings cite real files. All recommendations use the canonical tokens from
> `styles/root-fixes.css` `:root` and `utils/motion.ts`. The Home background animation
> (`components/AmbientVisuals.tsx`) is treated as a fixed brand asset throughout — we design the
> performance, never the stage.

---

### 1.0 What the recent redesign already got right (so we critique the present, not the past)

Before the brutal part, an honest ledger. The fluid-motion redesign that landed on this branch
(`f220165 feat(motion): fluid-motion redesign`) is genuinely good and the rest of this OS builds
*on* it, not over it:

- **A real route engine.** `utils/TransitionEngine.ts` runs the native View Transitions API path
  (`startViewTransition`, `_runNativeVT`, lines 189–234) with a JS-clone fallback (`_run`, lines
  280–344) and a watchdog (`dur + 400ms`, lines 218–223) that prevents a dead `vt.finished`
  promise from freezing navigation forever. This is mature, defensive code.
- **True iOS push, not a nudge.** `lior-vt-push-in` enters from `translate3d(100%,0,0)` at full
  opacity while `lior-vt-push-out` parallaxes the old screen to `-25%` + dims to `0.7`
  (`root-fixes.css:333–340`). Pop/modal-close correctly z-index the *old* snapshot on top so it
  slides off and *reveals* the screen underneath (`root-fixes.css:451–454`) — the real iOS reveal,
  not a crossfade.
- **Shared-origin tile bloom.** `hooks/useTileOpen.ts` writes `--lior-open-x/y` from the tapped
  card's rect (lines 65–69) and flags `data-lior-open-expand`; `TransitionEngine.navigate()`
  upgrades a plain `push` to `expand` (lines 147–151); `lior-vt-expand-in` scales the new page from
  that exact origin (`root-fixes.css:437–440`). This is a shared-element transition done with zero
  layout thrash.
- **One easing family, declared once.** `--lior-ease-silk/soft/press/exit` and the full duration
  ladder (`--lior-motion-press:90ms` … `--lior-motion-morph:400ms`) live in `root-fixes.css:91–106`
  and are mirrored in `utils/motion.ts:19–34`. The springs are critically damped, no overshoot.
- **A GPU-budget protocol.** `data-transitioning="1"` pauses every ambient animation
  (`root-fixes.css:115–119`) and drops backdrop-filters on flagged chrome (`:123–127`);
  `AmbientVisuals` honours it via `useAmbientMotionPaused` (`AmbientVisuals.tsx:38–61`). The
  transition gets the whole compositor.
- **Reduced motion, app-wide.** `<MotionConfig reducedMotion="user">` wraps `<App/>`
  (`index.tsx:116`); the route layer cross-fades (`TransitionEngine._xfade`, lines 259–276); CSS
  `@media (prefers-reduced-motion: reduce)` guards exist in `root-fixes.css:269–277, 457–462` and
  `index.css`. `tests/motionExperience.assert.mjs` actively guards that nav keyframes stay
  transform+opacity only (lines 81–87) and bans bounce/elastic curves in the route layer (lines
  66–70).
- **Scroll that doesn't re-render.** Home's scroll-linked header writes inline style straight to a
  ref, never React state (`Home.tsx:462–506`) — the single biggest historical source of Home jank,
  fixed.

That floor is high. Everything below is about the gap between *that floor* and an Apple Design Award
ceiling. The redesign fixed the **route layer**. It did **not** reach the **component layer**,
where most of Lior's emotional surface area actually lives.

---

### 1.1 BRUTAL AUDIT — the current state, screen by screen, system by system

#### A. The two-speed problem (the headline finding)

Lior currently has **two motion systems that don't know about each other**, and the seam is
visible on almost every screen.

- **System 1 — the new, disciplined route/nav layer.** Silk curves, the duration ladder,
  critically damped springs, no bounce. Governs page transitions, the BottomNav pill
  (`BottomNav.tsx:26–27`, 240ms silk WAAPI), tile lift, and anything that imports from
  `utils/motion.ts`.
- **System 2 — the old, undisciplined component layer.** Lives in `index.css` and inline in 29 of
  the view files. It uses a *different* easing vocabulary entirely: `--spring-smooth` resolves to
  `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (`index.css:34`) — a generic easeInOutQuad that appears in
  **none** of the canonical tokens — and drives `modal-enter`, `spring-in`, `number-roll`,
  `slide-fade-enter`, and most legacy entrance classes (`index.css:1321–1362, 1678–1685`).

The result: open a page and it slides in on the silk curve (System 1), then its *contents* settle
on easeInOutQuad (System 2). The two decelerations don't match. It is the motion equivalent of two
slightly different fonts in one headline — most users can't name it, but it reads as "not quite
premium."

**Quantified.** A grep for ad-hoc `stiffness:`/`duration:`/`ease:` literals across `views/` returns
**214 occurrences in 29 files** — `BonsaiBloom.tsx` (51), `MoodCalendar.tsx` (17), `AddMemory.tsx`
(13), `MemoryTimeline.tsx` (12), `VoiceNotes.tsx` (12), `Auth.tsx` (20). These are hand-picked
springs and `ease:'easeInOut'` tweens that bypass `utils/motion.ts` entirely. The canonical
vocabulary exists; the component layer simply doesn't use it.

#### B. Lying comments / dead props — the press primitive

- **`.spring-press` is documented to overshoot but does not.** The CSS comment promises "a whisper
  of overshoot (~0.3% past rest — felt, not seen)" and binds `transition: transform 0.3s
  var(--spring-bounce)` (`index.css:1691–1694`). But `--spring-bounce` was redefined to
  `var(--spring-snappy)` → `cubic-bezier(0.16, 1, 0.3, 1)` (`index.css:39–40`) — the pure silk
  curve, **zero overshoot**. So the documented "bouncy release" is a no-op. Worse, the press-*down*
  hardcodes `cubic-bezier(0.36, 0.07, 0.19, 0.97)` and a `filter: brightness(0.94) saturate(1.06)`
  (`index.css:1697–1701`) — a per-tap filter repaint, off the canonical curve set, and the one
  press users feel a thousand times a day.
- **`TiltCard` accepts `maxTilt`, `glare`, `scale` and silently discards all three.** The component
  is now a bare `spring-press` div (`components/TiltCard.tsx:21–36`) — the desktop tilt/glare was
  removed — yet `Home.tsx` still passes `maxTilt={12} glare scale={1.01}` to the hero card and
  `maxTilt={14} glare` to the countdown card (`Home.tsx:689–692, 882–884`). Dead API. The hero
  card, the single most-looked-at element in the app, has *no* press feedback beyond the global
  `.spring-press` scale because its glare/tilt props go nowhere.

#### C. Modals & overlays — the entire sheet language is unused, and the legacy modal fights the new one

- **Only `add-memory` ever uses the modal/sheet motion.** `App.tsx:445` maps `add-memory → 'modal'`;
  *everything else* deep is `push` or `expand` (`App.tsx:449–450`). So the beautiful bottom-sheet
  rise (`lior-vt-modal-in`, `root-fixes.css:358–361`) and its inverse dismissal
  (`lior-vt-modal-close-*`, `:364–372`) exist in the engine but are exercised by exactly one screen.
  Surfaces that *are* conceptually modal/sheet — `OpenWhen` letters, `Surprises`, `TimeCapsule`,
  the `Premium` paywall — all arrive as horizontal pushes, which reads as "another page in the
  stack" rather than "a thing presented to you."
- **Two modal systems collide.** Inside Home, `SurpriseModal` is a hand-rolled overlay using the
  *legacy* `animate-backdrop-enter` + `animate-modal-enter` classes (`Home.tsx:74–77`) on
  `--spring-smooth` (easeInOutQuad, `index.css:1361–1362`). That is System 2 motion layered on top
  of a screen the user reached via System 1. The backdrop is a hard `blur(16px)` over
  `rgba(0,0,0,0.55)` (`Home.tsx:75`) — heavy, abrupt, and on the wrong easing.
- **No coordinated exit.** `SurpriseModal` mounts with an enter animation but unmounts with a bare
  `setShowSurprise(false)` (`Home.tsx:586`) — no exit choreography. The modal *blinks* out. Same
  pattern recurs anywhere a plain conditional render gates an overlay.

#### D. DailyQuestion — the reveal that should be the emotional peak is flat

`components/DailyQuestion.tsx` is the closest thing Lior has to a daily two-person ritual, and its
motion undersells it badly:

- The **"both answered" reveal** — the moment the user finally sees their partner's answer — is two
  bubbles fading up 8px with a flat `transition={{ delay: isMe ? 0 : 0.12 }}` and **no easing
  curve specified at all** (`DailyQuestion.tsx:200–217`). Framer falls back to its default tween.
  This should be the most rewarded moment in the app; it currently animates like a form field.
- The **card expand** uses `layout="size"` with a one-off spring `{stiffness:400, damping:32}`
  (`DailyQuestion.tsx:65–77`) — yet another bespoke spring outside `utils/motion.ts`.
- The expanded input does `animate={{ height: 'auto' }}` (`:128–130`) — **animating `height` is a
  layout-thrash animation** the route layer explicitly forbids (the motion test bans
  height/width/top/left in nav keyframes, `motionExperience.assert.mjs:82–87`). The component layer
  isn't held to that bar and pays for it on mid-range Android.

#### E. Comms surfaces (the "chat" of a memory app) — inconsistent personalities

Lior has no messenger; its connection surfaces are `DuetJournal`, `AuraSignal/Pulse`, `VoiceNotes`,
the DailyQuestion reveal, and `OpenWhen`. They each invented their own motion:

- **`AuraSignal.tsx`** leans on slow `duration: 15`/`20`/`2` infinite `easeInOut` loops
  (lines 100, 110, 290) and a bespoke `{stiffness:400, damping:25}` button spring (line 266) plus a
  `whileTap={{ scale: 0.9 }}` (line 346) — a *deeper* press than the global `.spring-press` (0.955),
  so the same gesture has two different depths depending on which screen you're on.
- **`VoiceNotes.tsx`** carries 12 ad-hoc literals; **`MemoryTimeline.tsx`** 12; **`DuetJournal.tsx`**
  8. None share a stagger, a reveal curve, or an enter distance. Three connection surfaces, three
  motion dialects.

#### F. Home — the showcase screen, and its specific friction

- **Two reveal systems on one screen.** Home wraps sections in `<ScrollReveal>` which emits CSS
  `.home-reveal-*` classes driven by `lior-home-reveal` (`root-fixes.css:202–266`) — good,
  compositor-only, staggered by `nth-child` delay. But the bento grid items *also* carry
  `whileTap={{ scale: 0.93, y: 2 }}` with a one-off `{stiffness:600, damping:26}` spring
  (`Home.tsx:991–992, 1011–1012, 1033–1034, 1054–1055`). Stiffness 600 is far outside the canonical
  range (max `springSnappy` is 460) and is applied inconsistently — Private Space uses 520/28
  (`:1073–1074`), Premium 520/28 (`:1111–1112`). Four tiles, three different tap springs.
- **`useCountUp` is linear-feeling and uncancelled on profile change.** The days-together counter
  eases with `1 - (1-p)^3` over 1800ms (`Home.tsx:265–273`) — fine — but it only fires `once` on
  `heroInView` and won't re-animate when the anniversary date changes; the number just *jumps*.
- **The Lior Gold crown breathes forever.** `animate={{ scale: [1, 1.05, 1] }}` `repeat: Infinity`
  `ease:'easeInOut'` (`Home.tsx:1129–1131`). It is an idle loop **under 2000ms** (3.6s is fine, but
  the *principle* — see §1.3.9 — is that idle ambient loops must be ≥2000ms and never near a tap
  target's feedback window; this one sits inside a tappable card and competes with its press).
- **Stale aesthetics still shipping.** `SectionDivider` (`Home.tsx:24–29`) renders an uppercase
  micro-label + gradient hairline — the exact "big stat masthead / divider" pattern memory notes
  the user rejected. It's defined and exported but its presence signals the old visual language is
  still in the file.

#### G. Loading & empty states — abrupt, and the good primitive is barely used

- The redesign **restored** a premium skeleton (`.skeleton-shell/.skeleton-aura/.skeleton-shimmer`,
  `index.css:1755–1795`) with warm pink shimmer on the compositor. Good. But most views still gate
  on a boolean and render content with **no skeleton and no enter transition** — content *pops* in
  when data resolves. There is no consistent "data arriving" choreography.
- Image-heavy cards (On This Day, `Home.tsx:941–951`; memory cards) load images `loading="lazy"`
  with **no fade-in** — the image hard-cuts over its placeholder. A 200ms `--lior-motion-micro`
  opacity fade on image decode is the single cheapest premium win available.

#### H. Micro-interactions — robotic or missing

- **Toggles are instant.** The status pills (`Home.tsx:846–877`) swap background/icon on tap with
  a `transition-all duration-300` Tailwind class — a *generic all-property* transition (animates
  color, background, shadow simultaneously, off-curve). No spring, no icon morph. Tapping
  awake↔asleep is a hard state flip dressed in a slow crossfade.
- **`navigator.vibrate` raw calls bypass the haptic ladder.** `Home.tsx:519, 528` call
  `navigator.vibrate([...])` directly instead of `services/haptics.ts` (`heartbeat`, `celebrate`).
  Two haptic systems; the raw one ignores the documented Light/Medium/Heavy ladder and the keyed
  gate.
- **Notification dot just pulses generically.** `BottomNav.tsx:309` uses `animate-breathe` on the
  unread heart — fine, but it's the *same* breathe as everything else; arrival of a *new* unread
  (the emotionally relevant event) gets no distinct entrance.

#### I. Gesture & nav — strong core, two rough edges

- The edge-back gesture (`TransitionEngine._pd/_pm/_pu`, lines 348–482) is excellent: 1:1 tracking,
  velocity-windowed commit, axis lock. But it is **edge-only** (`EDGE_PX = 28`, line 30) and the
  commit fires a *separate* `te:gesture-back` event path (lines 450–452) rather than the
  `navigate()` path — two back flows to keep in sync, a known flake source (per project memory:
  nav-lock race).
- **Tab switches keep ambient alive on purpose** (`AmbientVisuals` ignores tab `paused`,
  `:20–22`) — correct — but `data-tab-transitioning` is read by ambient (`AmbientVisuals.tsx:33`)
  while the route push reads `data-transitioning`; the two flags must stay coherent or the
  background either stutters (paused twice) or competes (paused never).

#### J. The fixed background relationship — currently *defensive*, not *harmonized*

Today the only contract between foreground and the fixed stage is **suppression**: during a
transition, ambient pauses (`root-fixes.css:115–119`). That prevents competition but it's a blunt
instrument — the background simply *freezes*. There is no moment where foreground motion
*acknowledges* the stage (e.g. a card settling could let a beat of the wash drift show through; a
modal backdrop could sample the stage's warmth rather than slap a flat `rgba(0,0,0,0.55)` over it,
as `SurpriseModal` does at `Home.tsx:75`). We suppress the stage; we never duet with it.

---

### 1.2 MOTION DESIGN PHILOSOPHY — how Lior should FEEL

> **One-line thesis:** *Lior moves like warm breath on glass — soft, weighted, alive, and
> unhurried — where every motion is the app paying attention to two people.*

**The governing metaphor: warm physical light, not glass and not gas.**
The brand is warm, light, colourful, pink — and the fixed stage is a slow radial wash of living
light (`LiveBackground`, `AmbientMotionFallback`'s `liorAmbientWashDrift` 24s drift,
`AmbientVisuals.tsx:73–86`). Foreground motion must feel like it belongs *in that light*. So:

- **NOT airy/floating.** Floating reads as weightless and trivial; this is a relationship app, the
  opposite of trivial. Elements have gentle mass and settle.
- **NOT elastic/bouncy.** Bounce reads as toy-like and is already banned in the route layer
  (`motionExperience.assert.mjs:66–70`). We extend that ban app-wide. The "spring" feeling comes
  from *critical damping* (springSmooth/Snappy/Gentle), not overshoot.
- **NOT glassy-dense.** Rejected three times per project memory. Motion must never rely on stacked
  blurs or heavy specular sweeps to feel premium.
- **YES: weighted warmth + magnetism.** Things have just enough mass that they *settle* (silk
  deceleration) rather than snap. Shared elements feel *magnetically* connected to their origin
  (the tile-bloom is the template). Touch feels like pressing warm material that gives slightly and
  returns calmly.

**Physics model.** Every motion belongs to one of three weight classes, mapped to the existing
springs (`utils/motion.ts:32–34`):

| Weight | Spring | What moves this way | Feel |
|---|---|---|---|
| Light | `springSnappy` 460/34/0.7 | toggles, chips, icons, FAB, like | quick, certain, no lag |
| Standard | `springSmooth` 260/30/0.9 | list items, cards, reveals, most UI | the house default — settles softly |
| Heavy | `springGentle` 170/26/1 | full sheets, large surfaces, the hero, modals | slow, deliberate, important |

**Energy & momentum.** Energy is *inherited*, never *spent for show*. A tap's energy flows into the
tile lift, which flows into the page bloom — one continuous gesture (the `useTileOpen` →
`expand` chain is the proof it can be done). Idle energy belongs to the **stage only**; the
foreground is *still* until touched. This is the core tension a relationship app must respect: it
should feel *calm and present*, not busy. Stillness is a feature.

**Personality.** Lior is the *attentive partner*, not the excitable puppy. Motion is warm,
restrained, and occasionally — at genuine emotional peaks (a heartbeat received, both partners'
answers revealed, a milestone reached) — it *blooms* with real generosity (`celebrate` haptic +
particle + scale bloom). Restraint everywhere makes those few bloom moments land like a held
breath releasing. **Delight is rationed so it stays meaningful.**

**Emotion as the design input.** Each motion must answer: *what feeling is this?* Navigation =
"I'm taking you somewhere we've been / somewhere new." A reveal = "here's what they said." A
heartbeat = "they're thinking of you, right now." If a motion doesn't carry a feeling, it should be
**removed** (see §1.4), not merely tuned.

---

### 1.3 THE MOTION PRINCIPLES (the law of the system)

These govern every blueprint in sections 2–N. Numbered so later docs can cite "Principle 4."

**1. The Background Is The Stage (the prime law).**
The Home ambient layer (`AmbientVisuals.tsx`) is a fixed brand asset. Foreground motion never
competes with it: foreground motion is *faster and more contrasty than ambient on purpose* (gesture
feedback 90–400ms vs ambient loops ≥2000ms), and ambient yields to the foreground during
transitions via `data-transitioning` (`root-fixes.css:115–119`). New rule beyond mere suppression:
when feasible, foreground motion should *harmonize* with the stage — sample its warmth for
scrims, let it breathe through at rest — never paint a flat opaque slab over it.

**2. One Easing Family.**
Every animation in the app — route, component, micro — picks from `--lior-ease-silk / soft / press /
exit` (`root-fixes.css:93–96`) or the framer mirrors `EASE_SILK / SOFT / EXIT` (`utils/motion.ts`).
**`--spring-smooth` (easeInOutQuad) and all 214 ad-hoc literals are deprecated** and migrate to the
family. Silk decelerates (entrances, settling). Exit accelerates (dismissals). Press is the sharp
finger-down. No other curves exist.

**3. One Duration Ladder.**
Pick from `--lior-motion-press 90 · feedback 140 · micro 200 · tab 240 · pop 260 · push 360 · modal
380 · morph 400` (`root-fixes.css:98–105`). No `duration: 0.3`/`0.5`/`8`/`15` literals except
*ambient* loops, which are deliberately ≥2000ms (Principle 9). If a value isn't on the ladder, it's
a bug.

**4. One Spring Vocabulary, Three Weights.**
Framer springs are only `springSmooth / springSnappy / springGentle` (`utils/motion.ts:32–34`),
chosen by weight class (§1.2 table). No bespoke `{stiffness, damping}` objects. The 600/26 and
400/32 one-offs in Home/DailyQuestion/AuraSignal are removed. All springs are critically damped —
**no overshoot, ever** (enforced by `motionExperience.assert.mjs:66–70`, extended app-wide).

**5. Continuity / Shared Origin.**
Motion is continuous: the energy of an action flows into the next state without a cut. Navigation
into a tile *blooms from that tile* (`useTileOpen` → `expand`, the canonical pattern). A modal
*rises from where it was summoned*. Nothing teleports; nothing hard-cuts. Where a shared element
exists, animate *between* the two states, never fade one out and the other in.

**6. Compositor-Only.**
Every animation moves `transform` and `opacity` only — never `height / width / top / left / margin
/ padding / filter / backdrop-filter` (the nav-keyframe rule in `motionExperience.assert.mjs:82–87`,
now app-wide). `DailyQuestion`'s `height:'auto'` animation and `.spring-press`'s per-tap `filter`
both violate this and must be reworked (scale/clip-path/opacity substitutes). Mid-range Android is
the target; the compositor is the only safe thread.

**7. Touch Has One Feel.**
Every tappable surface presses with **one** depth and **one** curve: scale ≈ 0.955 on
`--lior-ease-press` down (90ms), silk return (`--lior-motion-feedback` 140ms). The global press
system (`index.tsx:36–63`) already applies `data-pressing` to all pressables with scroll
cancellation — component-level `whileTap` overrides (Home 0.93, AuraSignal 0.9) are removed so the
gesture feels identical everywhere. Visual press is global; **haptics fire only on explicit product
actions**, never raw pointerdown (the documented rule, `index.tsx:15–17`).

**8. Emotional Intent Is Mandatory.**
Each motion declares the feeling it carries (navigation / reveal / presence / celebration /
acknowledgement). Peaks — heartbeat received, daily-question reveal, milestone, both-linked —
*bloom* with rationed generosity (scale bloom + particles + `celebrate`/`heartbeat` haptic from
`services/haptics.ts`, never raw `navigator.vibrate`). Everything else stays calm. The contrast is
the product.

**9. Stillness At Rest; Idle Energy Belongs To The Stage.**
At rest the foreground is *still*. Ambient/idle loops live in the background stage and run ≥2000ms
so they never read as UI feedback (`AmbientMotionFallback` 24s/30s drifts are the model). Decorative
infinite loops inside *foreground* tap targets (the Lior Gold crown breathe, status-icon
`spin-slow`) are removed or demoted — they compete with press feedback and burn battery.

**10. Restraint / Subtraction.**
The user has rejected "too much" three times (project memory). Default to *less*. Before adding a
motion, try removing one. A screen that is calm and lets two or three elements move with intention
beats a screen where everything animates. Motion density is a budget, not a goal.

**11. Coherent State Flags & Single Source Of Truth.**
Motion config lives in `utils/motion.ts` + `root-fixes.css` `:root` only. Runtime flags
(`data-transitioning`, `data-tab-transitioning`, `data-pressing`, `data-vt-dir`) have one writer
each and are read consistently (`AmbientVisuals.tsx:24,33` must track exactly what the engine
sets). One back-navigation path (reconcile the `te:gesture-back` flow with `navigate()`). No second
modal system (retire `animate-modal-enter`/`animate-backdrop-enter` in favour of the engine's
`modal` direction).

**12. Accessibility Is Not An Afterthought.**
`reducedMotion="user"` (`index.tsx:116`) is the floor, not the ceiling. Every new motion must
degrade to an opacity-only or instant variant, must never trap content invisible
(`startRevealSafety`, `index.tsx:70`, is the safety net), and must keep tap targets responsive even
when animation is suppressed. The motion test asserting keyframes *exist* (`:76–79`) means we never
ship a blanket `* { animation: none }` — reduced motion is *targeted*, never scorched-earth.

---

### 1.4 WHAT WE WILL NOT DO (the removal list)

- **No bounce, elastic, or overshoot curves** anywhere — extends `motionExperience.assert.mjs:66–70`
  app-wide. Retire the *lie* in `.spring-press` (`index.css:1691–1694`) — the comment about
  overshoot is removed and the curve stays critically damped.
- **No `--spring-smooth` (easeInOutQuad) and no ad-hoc cubic-beziers** — migrate all 214 literal
  springs/durations/eases in `views/` to the canonical tokens. One family, one ladder.
- **No animating `height`, `width`, `top`, `left`, `filter`, or `backdrop-filter`** — including
  `DailyQuestion`'s `height:'auto'` (`:128–130`) and `.spring-press`'s per-tap `filter`
  (`index.css:1700`). Compositor-only.
- **No second modal system** — retire hand-rolled `animate-modal-enter` + `animate-backdrop-enter`
  overlays (`SurpriseModal`, `Home.tsx:74–77`); route presented surfaces through the engine's
  `modal` direction with a coordinated exit (kill the blink-out).
- **No decorative infinite loops inside foreground tap targets** — remove/demote the Lior Gold crown
  breathe (`Home.tsx:1129–1131`), the status `spin-slow` sun, and any idle loop <2000ms living over
  a pressable.
- **No per-component `whileTap` depth overrides** — delete Home's 0.93 and AuraSignal's 0.9; one
  global press feel (Principle 7).
- **No raw `navigator.vibrate`** — `Home.tsx:519,528` route through `services/haptics.ts`
  (`heartbeat`/`celebrate`). One haptic ladder.
- **No dead motion props** — `TiltCard`'s `maxTilt/glare/scale` are removed from the signature *and*
  the call sites (`Home.tsx:689–692, 882–884`); an API that does nothing is worse than no API.
- **No flat opaque scrims over the stage** — modal/overlay backdrops sample warmth or blur the stage
  rather than slapping `rgba(0,0,0,0.55)` over it (`Home.tsx:75`).
- **No hard-cut content/image arrival** — every data-resolved surface gets a skeleton
  (`.skeleton-shell`, already built) or a `--lior-motion-micro` opacity fade; nothing pops.
- **No "stat masthead / section divider" furniture** — `SectionDivider` (`Home.tsx:24–29`) and its
  kin stay retired; motion never decorates a label the user already rejected.
- **No `transition-all`** — generic all-property Tailwind transitions (status pills,
  `Home.tsx:596, 743, 848`) are replaced with explicit `transform`/`opacity` transitions on
  canonical curves.
## 2. The Lior Motion Design System (Tokens)

> This is the **token spine** of the entire Lior Motion OS. Every blueprint in this document
> resolves down to the values declared here. No screen, component, or gesture invents its own
> duration, curve, travel distance, or scale factor — it composes from this set. If a value you
> need is not here, that is a signal to extend this section (and flag it), not to hand-roll a
> one-off `transition: 0.42s ease-in-out` somewhere in a `.tsx` file.
>
> **Source of truth, in priority order:**
> 1. `styles/root-fixes.css` `:root` — the CSS custom properties (`--lior-*`). The *authoritative*
>    definitions. (`styles/root-fixes.css:91-106`.)
> 2. `utils/motion.ts` — the framer-motion mirror (`EASE_SILK`, `springSmooth`, `DUR_PUSH`, …).
>    Component JS animations import from here so JS and CSS stay numerically identical.
> 3. `utils/TransitionEngine.ts` — the route-layer mirror (`T_PUSH = 360`, `E_SILK`, …) for the
>    native View Transitions + JS-clone fallback paths.
>
> These three files are **kept in lockstep by hand**. The rule below (§2.9) and
> `tests/motionExperience.assert.mjs` exist to catch drift. When you change a token, change it in
> all three and re-run the assert.
>
> **The fixed background contract (PRIME DIRECTIVE).** Every token here is tuned so foreground
> motion *never competes with* `components/AmbientVisuals.tsx`. Two structural guarantees make this
> automatic: (a) all gesture/UI motion completes in **≤ 400 ms** while ambient loops run at
> **≥ 2000 ms**, so the two operate on different temporal frequencies and read as foreground vs.
> atmosphere; (b) `TransitionEngine` sets `html[data-transitioning="1"]` for the duration of any
> route change, which `styles/root-fixes.css:115-119` uses to *pause every ambient animation*
> (`animation-play-state: paused !important`) so the stage holds still while the performance moves.
> You do not need to think about this per-component — but you must never introduce a foreground loop
> that runs in the 400–2000 ms band, because that is exactly the frequency where it starts to look
> like it is fighting the background's breathing.

---

### 2.0 The five-tier mental model

Before the tables: everything in Lior motion sorts into **five intent tiers**. Pick the *intent*
first, and the duration / curve / travel / scale all follow from the tier. This is the single most
important habit — engineers reach for a number; designers reach for an intent.

| Tier | Intent (what is the user being told?) | Canonical duration window | Feels like |
| --- | --- | --- | --- |
| **MICRO** | "I felt your touch." Acknowledgement only. | 90–200 ms | Apple haptic tap, Linear button |
| **FAST** | "This thing changed state." A toggle, a chip, a like. | 140–260 ms | Superhuman key-command snap |
| **MEDIUM** | "You moved to a sibling place." Tab, small reveal, sheet settle. | 240–360 ms | iOS tab bar, Notion Calendar |
| **SLOW** | "You went somewhere new / deeper." Push, modal open, expand bloom. | 360–400 ms | iOS push, Arc command bar open |
| **HERO** | "This moment matters." Recap reveal, milestone, partner-response unveil. | 600–900 ms (composed) | Apple Photos Memories, Journal |

> **Note on HERO.** HERO is the one tier with *no single token* — it is always a *composed
> sequence* of MICRO/FAST/MEDIUM/SLOW beats orchestrated with stagger and delay, never one long
> tween. A 900 ms single ease feels sluggish; 900 ms of *choreography* feels cinematic. See §2.1
> "Hero" row and the worked example there. Reserve HERO for genuinely emotional moments — overuse
> bankrupts it.

---

### 2.1 Duration Scale

The canonical millisecond ladder lives in `styles/root-fixes.css:97-106` as `--lior-motion-*` and is
mirrored (in **seconds**, framer's unit) in `utils/motion.ts:24-27` and (in **ms**, named consts) in
`utils/TransitionEngine.ts:17-21`. **Do not introduce intermediate values** (no 300 ms, no 500 ms for
UI) — the gaps between rungs are deliberate; a value that "feels like it needs 320 ms" almost always
wants `push` (360) or `tab` (240), and the discipline of snapping to the ladder is what makes the
whole app feel like one instrument.

| Tier | Token (CSS) | framer (`utils/motion.ts`) | ms | Use it for | Never use it for |
| --- | --- | --- | --- | --- | --- |
| MICRO | `--lior-motion-press` | — (CSS-only, `[data-pressing]`) | **90** | Finger-down press depth; the instant `scale(0.97)` crush on any tappable. | Anything the eye is supposed to *track*; this is felt, not watched. |
| MICRO | `--lior-motion-feedback` | — | **140** | Toggles, switches, small binary state flips, checkbox fills. | Position changes / travel. |
| MICRO | `--lior-motion-micro` | — | **200** | Ripple expand, chip select, like-heart pop, single-property highlight. | Multi-element reveals. |
| FAST/MEDIUM | `--lior-motion-tab` | `DUR_TAB = 0.24` | **240** | Tab switch (`keep-alive-tab-enter`), `.bn-icon` active scale, fast list item settle, modal-*close*. | Going *deeper* (that's push). |
| MEDIUM | `--lior-motion-pop` | `DUR_POP = 0.26` | **260** | Back / pop (old slides off to reveal), snap-back of an abandoned gesture. | Forward navigation. |
| SLOW | `--lior-motion-push` | `DUR_PUSH = 0.36` | **360** | True iOS push, expand/bloom (`lior-vt-expand-in`), transition sheen (`lior-motion-veil`). | Toggles (way too slow → feels broken). |
| SLOW | `--lior-motion-modal` | `DUR_MODAL = 0.38` | **380** | Modal / sheet *rising* from the bottom edge. | Dismissal — dismissal is faster (240, see below). |
| SLOW | `--lior-motion-morph` | — | **400** | Shared-element tile→page morphs that aren't the standard expand (e.g. a memory thumbnail growing into the full memory view). | Anything that isn't a literal shared element growing/shrinking. |
| HERO | *composed* | *composed* | **600–900** | RecapCarousel reveal, milestone celebration, DailyQuestion partner-response unveil, BonsaiBloom growth. | Routine navigation. **Composed only — never one tween.** |

**Asymmetry law (open slow, close fast).** Entrances earn their length because the user is
*arriving* and the motion is *informing* them where the new thing came from. Exits should get out of
the way: a user dismissing a sheet has already decided to leave. This is why the codebase deliberately
splits modal timing — `T_MODAL_OPEN = 380` vs `T_MODAL_CLOSE = 240`
(`utils/TransitionEngine.ts:20-21`), and why `modal-close` reuses the `pop` (260) keyframe timing in
CSS (`styles/root-fixes.css:427-432`). **General rule: an element's exit is one rung faster than its
entrance.** Push in at 360, the *user's* pop back rides 260; modal up at 380, down at 240.

> **Worked example — "like" a memory card (MICRO, 200 ms).**
> User double-taps a memory.
> - `0 ms`: `data-pressing="true"` lands → `scale(0.97)` at `--lior-motion-press` (90 ms). Haptic
>   `tap` (Light) fires (`services/haptics.ts`).
> - `~90 ms`: press releases; the heart icon plays a single 200 ms (`--lior-motion-micro`) pop —
>   `scale 0.6 → 1.0` on `springSnappy` — and the count crossfades (opacity-only, 200 ms).
> - No travel, no layout, no second loop. Total perceived: one warm "tick." The background never
>   pauses (this is not a route change), so `AmbientVisuals` keeps breathing underneath — correct,
>   because a like is not a navigation event.

> **Worked example — Recap reveal (HERO, ~840 ms composed).** Decomposed into rungs:
> - `0–360 ms`: card pushes in (`push`, `lior-vt-push-in`).
> - `120–360 ms` (overlapping): hero number counts up via a `springGentle` tween while it fades to
>   full opacity *within its first third* (see §2.4).
> - `300–540 ms`: supporting stats stagger in at 60 ms intervals (`staggerContainer(0.06)`,
>   `utils/motion.ts:47`), each on `springSmooth`.
> - `540–840 ms`: a single celebratory accent (e.g. a heart bloom) on `--lior-motion-morph` (400 ms)
>   starting at 440 ms, landing at 840 ms.
> No individual beat exceeds 400 ms; the *sequence* spans 840 ms and reads as cinematic, not slow.

---

### 2.2 Easing Library

Four CSS curves are canonical (`styles/root-fixes.css:93-96`), three of them mirrored as framer
arrays (`utils/motion.ts:19-21`). **The named role matters more than the numbers** — pick the curve
by what the motion is *doing* (arriving? leaving? being pressed?), and the cubic-bezier follows.

| Role | Token (CSS) | framer array | cubic-bezier | When to use | Why this shape |
| --- | --- | --- | --- | --- | --- |
| **Entrance / decel (primary)** | `--lior-ease-silk` | `EASE_SILK` | `cubic-bezier(0.16, 1, 0.3, 1)` | The default for *anything arriving or settling*: push-in, expand bloom, tab-in, reveals, the `.tile-open-lifting` lift. | Near-instant start, long luxurious tail. The thing "lands" and *eases* into rest. This is the Lior signature curve. |
| **Standard / outgoing (gentle)** | `--lior-ease-soft` | `EASE_SOFT` | `cubic-bezier(0.22, 1, 0.36, 1)` | Outgoing halves of paired transitions (the old screen receding), gentle two-way moves, the BottomNav FAB. In TransitionEngine this is `E_STANDARD`, the `outEase` for push/pop/modal. | Slightly softer entry than silk, so a *receding* layer doesn't snap away — it drifts. |
| **Press-in (sharp)** | `--lior-ease-press` | *(CSS-only)* | `cubic-bezier(0.2, 0, 0, 1)` | The down-stroke of a deliberate press where you want crisp contact before the silky release. Pairs with `--lior-motion-press`. | Fast, decisive contact; no soft lead-in — the finger meets resistance *now*. |
| **Accelerate-out (exit)** | `--lior-ease-exit` | `EASE_EXIT` | `cubic-bezier(0.4, 0, 0.2, 1)` | True exits where the element is *leaving for good* and should accelerate off: dismiss strokes, the `modal-close` `outEase` (`E_EXIT`). | Slow start, fast finish — it "throws" the element away, the inverse of silk. |

**Spring configs** (framer-motion, `utils/motion.ts:32-34`). All three are **critically damped — zero
overshoot, zero bounce.** This is a hard brand rule: bounce/elastic reads as "toy," and
`tests/motionExperience.assert.mjs:66-70` will *fail the build* if any `cubic-bezier(...1.56...)`,
`bounce`, or `elastic` appears in the route/press CSS. Springs are for *physical, draggable, or
list-y* surfaces where a duration can't be known ahead of time; tweens (silk/soft) are for
*choreographed* motion where you control the timeline.

| Spring | Params | Use it for | Settle character |
| --- | --- | --- | --- |
| **`springSmooth`** *(default)* | `{ stiffness: 260, damping: 30, mass: 0.9 }` | The default for lists, scroll-reveals (`revealVariants`, `staggerItem`), card settles, most `whileInView`. If unsure, this. | Smooth, unhurried glide into place (~360 ms equivalent). |
| **`springSnappy`** | `{ stiffness: 460, damping: 34, mass: 0.7 }` | Quick UI that should feel *responsive*: toggles, the like-pop, segmented controls, anything FAST-tier that wants spring physics instead of a tween. | Crisp, immediate, settled fast (~200 ms equivalent). |
| **`springGentle`** | `{ stiffness: 170, damping: 26, mass: 1 }` | Large / soft / heavy surfaces: full-bleed panels, the OurRoom 3D card, hero number count-ups, anything where snappiness would feel cheap. | Slow, weighty, deliberate (~520 ms equivalent). |

> **Decision shortcut.** *Choreographed & you own the timeline* → tween (`tweenSilk`/`tweenSoft`).
> *Physical, interruptible, or list-driven* → spring. *Arriving* → silk / smooth. *Leaving for good*
> → exit / soft. *Felt-not-seen press* → press curve.

> **Worked example — a toggle in Settings (FAST, 140 ms).** Use `--lior-motion-feedback` (140 ms)
> for the knob translate, `--lior-ease-soft` for the color crossfade (it's a state change, not an
> arrival), and `springSnappy` if you animate the knob in framer instead. Haptic `toggleOn` /
> `toggleOff`. No silk here — silk's long tail would make a binary switch feel laggy; the soft/snappy
> pairing makes it feel *clicky and sure*.

---

### 2.3 Spatial Motion Rules

Direction is *grammar*. The axis an element travels on tells the user the **relationship** between
where they were and where they are. Lior's spatial grammar is fixed and matches the route engine's
keyframes (`styles/root-fixes.css:321-384`) exactly.

#### Axis → meaning

| Movement | Axis | Meaning | Canonical implementation |
| --- | --- | --- | --- |
| **Forward navigation (deeper)** | **Horizontal** (X, right→left) | "You went one level *in*." | `push`: new enters from `translate3d(100%)`, old parallaxes to `-25%` + dims to 0.7 (`lior-vt-push-in/out`). |
| **Back navigation (shallower)** | **Horizontal** (X, left→right) | "You came back *out*." | `pop`: old slides fully off to `translate3d(100%)` *on top* (z-index 2), revealing the previous screen rising from `-25%` (`lior-vt-pop-*`). |
| **Modal / sheet (temporary, on top)** | **Vertical** (Y, bottom→up) | "A temporary surface rose over your context." | `modal`: enters from `translate3d(0,100%)`; behind recedes to `scale(0.965)` + dims (`lior-vt-modal-*`). |
| **Sheet dismiss** | **Vertical** (Y, up→down) | "That temporary thing went away." | `modal-close`: sheet slides back down *on top* (z-index 2), context settles forward (`lior-vt-modal-close-*`). |
| **Sibling / lateral (same level)** | **Vertical micro-settle** (Y, ±10–14 px) | "You moved sideways to a peer." | `tab`: tiny vertical settle, *symmetric*, never a full horizontal slide (tabs are peers, not a stack). |
| **Open-into / shared element** | **Depth** (Z, scale from origin) | "This thing *became* that page." | `expand`: new page scales from the tapped tile's origin (`--lior-open-x/y`); `morph` for non-tile shared elements. |
| **Scroll reveal** | **Small vertical rise** (Y, +16–22 px) | "Content settling into the page as you arrive." | `revealVariants` (y:16), `staggerItem` (y:18), `.home-reveal` (translateY 22px). |

#### Travel-distance budget per tier

Travel scales with significance, never with whim. **More important = more distance, but capped** —
nothing in the app travels more than one viewport edge.

| Tier | Travel | Source |
| --- | --- | --- |
| MICRO | **0 px** (scale only) or ≤ 2 px (`[data-pressing]` adds `translateY(2px)` on `.spring-press:active`). | `index.css:209`, `:1698` |
| FAST | **0–8 px**. A chip nudge, a toggle knob. | — |
| MEDIUM — tab | **10–14 px** vertical settle (`tab-out` −10 px, `tab-in` +14 px). | `styles/root-fixes.css:321-329` |
| MEDIUM — scroll reveal | **16–22 px** vertical rise. | `utils/motion.ts:42,53`; `styles/root-fixes.css:206` |
| SLOW — push/pop | **Full edge** for the incoming/outgoing primary; **25%** parallax for the secondary (receding) layer. | `styles/root-fixes.css:333-351` |
| SLOW — modal | **Full height** (100%) for the sheet; **1.5%** lift + `scale(0.965)` for the context behind. | `styles/root-fixes.css:354-361` |

**Parallax law (the receding layer moves *less*).** When two surfaces move together, the one going
*away* always travels a fraction of the one arriving — this is what creates depth. In push, incoming
travels 100% while outgoing recedes only 25% (`styles/root-fixes.css:335`). In the JS-clone fallback
the same ratio holds: incoming from `tx(W)`, outgoing to `tx(-W * 0.22)` (`utils/TransitionEngine.ts:62-64`).
**Never make both layers travel the full distance** — that reads as two unrelated screens, not one
spatial relationship.

**Perspective.** 3D perspective is used *sparingly and only on the Home reveal grid*:
`[data-home-reveal-grid] { perspective: 900px }` (`styles/root-fixes.css:250-252`), enabling the
subtle `tiltUp` variant. **Do not add `perspective` to route transitions** — the View Transitions
snapshots are flat 2D compositor layers and a perspective there fights the background's own depth.
Depth in navigation is communicated by *scale + parallax + dim*, never by rotateX/rotateY.

**Layering / z-order law.** For *forward* motions (push, modal-open) the **new** surface paints on
top (default order). For *back* motions (pop, modal-close) the **old** surface paints on top
(`z-index: 2`, `styles/root-fixes.css:451-454`) so it slides off and *reveals* what's underneath —
this is the single detail that makes "back" feel like a real iOS reveal instead of a crossfade.
Honor this in any custom shared-element work: arriving-on-top for forward, leaving-on-top for back.

> **Worked example — opening a TimeCapsule from a Home tile (SLOW, depth, 360 ms).**
> 1. Tap → `useTileOpen()` writes `--lior-open-x/y` to the tile's center and sets
>    `data-lior-open-expand="1"` (`hooks/useTileOpen.ts:65-69`), then calls `navigate('push')`.
> 2. `TransitionEngine.navigate` sees the flag and upgrades `push → expand`
>    (`utils/TransitionEngine.ts:149-150`). `html[data-transitioning="1"]` is set → background pauses.
> 3. The tapped tile runs `.tile-open-lifting` (`scale 1 → 1.035`, shadow `sm → lg`, 300 ms silk,
>    `index.css:1738-1747`) *concurrently* with the route.
> 4. The new page blooms via `lior-vt-expand-in` (`scale 0.55 → 1`, 360 ms silk) **from the tile's
>    origin** — so the page literally grows out of the card the finger touched. Old screen recedes
>    (`expand-out`, `scale 1 → 1.06`, fade).
> 5. `vt.finished` (or the dur+400 ms watchdog) clears `data-transitioning` → background resumes.
> The grammar reads as: *this tile WAS a doorway, and you walked through it.*

---

### 2.4 Opacity System

Opacity is for **presence**, not for **movement**. Lior moves objects with *transform*; opacity only
ever answers "is this thing here yet / still here?" Mixing the two muddily — fading something halfway
while it slides halfway — produces the "ghostly, cheap" look the brand has rejected. The laws below
are enforced in the keyframes and in `tests/motionExperience.assert.mjs:81-87` (every navigation
keyframe is asserted to use **transform + opacity ONLY**).

**Endpoints.** Fades always run **`0 → 1`** on entrance and **`1 → 0`** on a true exit — never
partial (no `0.3 → 0.8`). The *one* sanctioned exception is the **receding-layer dim**: a secondary
surface that stays present but drops back fades only to **`0.7`** (push-out, modal-out,
`styles/root-fixes.css:335,356`). It never goes to 0 because it is still *there*, just behind.

**The "first-third" law (the most important opacity rule in the system).** *An incoming element must
reach full opacity within the first ~30% of its duration, then complete the rest of its journey by
pure spatial movement at opacity 1.* You should **never** see an element fading while it is still
travelling through the middle of its path — that is the hallmark of amateur motion. This is baked
directly into the keyframes:
- `lior-vt-tab-in`: opacity hits 1 at the `30%` keyframe, transform continues to `to`
  (`styles/root-fixes.css:325-329`).
- `lior-vt-push-in`: opacity is `1` the *entire* time — a true push is pure movement, zero fade
  (`styles/root-fixes.css:337-340`).
- `lior-vt-expand-in`: opacity reaches 1 at `40%` while scale keeps growing to 1
  (`styles/root-fixes.css:376-380`).
- `lior-vt-modal-close-in`: opacity at `35%` (`styles/root-fixes.css:368-372`).

When you author a new entrance, put the `opacity: 1` keyframe at ≤ 33% and let transform do the rest.

**Crossfade rules.** True crossfades (A fading out *as* B fades in, both mid-opacity simultaneously)
are **banned for navigation** — navigation is spatial (transform), not a dissolve. Crossfade is
permitted only in three places: (1) the **reduced-motion fallback** (`_xfade`, a 150 ms linear
opacity swap, `utils/TransitionEngine.ts:259-276`); (2) **cached tab shells**, which use an
opacity-*only* silk fade because the heavy tab is staying warm and must not re-rasterize
(`keep-alive-tab-enter`, `styles/root-fixes.css:186-200`); (3) **same-position content swaps** (e.g.
a stat value updating in place) where there is no spatial relationship to express.

**Shared-transition opacity.** For shared-element / expand morphs, the *new* surface is opaque
quickly (≤ 40%) and the *old* surface fades to 0 as it scales up and away (`expand-out`: `1 → 0`
while `scale 1 → 1.06`). The shared element itself never blinks — continuity of the object is the
whole point of a morph.

> **Worked example — InsightWhisper appearing on Home (MEDIUM reveal).** It uses `revealVariants`
> (`hidden: {opacity:0, y:16}` → `visible: {opacity:1, y:0}` on `springSmooth`,
> `utils/motion.ts:41-44`). Because springs front-load, opacity is effectively full within the first
> third of the settle while the 16 px rise finishes underneath at opacity 1 — first-third law,
> satisfied for free. No background interaction needed: this is a reveal, not a route, so
> `AmbientVisuals` keeps running and the whisper rises *over* the live stage.

---

### 2.5 Scale System

Scale communicates **physical relationship** — pressure (press-down), elevation (lift), and origin
(things growing *out of* other things). The canonical scale values, and the rule that separates
"felt" from "seen":

| Token / factor | Value | Meaning | Source |
| --- | --- | --- | --- |
| **Press (global)** | `scale(0.97)` | Generic finger-down on any tappable (`[data-pressing]`). Instant in (0 ms), spring out. | `index.css:209-211` |
| **Press (`.spring-press`)** | `scale(0.955) translateY(2px)` + `brightness(0.94) saturate(1.06)` | The deep, deliberate "physical crush" for primary buttons. 60 ms in, 300 ms `--spring-bounce` release. | `index.css:1697-1700` |
| **Card lift** | `scale(1.035)` + shadow `sm → lg` | A tile "picking itself up" as you open it (`.tile-open-lifting`), or hover/focus elevation. | `index.css:1738-1747` |
| **Stagger item entry** | `scale(0.98) → 1` | List/grid items settling in. | `utils/motion.ts:53` |
| **Home reveal** | `scale(0.985) → 1` (and `0.94/0.965/0.975` per variant) | Section entrances. | `styles/root-fixes.css:205-248` |
| **Expand origin (in)** | `scale(0.55) → 1` from tile origin | A page blooming out of a tapped tile. | `styles/root-fixes.css:376-380` |
| **Expand origin (out)** | `scale(1) → 1.06` | The leaving screen pushing back into depth. | `styles/root-fixes.css:381-384` |
| **Push/pop recede** | `scale(0.96)` | The parallaxing secondary layer. | `styles/root-fixes.css:335,349` |
| **Modal recede** | `scale(0.965)` | Context dropping behind a sheet. | `styles/root-fixes.css:356,369` |
| **Tab settle** | `scale(0.985 → 1)` in, `1 → 1.008` out | Peer-level micro-settle. | `styles/root-fixes.css:321-329` |

**The perceptible-vs-imperceptible threshold.** Scale changes split into two psychological bands:

- **Imperceptible / "felt" (Δ ≤ ~3.5%):** the user *feels* it but does not consciously *watch* it.
  This is the band for **acknowledgement and elevation** — press (`0.97`, a 3% crush), card lift
  (`1.035`, a 3.5% rise), settle (`0.985`). These must be paired with the right *speed*: a 3% change
  over 90 ms reads as tactile; the same 3% over 400 ms reads as broken. **Felt-scale always rides
  MICRO/FAST durations.**
- **Perceptible / "seen" (Δ ≥ ~10%):** the user consciously tracks the size change as *spatial
  storytelling*. This is the band for **origin morphs** — expand-in from `0.55` (a 45% growth),
  expand-out to `1.06`. These must ride SLOW durations (360–400 ms) and a transform-origin so the
  eye can follow the growth *from somewhere*. **Seen-scale always has an origin and always rides
  SLOW.**

The **dead zone is 3.5%–10%**: a scale change in that band is large enough to notice but too small to
read as intentional storytelling — it just looks like a wobble. **Never author a scale in the dead
zone.** Either commit to felt (≤ 3.5%) or to seen (≥ 10%).

**Origin discipline.** Felt-scale uses `transform-origin: center` (the thing pulses in place).
Seen-scale uses a *meaningful* origin — for expand, the literal pixel center of the tapped tile via
`--lior-open-x/y` (`hooks/useTileOpen.ts:67-68`). A morph from the wrong origin (e.g. center when the
tile was in a corner) breaks the illusion entirely; always wire the origin to the source element's
`getBoundingClientRect()` center.

> **Worked example — primary CTA press on Premium (MICRO).** Finger lands → `.spring-press:active`
> crushes to `scale(0.955) translateY(2px)` over 60 ms with a brightness/saturate dip (the surface
> visibly "depresses and warms"), haptic `press` (Medium) fires. Release → 300 ms `--spring-bounce`
> settle back to rest. The whole thing is ≤ 3.5% felt-scale on a MICRO clock — tactile, never
> watched. (Note: `index.tsx:46` suppresses this scale on near-full-screen surfaces so pressing a
> modal backdrop never reveals layer edges — a guard you inherit for free via the global delegation.)

---

### 2.6 Motion Accessibility — *preserve delight, never just disable*

Lior's accessibility philosophy is the opposite of the usual `* { animation: none }` sledgehammer
(which `tests/motionExperience.assert.mjs` would in fact break, since it asserts specific keyframes
*exist*). The goal in every reduced/constrained mode is to **keep the emotional intent** — the warmth,
the acknowledgement, the sense that the app responds to you — while removing the specific thing the
constraint is about (vestibular trigger, battery drain, or GPU cost). **Opacity and color survive;
large transforms and loops are what get traded away.**

#### 2.6.1 Reduced-motion mode (OS "Reduce Motion")

Wired at three layers so nothing slips through:

1. **Global framer layer** — `<MotionConfig reducedMotion="user">` wraps `<App/>`
   (`index.tsx:116`). Every framer-motion animation app-wide automatically becomes **opacity-only**
   (no transform, no layout). You write your animations once with transforms; framer strips them
   under reduce-motion for free.
2. **Route layer** — `TransitionEngine` reads the media query into `this._mo`
   (`utils/TransitionEngine.ts:115-117`) and routes to `_xfade` — a **150 ms linear opacity
   crossfade** (`:259-276`) instead of slides/blooms. Navigation still *happens visibly*; it just
   dissolves instead of travels. The native VT path also degrades:
   `::view-transition-* { animation-duration: 0.001ms }` (`styles/root-fixes.css:457-462`).
3. **CSS layer** — `@media (prefers-reduced-motion: reduce)` snaps `.home-reveal`,
   `.home-reveal-item`, `.keep-alive-shell.is-active` to `animation: none; opacity: 1; transform:
   none` (`styles/root-fixes.css:269-277`) and disables `.tile-open-lifting`
   (`index.css:1748-1750`). Hooks also short-circuit: `useTileOpen` checks the query and navigates
   *instantly* with no lift (`hooks/useTileOpen.ts:51-57`).

**What is preserved (the delight that survives):** opacity fades (so content still *arrives*, never
just pops), color/brightness state changes, haptics (haptics are not motion — the `tap`/`press`
ladder fires unchanged, keeping the app feeling alive to touch), and instantaneous state correctness.
**What is removed:** large translations, scale blooms, parallax, perspective tilt, and all ambient
loops' *movement* (the background's color wash can remain; its drift should quiet).

> **Worked example — push navigation under reduce-motion.** Instead of the 360 ms horizontal slide,
> `_xfade` fades the container to 0 over 150 ms linear, commits React, fades back to 1. The user
> still perceives "I went somewhere" (the screen changed, with a soft dissolve) and still gets the
> navigation haptic — but there is zero horizontal travel to trigger vestibular discomfort.

#### 2.6.2 Battery-saver mode

Trigger off the Battery Status API (`navigator.getBattery()`, `level < 0.2 && !charging`) — or honor
`prefers-reduced-data` where present. Battery saver is **not** reduced-motion: the user is fine with
motion, they just can't afford the *power* of continuous GPU work. So the trade is **loops, not
gestures**:

- **Keep, untouched:** all gesture/UI motion (press, push, pop, modal, tab, expand). These are
  short, user-initiated, and already pause the background. They are not the battery problem.
- **Quiet:** drop the AnimationEngine target tier to **`low` (30 fps)** or **`medium` (60 fps)** via
  `AnimationEngine.setTier('low')` (`utils/AnimationEngine.ts:136-143`). Heavy ambient subscribers
  with a higher `minTier` simply stop being ticked (`:189-190`) — the R3F `LiveBackground3D` /
  `FloatingHeartsScene` and any `backdrop-filter` work fall away, leaving the cheap CSS wash
  (`AmbientMotionFallback`) carrying the brand.
- **Stop:** `backdrop-filter` blur (the single most expensive per-frame mobile GPU op — already
  killable via `[data-skip-blur-on-transition]`, `styles/root-fixes.css:123-127`; reuse the same
  attribute pattern app-wide in this mode).

The emotional read is preserved because the *gestures the user actually touches* are untouched; only
the idle atmosphere dims.

#### 2.6.3 Low-end-device mode

This is the **performance** path, tied directly to `utils/AnimationEngine.ts`'s 5-tier system —
`ultra (120) / high (90) / medium (60) / low (30) / css-only`. (Note: the current Capacitor build
*locks* tier at `ultra` for visual consistency — `tier = 'ultra'`, `:89`, with `_adaptTier` a no-op
`:151-153`; re-enabling adaptive downgrade is the lever for low-end devices, and the thresholds are
already specified at `:67-73`: downgrade below 100 fps sustained with a 5 s lock, upgrade above
108 fps for ~1.5 s with an 8 s lock.)

Degradation ladder by tier (from the file header, `:8-13`):

| Tier | fps | What's on |
| --- | --- | --- |
| `ultra` | 120 | All effects, full particle count. |
| `high` | 90 | WebGL on, particles 70%. |
| `medium` | 60 | `backdrop-filter` disabled, particles 40%. |
| `low` | 30 | Canvas-only, no WebGL, no blur. |
| `css-only` | — | All JS animation off; **pure CSS carries everything.** |

The critical design guarantee: **even at `css-only`, the app is still delightful**, because the
*entire navigation/press/reveal vocabulary is already pure CSS* (View Transitions keyframes,
`[data-pressing]`, `.tile-lift`, `.home-reveal`, `keep-alive-tab-enter`). Only the *ambient
atmosphere* (R3F scenes, particle counts, the AnimationEngine-driven `--breathe-phase` style bus,
`:46-52`) degrades. A user on a 2019 budget Android still gets the silk push, the tile bloom, the
press crush, and the warm reveals — they just get the simpler background wash. That is the difference
between "accessible" and "accessible *and still premium*."

**Tier-aware authoring rule.** Any new heavy/continuous effect MUST: (a) subscribe through
`AnimationEngine` (never call `requestAnimationFrame` directly — see the file's own rule, `:9-10`);
(b) declare an honest `minTier` and `budgetMs`; (c) contribute CSS vars via `cssProps()` so all
writes batch into one paint boundary per frame (`:46-52,201-213`); and (d) skip work when
`html[data-transitioning="1"]` is set so route transitions always get the full GPU budget.

---

### 2.7 The clean tokens table (authoritative quick-reference)

Copy-paste reference. CSS column = `styles/root-fixes.css` `:root`; framer column = `utils/motion.ts`;
route column = `utils/TransitionEngine.ts`.

#### Durations

| Name | CSS var | ms | framer (s) | TransitionEngine |
| --- | --- | --- | --- | --- |
| Press | `--lior-motion-press` | 90 | — | — |
| Feedback | `--lior-motion-feedback` | 140 | — | — |
| Micro | `--lior-motion-micro` | 200 | — | — |
| Tab | `--lior-motion-tab` | 240 | `DUR_TAB` 0.24 | `T_TAB` 240 |
| Pop | `--lior-motion-pop` | 260 | `DUR_POP` 0.26 | `T_POP` 260 |
| Push | `--lior-motion-push` | 360 | `DUR_PUSH` 0.36 | `T_PUSH` 360 |
| Modal (open) | `--lior-motion-modal` | 380 | `DUR_MODAL` 0.38 | `T_MODAL_OPEN` 380 |
| Modal (close) | *(reuses pop)* | 240 | — | `T_MODAL_CLOSE` 240 |
| Morph | `--lior-motion-morph` | 400 | — | — |
| Ambient loop floor | *(convention)* | ≥ 2000 | — | — |

#### Easing

| Name | CSS var | cubic-bezier | framer | TransitionEngine |
| --- | --- | --- | --- | --- |
| Silk (entrance/decel) | `--lior-ease-silk` | `0.16, 1, 0.3, 1` | `EASE_SILK` | `E_SILK` |
| Soft (outgoing/standard) | `--lior-ease-soft` | `0.22, 1, 0.36, 1` | `EASE_SOFT` | `E_STANDARD` |
| Press (sharp in) | `--lior-ease-press` | `0.2, 0, 0, 1` | — | — |
| Exit (accel out) | `--lior-ease-exit` | `0.4, 0, 0.2, 1` | `EASE_EXIT` | `E_EXIT` |

#### Springs (framer, all critically damped, zero overshoot)

| Name | stiffness | damping | mass | Use |
| --- | --- | --- | --- | --- |
| `springSmooth` | 260 | 30 | 0.9 | default — lists, reveals |
| `springSnappy` | 460 | 34 | 0.7 | quick UI, toggles, pops |
| `springGentle` | 170 | 26 | 1.0 | large/soft/heavy surfaces |

#### Scale & travel constants

| Token | Value | Band |
| --- | --- | --- |
| Generic press | `scale(0.97)` | felt |
| Deep press (`.spring-press`) | `scale(0.955) translateY(2px)` | felt |
| Card lift | `scale(1.035)` | felt |
| Settle (tab/reveal) | `scale(0.985)` | felt |
| Recede (push/pop) | `scale(0.96)` | felt |
| Recede (modal) | `scale(0.965)` | felt |
| Expand-in origin | `scale(0.55)` | seen |
| Expand-out | `scale(1.06)` | seen |
| Push parallax | `-25%` (incoming `100%`) | — |
| Tab settle travel | `±10–14 px` | — |
| Scroll-reveal rise | `16–22 px` | — |
| Receding-layer dim floor | `opacity 0.7` | — |

---

### 2.8 Anti-patterns (hard "do nots")

- **No bounce / elastic / overshoot curves** anywhere in navigation or press. (`cubic-bezier(…1.56…)`,
  `bounce`, `elastic` fail `tests/motionExperience.assert.mjs:66-70`.) Springs are *critically
  damped*; the only sanctioned whisper of overshoot is the ~0.3% on `.spring-press` release, which is
  felt, not seen (`index.css:1691-1694`).
- **No `* { animation: none }` reduced-motion shortcut.** It deletes the keyframes the assert
  requires to exist and kills delight. Degrade per the three-layer model in §2.6.1.
- **No off-ladder durations for UI** (no 300/420/500 ms). Snap to the rung. (HERO sequences compose
  rungs; they don't invent new ones.)
- **No opacity fading mid-travel.** Reach full opacity in the first third (§2.4).
- **No dead-zone scale (3.5%–10%).** Commit to felt or seen (§2.5).
- **No foreground loop in the 400–2000 ms band.** That frequency competes with the background's
  breathing (§2.0 / PRIME DIRECTIVE).
- **No raw `requestAnimationFrame`.** Subscribe to `AnimationEngine` (`utils/AnimationEngine.ts:9-10`).
- **No transform/origin movement on the receding layer beyond its parallax fraction.** Both layers
  travelling full distance breaks the depth illusion (§2.3).
- **No keyframe animating `height/width/top/left/margin/padding/filter/backdrop-filter`** in any
  `lior-vt-*` / `keep-alive*` / `lior-motion*` keyframe — transform + opacity only
  (`tests/motionExperience.assert.mjs:81-87`).

---

### 2.9 Keeping the three mirrors in sync

The tokens live in three files **by hand**. When you touch a value:

1. Edit `styles/root-fixes.css` `:root` (the authority).
2. Mirror it in `utils/motion.ts` (framer, seconds for durations, arrays for easings).
3. Mirror it in `utils/TransitionEngine.ts` (route consts, ms; `E_*` curve strings).
4. Run `node tests/motionExperience.assert.mjs` — it verifies the silk curve string, the keep-alive
   fade, the transform-only keyframe law, the absence of bounce, and the keep-alive-shell off-flow
   contract. Green = the spine is consistent.

If a new token is genuinely needed, add it to all three, add a row to §2.7, and note it in the doc's
"new tokens introduced" log so the next author knows it exists.
## 3. Motion Layer Architecture (around the fixed background)

> **Scope.** This section defines the seven-layer motion stack of Lior and the
> master contract that guarantees foreground motion *never competes with the
> fixed Home background*. Layer 1 is read directly from the shipped code
> (`components/AmbientVisuals.tsx`, `components/LiveBackground.tsx`,
> `components/LiveBackground3D.tsx`, `components/Layout.tsx`) and is **immutable**
> — Layers 2–7 are designed to orbit it. Every rule here is the law the rest of
> this document (Sections 4–N) obeys. All easings/durations/springs are the
> canonical tokens from `styles/root-fixes.css :root`, `utils/motion.ts`, and
> `utils/TransitionEngine.ts`. No new tokens are introduced.

---

### 3.0 Why a layer architecture at all

Lior is not a flat app. It is a **fixed, breathing stage** (the ambient
background) with a **performance** stacked in front of it. The single most
common way a "premium" couples app turns cheap is *every layer animating at
once*: the background drifts, the cards spring, the tab bar slides, a toast
pops, confetti fires — and the eye has no anchor. The result reads as noise, not
craft (Apple Photos Memories never lets the Ken-Burns pan fight the caption
fade; visionOS never lets a window's enter animation fight the environment).

The architecture below assigns every animatable surface to exactly one of seven
**z-ordered motion layers**, and gives each layer a strict budget: what it may
animate, how much may move at once, whether it may blur, and — critically —
**whether it must hold perfectly still while a layer above it moves.** The whole
system is governed by one inviolable rule, the *Background Primacy Rule* (§3.9):
**when anything in L3–L7 moves spatially, L1 and L2 go quiet.** This is already
half-built in the codebase via `<html data-transitioning>` /
`data-ambient-motion-paused` / `data-tab-transitioning`; this section formalises
it into a complete contract.

---

### 3.1 The seven layers at a glance

| Layer | Name | z-index range | Lives in | Moves? | Quiets when above moves? |
|------:|------|---------------|----------|--------|--------------------------|
| **L1** | Fixed ambient background (BRAND ASSET) | `z-0` (and `z-[2]` vignette) | `AmbientVisuals`, `LiveBackground`, `LiveBackground3D`, `FloatingHeartsScene`, Layout vignette | Continuous ambient loops ≥ 2000 ms only | **Always** — pauses on any transition |
| **L2** | Ambient interface elements | `z-[1]`…`z-[5]` (inside content), `z-[45]` veil | In-content shimmers, breathing glyphs, `data-lior-motion-veil` | Slow loops + transition-scoped sheen | **Yes** — pauses with L1 on transition |
| **L3** | Primary content (the page) | `z-10` (scroll wrapper `.lenis-wrapper`) | `views/*`, keep-alive shells | Reveals, route transforms, scroll | n/a (it is the thing that moves) |
| **L4** | Interactive elements | `z-10`…`z-20` (in-flow, above siblings) | tiles, buttons, toggles, inputs, cards | Press, tap, toggle, like, drag | Must hold still during route transitions |
| **L5** | Navigation chrome | `z-[60]` BottomNav | `BottomNav`, edge-back gesture surface | Pill glide, icon scale, FAB press | Holds still during route push/pop |
| **L6** | Celebrations | `z-[60]` confetti / trail canvases | `PhysicsConfetti`, `TouchTrailCanvas`, `CrystalHeart`, `TapRipple` | Particle bursts, one-shot bloom | Suspends during transitions |
| **L7** | Sheets / modals / overlays | `z-50`, `z-[100]`, `z-[190]`, `z-[200]`, `z-[9999]` | `ConfirmModal`, `PremiumModal`, `GestureModal`, `DynamicToast`, full-screen views | Sheet rise/fall, scrim fade | Forces L1–L6 to maximum quiet |

The z-index numbers above are **real**, harvested from the current tree
(`Layout.tsx:126` vignette `z-[2]`, `Layout.tsx:194` veil `z-[45]`,
`BottomNav.tsx:160` `z-[60]`, `DynamicToast.tsx:41` `z-[100]`,
`ConfirmModal.tsx:54` / `PremiumModal.tsx:130` `z-[200]`, `App.tsx:1167` crash
overlay `z-[9999]`). §3.10 reconciles them into a single normative ladder.

---

### 3.2 Layer 1 — The fixed ambient background (BRAND ASSET — do not redesign)

**This layer is frozen.** Section 0's Prime Directive forbids redesigning it.
The job here is to *document its exact motion identity* so Layers 2–7 can be
tuned to never collide with it.

#### 3.2.1 Composition (from `components/AmbientVisuals.tsx`)

`AmbientVisuals` is a `React.memo` orchestrator (`AmbientVisuals.tsx:238`)
mounted once in `Layout` (`Layout.tsx:119`) and **never remounted across tab
switches** — Layout drills no `paused` prop precisely so toggling
`data-transitioning` cannot break the memo bailout
(`Layout.tsx:115-118`). It composes a progressively-enhanced stack that
promotes itself through three stages (`AmbientStage = 'fallback' | 'live-3d' |
'hearts'`, `AmbientVisuals.tsx:25`) only `runWhenQuiet` — i.e. never while input
is pending or a transition is mid-flight (`AmbientVisuals.tsx:178-194`):

1. **`LiveBackground`** (`LiveBackground.tsx:11`) — three **static** radial
   gradient pools anchored to the corners (`contain: strict`, `z-0`,
   `pointer-events:none`). *Zero motion.* It is the always-present floor; it
   never animates and never blurs (deliberately — see its header comment: no
   runtime blur, no continuously-animated fixed layers).
2. **`AmbientMotionFallback`** (`AmbientVisuals.tsx:63`) — the CSS wash + sheen.
   Two layers: `liorAmbientWashDrift` (24 s `ease-in-out infinite alternate`,
   `AmbientVisuals.tsx:132`) and `liorAmbientSheenSweep` (30 s,
   `AmbientVisuals.tsx:145`). Both are **transform + opacity only**, both honour
   `prefers-reduced-motion: reduce → animation:none`
   (`AmbientVisuals.tsx:112-116`), both pause on
   `:root[data-ambient-motion-paused]`, `[data-transitioning]`,
   `[data-tab-transitioning]` (`AmbientVisuals.tsx:106-110`).
3. **`LiveBackground3D`** (lazy, R3F) — a `THREE.Points` field: 24 bokeh orbs +
   10 sparkles (`LiveBackground3D.tsx:27-29`), Lissajous orbits, a per-particle
   breathing alpha, slow camera Z-breath + scroll parallax. It runs on the
   **shared RAF** via `AnimationEngine.register({ id:'live-bg-3d', priority:3,
   budgetMs:4, minTier:'medium' })` (`LiveBackground3D.tsx:331`) and bails on
   every frame when `pausedRef.current` or
   `document.documentElement.dataset.transitioning` is set
   (`LiveBackground3D.tsx:338-341`). Rendered at `pixelRatio ≤ 1.0 × 0.35`
   (`LiveBackground3D.tsx:108`) with `NormalBlending` (not additive — so it can
   never blow the warm light background to white, `LiveBackground3D.tsx:287`).
   Crucially its shader alpha is **whisper-quiet by design** — `vAlpha` mixes
   only `0.16 → 0.08` (`LiveBackground3D.tsx:250`); the background was tuned to
   *stay atmospheric and never fight content*. This is the contract foreground
   layers inherit.
4. **`FloatingHeartsScene`** (lazy, R3F) — the final promotion stage, gated
   identically on `effectivePaused`.

#### 3.2.2 The vignette (the second half of L1)

`Layout.tsx:125-140` paints a **fixed, never-moving** radial vignette at
`z-[2]`, promoted to its own compositor layer (`transform: translateZ(0)`,
`contain: strict`) precisely so scrolling content underneath it does **not**
invalidate its paint each frame. Treat the vignette as part of L1: it is static
and must remain static. Nothing in L2–L7 may re-tint or animate it.

#### 3.2.3 L1 motion budget (FIXED — reproduced, not designed)

| Property | Value |
|----------|-------|
| z-index | `0` (gradient/3D), `2` (vignette) |
| May animate | wash drift (24 s), sheen sweep (30 s), bokeh orbits + breath, camera Z-breath + scroll parallax — **all ≥ 2000 ms loops** |
| Animatable props | **transform + opacity (CSS); shader alpha + point position (GL).** Never width/height/filter. |
| Max simultaneous movement | The whole field counts as **one** ambient motion unit — it never escalates |
| Blur | **None at runtime.** Softness is faked (low GL pixel ratio + Gaussian shader, `LiveBackground3D.tsx:106-108`). No CSS `blur()`/`backdrop-filter` ever lives here |
| Depth/scale | Camera Z-breath ±3 units; canvas `scale(1.06)` over-render to hide edges (`LiveBackground3D.tsx:385`) |
| Must hold still while other layers move? | **YES — unconditionally.** Pauses on `data-transitioning`, `data-tab-transitioning`, `data-ambient-motion-paused`, and `visibilityState:hidden` |

**Hard rule for the rest of the system:** you may *read* L1's pause flags, you
may *set* them (via the engine / Layout's view list), but you may not add
geometry to it, change its colours outside the theme tokens, or raise its
opacity ceiling. It is the stage.

---

### 3.3 Layer 2 — Ambient interface elements

L2 is the bridge between the brand background and real UI: in-content shimmers,
breathing hint dots (`animate-breathe` on the BottomNav notification heart,
`BottomNav.tsx:309`), slow gradient sheens on cards, the **motion veil**
(`data-lior-motion-veil`, `Layout.tsx:192-203`), and any decorative loop that is
*part of the interface chrome* rather than the page content. It is the only
foreground layer permitted to run a continuous loop.

| Property | Value |
|----------|-------|
| z-index | `z-[1]`…`z-[5]` when inside content; the veil sits at `z-[45]` (above content, below nav) |
| May animate | slow opacity/transform loops (breathing, shimmer), and the **transition-scoped** veil sheen |
| Animatable props | **transform + opacity ONLY** (enforced by `motionExperience.assert.mjs:81-87` for any `lior-*` keyframe) |
| Max simultaneous movement | **1 idle loop per visible surface, ≤ 2 across the whole screen.** A screen with a breathing dot *and* a shimmering card is the ceiling |
| Loop duration floor | **≥ 2000 ms** (matches L1's ≥ 2 s rule so L2 reads as ambient, not as feedback) |
| Blur | Discouraged. If a glass card uses `backdrop-filter`, it MUST carry `data-skip-blur-on-transition` so it drops blur during transitions (`root-fixes.css:123-127`) |
| Depth/scale | ≤ `scale(1.08)` excursion (matches the wash's `1.04→1.07`); no parallax that competes with the 3D field |
| Must hold still while other layers move? | **YES** — L2 obeys the same pause flags as L1 (§3.9). The veil is the sole exception: it *only* runs during a transition (`root-fixes.css:137-141`) |

**The motion veil is the canonical L2 citizen.** It is a diagonal light sheen
that is `opacity:0` at idle (`root-fixes.css:129-135`) and animates
`lior-motion-veil` **only** while `html[data-transitioning="1"]`
(`root-fixes.css:137-147`), synced to `--lior-motion-push` (360 ms). It is the
one decorative element allowed to move *with* a route change, because it is
*caused by* the route change — it reinforces the gesture instead of competing
with it. New L2 decorations should follow this pattern: either a ≥ 2 s ambient
loop that pauses on transition, or a transition-scoped one-shot that lives and
dies inside the route window.

---

### 3.4 Layer 3 — Primary content (the page)

L3 is the scrolling page body: the `.lenis-wrapper` / `.lenis-content` column
(`Layout.tsx:153-190`, `z-10`) and, beneath it, the **keep-alive shells**
(`root-fixes.css:171-200`). This is the layer that *carries* the route
transition — when you push to a detail view, **L3 is what slides.**

| Property | Value |
|----------|-------|
| z-index | `z-10` (scroll wrapper); shells flip `z-index:0` (cached) ↔ `1` (active) |
| May animate | route transforms (push/pop/tab/modal/expand), scroll-reveal entrances, native scroll |
| Animatable props | route layer: **transform + opacity only** (View Transitions snapshots; `lior-vt-*` keyframes, `root-fixes.css:321-384`). Reveals: `lior-home-reveal` translate+scale+opacity (`root-fixes.css:261-266`) |
| Max simultaneous movement | **One route transition at a time** (`TransitionEngine._busy` gate, `TransitionEngine.ts:141`). Within a page, staggered reveals are allowed but capped (§3.4.2) |
| Blur | The page may host glass cards, but every blurred surface used during nav must carry `data-skip-blur-on-transition` |
| Depth/scale | push: incoming `translate3d(100%)`, outgoing parallax `-25%` + `scale(0.96)` + dim to `0.7` (`root-fixes.css:333-340`). expand: bloom from tapped tile origin `scale(0.55→1)` (`root-fixes.css:376-380`) |
| Must hold still while other layers move? | It *is* the mover. But when **L7** opens over it, L3 freezes (it becomes the receding/dimmed backdrop, `lior-vt-modal-out`, `root-fixes.css:354-357`) |

#### 3.4.1 The route engine is the spine of L3

`utils/TransitionEngine.ts` owns all L3 page transitions. Two flows:
**programmatic** (`navigate(dir, commit)`, native View Transitions API path with
a JS-clone fallback, `TransitionEngine.ts:136-184`) and **gesture-back** (1:1
finger-tracked left-edge swipe, `EDGE_PX = 28`, `TransitionEngine.ts:348-482`).
Directions and their L3 choreography:

- **`tab`** (240 ms, `T_TAB`) — symmetric vertical settle; same hierarchy level.
- **`push`** (360 ms, `T_PUSH`) — true iOS push: new from `translate3d(100%)`,
  old parallaxes `-25%` and dims.
- **`pop`** (260 ms, `T_POP`) — old slides off-right **on top** (z-index 2,
  `root-fixes.css:451-454`) revealing the previous screen forward from depth.
- **`modal` / `modal-close`** (380 / 260 ms) — sheet rises/falls (this is the
  L3↔L7 handoff; see §3.8).
- **`expand`** (uses `T_PUSH` timing) — tile bloom; origin from
  `--lior-open-x/y` set by `hooks/useTileOpen.ts:65-69`. The engine *upgrades* a
  flagged `push` into `expand` (`TransitionEngine.ts:148-151`).

#### 3.4.2 In-page reveal budget

`lior-home-reveal` (520 ms silk, `root-fixes.css:202-209`) staggers Home tiles
via `--home-reveal-delay` in **30 ms steps capped at 6 children**
(`root-fixes.css:254-259`). This is the L3 stagger ceiling: **no more than 6
simultaneously-revealing items, total entrance window ≤ ~800 ms** (last delay
280 ms + 520 ms duration). Long lists use `content-visibility:auto`
(`root-fixes.css:225-228`, `.cv-auto` `root-fixes.css:156-159`) so off-screen
rows don't animate or paint at all. Reduced motion snaps all of this to
`opacity:1; transform:none` (`root-fixes.css:269-277`).

---

### 3.5 Layer 4 — Interactive elements

L4 is everything the finger touches *inside* the page: tiles, buttons, toggles,
inputs, like-hearts, drag handles. These animate on **explicit product
actions** (the documented haptics/press rule from `index.tsx`). L4 lives *in
flow* with L3 (typically `z-10`–`z-20` against its siblings) and rides whatever
L3 does during a route change — it must not run its own animation while the page
is transitioning.

| Property | Value |
|----------|-------|
| z-index | in-flow within L3 (`z-10`–`z-20` for raised cards/badges) |
| May animate | press (`.spring-press` + `data-pressing`), tap ripple (`ripple-ink-circle`, `Layout.tsx:76-90`), toggle, like, chip-select, the tile-open lift (`tile-open-lifting`, `useTileOpen.ts:71`) |
| Animatable props | **transform + opacity** (+ `color` micro-transitions like the nav icon's 60 ms color flip, `BottomNav.tsx:303-305`). Never layout props |
| Duration | press `--lior-motion-press` (90 ms) · feedback 140 ms · micro (ripple/like) 200 ms. Springs: `springSnappy` for toggles, `springSmooth` for cards (`utils/motion.ts:32-33`) |
| Max simultaneous movement | **One press + one ripple per pointer.** Multiple cards may *enter* together (governed by L3's reveal budget), but only the touched element gives feedback |
| Blur | Never. Press feedback is transform/opacity; blur on a pressed element reads as lag |
| Depth/scale | press-down `scale ~0.92–0.96`; tile-lift `scale(1.035)` + shadow (kept ≤ 300 ms so it overlaps the route push, `useTileOpen.ts:21-23`) |
| Must hold still while other layers move? | **YES during route transitions.** `html[data-transitioning="1"] *` pauses all animations (`root-fixes.css:115-119`) — L4 feedback is *suspended* while a page slides, then resumes |

**The tile-open lift is the canonical L4→L3 handoff.** Tapping a Home tile
lifts the card (L4 feedback) *and* sets the expand origin so the new page blooms
from that exact tile (L3 transition) — the lift and the bloom run concurrently
(`useTileOpen.ts:79-84`), so the card visibly *becomes* the destination. This is
the single most "premium" micro-moment in the app and the template for any
"this control opened that screen" relationship.

---

### 3.6 Layer 5 — Navigation chrome

L5 is the `BottomNav` (`z-[60]`, `BottomNav.tsx:160`) and the invisible
left-edge gesture-back surface owned by `TransitionEngine`. It is *persistent
chrome* — it must feel rock-stable while pages churn underneath it.

| Property | Value |
|----------|-------|
| z-index | `z-[60]` (above content + veil, below toasts/modals) |
| May animate | pill glide (WAAPI, 240 ms silk, `BottomNav.tsx:26-27,101-112`), icon active scale (`.bn-icon`, `root-fixes.css:285-296`), FAB press (`.bn-fab:active`, `root-fixes.css:303-305`), keyboard hide/show slide (`BottomNav.tsx:164-166`) |
| Animatable props | **transform + opacity only** |
| Max simultaneous movement | **Pill glide + active-icon scale, synced to the same 240 ms** so they land together (`root-fixes.css:288-290`). That's it — one coordinated motion per tab tap |
| Blur | **None live.** The "frosted" look is a baked gradient + inner highlight, deliberately replacing a `backdrop-filter: blur(22px)` that re-rasterised every scroll frame (`BottomNav.tsx:191-205`). Carries `data-skip-blur-on-transition` (`BottomNav.tsx:159`) |
| Depth/scale | pill is positional only; icons scale `0.84→1`; FAB `0.92` on press |
| Must hold still while other layers move? | **Mostly YES.** During a route **push/pop** the bar does NOT slide with the page — it stays anchored (the page transition is L3-only). The pill only moves on a deliberate **tab** switch. The whole bar translates off-screen *only* for the keyboard |

The pill runs on **WAAPI on the compositor thread** so it keeps gliding at
native frame rate even while React is blocked rendering the incoming tab
(`BottomNav.tsx:98-120`). This is why L5 can move *during* an L3 tab transition
without violating the "one mover" feel — they are choreographed to the identical
240 ms silk curve and land in lockstep.

---

### 3.7 Layer 6 — Celebrations

L6 is the emotional payoff layer: physics confetti (`PhysicsConfetti`, deferred
via `DeferredOverlays`, `Layout.tsx:214`), the touch-trail canvas
(`TouchTrailCanvas`, `z-[60]`), crystal-heart bloom (`CrystalHeart.tsx:539`,
`z-[60]`), and tap ripples (`TapRipple.tsx:141`, `z-[60]`). These are **one-shot,
self-terminating bursts** triggered by genuine milestones (a saved memory, a
completed daily question, a streak), never idle loops.

| Property | Value |
|----------|-------|
| z-index | `z-[60]` (same band as nav; fired above content, transient) |
| May animate | confetti particle physics, heart bloom, ripple expansion, touch trail |
| Animatable props | transform + opacity (canvas particles are GPU-drawn) |
| Max simultaneous movement | **One celebration at a time.** A confetti burst and a crystal-heart bloom must not co-fire; queue or coalesce. Trigger via `useConfetti().trigger(x,y)` (`Layout.tsx:94-97`) |
| Duration | one-shot, ≤ ~1500 ms; **must auto-clean** (`ripple-ink-circle` removes itself on `animationend`, `Layout.tsx:89`) |
| Blur | None |
| Depth/scale | full-screen burst from a touch origin `(x,y)`; scale is intrinsic to the particle sim |
| Must hold still while other layers move? | **Suspended during transitions** — `PhysicsConfetti`/`TouchTrailCanvas` are RAF/canvas driven; they read `data-transitioning` and skip, same as the 3D field. A celebration never fires *during* a route change; it fires after the destination settles |

**L6 is the one layer allowed to briefly overpower L1's quiet.** A celebration
is a deliberate crescendo — but because it's one-shot and ≤ 1.5 s, and because
the background is already paused during the navigation that led to it, there is
no sustained competition. After the burst, L6 returns to nothing and L1 resumes
its slow breath.

---

### 3.8 Layer 7 — Sheets, modals, overlays

L7 is the top of the stack: bottom sheets and modals (`PremiumModal` `z-[200]`,
`ConfirmModal` `z-[200]`, `GestureModal` `z-[100]`), toasts (`DynamicToast`
`z-[100]`), full-screen immersive views (`Depths` `z-[190]`, `VoiceNotes` stage
`z-[200]`, media viewers `z-[100]`/`z-50`), and the crash/error overlay
(`App.tsx:1167`, `z-[9999]`). When L7 opens, it is the *sole* focus.

| Property | Value |
|----------|-------|
| z-index | `z-50` … `z-[200]` for product overlays; `z-[9999]` reserved for the fatal-error overlay only |
| May animate | sheet rise/fall (`lior-vt-modal-in/out`, 380/260 ms), scrim/backdrop fade, in-sheet content reveal |
| Animatable props | **transform + opacity** for the sheet shell; in-sheet content may use L3/L4 rules locally |
| Max simultaneous movement | **One sheet + its scrim.** No stacked sheets animating concurrently; a second modal waits for the first |
| Duration | open `--lior-motion-modal` (380 ms) silk-in; close `--lior-motion-pop` (260 ms) — the sheet slides DOWN **on top** (z-index 2, `root-fixes.css:452`) to reveal L3 settling forward |
| Blur | A scrim/backdrop-blur IS allowed here (the overlay is the focus, and it's not on the per-frame scroll path) — but it must drop during the open/close transition window via `data-skip-blur-on-transition` |
| Depth/scale | the page behind (L3) recedes: `scale(0.965)` + dim to `0.7` (`lior-vt-modal-out`, `root-fixes.css:354-357`) |
| Must hold still while other layers move? | L7 forces **maximum quiet below it**: L1+L2 pause (transition flag), L3 dims and freezes as backdrop, L4 feedback suspends, L5 nav is occluded. Only the sheet + its own content move |

**Toasts are the gentle L7 citizen.** `DynamicToast` (`z-[100]`,
`DynamicToast.tsx:41`) is `pointer-events-none`, top-anchored, and must use an
opacity+small-translate entrance — it informs without seizing the stage, so it
does **not** trigger the full background-pause that a modal does. It is the only
L7 element exempt from forcing L1 quiet (it doesn't move spatially enough to
compete).

---

### 3.9 The master contract — Background Primacy Rule

> **When any layer in L3–L7 moves spatially, L1 and L2 go quiet — and they stay
> quiet until the move completes.**

This is the single rule that guarantees the fixed background never competes. It
is enforced through three document-level flags that already exist in the
codebase. The rest of the system must *only* gate motion through these flags —
never invent a parallel mechanism.

#### 3.9.1 The three quiet-flags (the global motion bus)

| Flag (on `<html>`) | Set by | Read by (pauses) | Meaning |
|--------------------|--------|------------------|---------|
| `data-transitioning="1"` | `TransitionEngine._setTransitioning` (`TransitionEngine.ts:242-249`) + gesture-back (`:438`, `:462`) | **everything** via `html[data-transitioning="1"] * { animation-play-state: paused }` (`root-fixes.css:115-119`); `LiveBackground3D` skips its `tick` (`LiveBackground3D.tsx:341`); blur drops on `data-skip-blur-on-transition` | A route/modal transition is in flight |
| `data-tab-transitioning` | tab-switch path | `AmbientVisuals` pause-set (`AmbientVisuals.tsx:24,34`) | A keep-alive tab flip is in flight |
| `data-ambient-motion-paused` | `Layout` per-view (`Layout.tsx:47-58`, list in `utils/ambientMotion.ts`) | `AmbientVisuals` + the CSS wash/sheen (`AmbientVisuals.tsx:106-110`) | The current *screen* wants a calm background (e.g. `aura-signal`, `our-room`, `private-space`, `canvas`, `daily-video`, `storage-console`) |

`AmbientVisuals` collapses all of these (plus `visibilityState:hidden`) into one
derived boolean, `effectivePaused`, recomputed only when a relevant attribute
actually changes (`AmbientVisuals.tsx:27-61`) — so the background pause is
*free* (no React churn on unrelated style mutations).

#### 3.9.2 The lifecycle of a single navigation (frame-accurate)

1. **t = 0 ms** — user taps a tile. L4 fires the lift (`tile-open-lifting`),
   `useTileOpen` writes `--lior-open-x/y` and flags `liorOpenExpand`.
2. **t ≈ 0 ms** — `TransitionEngine.navigate('push',…)` sets
   `data-transitioning="1"`. **Instantly L1 (3D field, wash, sheen) and L2 (idle
   loops) freeze.** GPU/CPU budget is now reserved for the page.
3. **t = 0…360 ms** — L3 runs the push/expand (View Transitions snapshot,
   compositor-only). L2's **veil** runs its one-shot sheen *with* the push
   (`root-fixes.css:137-141`). L4 feedback is suspended. L5 nav holds. L1
   silent.
4. **t = 360 ms (+ ≤ 400 ms watchdog, `TransitionEngine.ts:218-223`)** —
   `finished` (or watchdog) clears `data-transitioning`. L1 resumes its slow
   breath; L2 loops resume; L4 feedback re-enabled.

The net effect: **the background only ever moves while the foreground is
still, and the foreground only ever moves while the background is still.** They
trade the stage; they never share it.

#### 3.9.3 Motion-density budget (per screen, at rest and in motion)

- **At rest (no gesture):** L1 = 1 ambient unit (always). L2 ≤ 2 idle loops.
  L3–L7 = 0. **Total visible motion at rest = the background + at most two
  whisper-quiet loops.** Nothing else may idle-animate.
- **During a gesture:** exactly **one** primary mover (the L3 route, OR an L4
  press, OR an L5 pill, OR an L6 burst, OR an L7 sheet). L1+L2 are quiet
  (background) except the transition-scoped veil. The *coordinated* exceptions —
  pill+icon (L5) landing together, lift+bloom (L4→L3) — count as **one** mover
  because they are choreographed to a single curve and duration.
- **Celebrations (L6)** are a deliberate, bounded crescendo and are the only
  sanctioned multi-particle burst; capped at one at a time, ≤ 1.5 s, auto-clean.

#### 3.9.4 Focus management

At any instant exactly **one layer owns the eye**:

- Scrolling/idle → **L3** (content) owns focus; L1 is ambient wallpaper.
- A press/toggle → **L4** owns focus for its 90–200 ms; everything else holds.
- A route change → **L3** owns focus; L1/L2 mute, L5 stays put.
- A modal → **L7** owns focus; L1–L5 mute/dim/freeze beneath the scrim.
- A celebration → **L6** owns focus briefly, then yields back to L3.

There is never a moment where two layers are *competing* for the eye — the flags
in §3.9.1 enforce the handoff.

---

### 3.10 Normative z-index ladder

The current tree has organically-grown z-values (§3.1). This is the single
ladder all *new* work must target; existing values are mapped onto it. Keep
gaps so future insertions don't force a renumber.

| Band | z-index | Layer | Occupants (current) |
|------|---------|-------|---------------------|
| Background | `0` | L1 | `LiveBackground`, `LiveBackground3D`, `FloatingHeartsScene`, ambient wash/sheen |
| Background accent | `2` | L1 | Layout vignette (`Layout.tsx:126`) |
| In-content ambient | `1`–`5` | L2 | card shimmers, in-content decorative loops |
| Content | `10` | L3 | `.lenis-wrapper`, keep-alive shells, all `views/*` |
| Raised content / controls | `10`–`20` | L4 | raised cards, badges, in-page interactive chrome |
| Transition veil | `45` | L2 | `data-lior-motion-veil` (`Layout.tsx:194`) |
| Navigation | `60` | L5 | `BottomNav` (`BottomNav.tsx:160`) |
| Celebrations | `60` | L6 | `PhysicsConfetti`, `TouchTrailCanvas`, `CrystalHeart`, `TapRipple` |
| Toasts | `100` | L7 | `DynamicToast`, `GestureModal` |
| Immersive views | `190` | L7 | `Depths` and full-screen experiences |
| Modals / sheets | `200` | L7 | `PremiumModal`, `ConfirmModal`, `VoiceNotes` stage |
| Fatal overlay | `9999` | L7 | crash/error screen (`App.tsx:1167`) — reserved, never a product surface |

> **Cleanup note (out of scope here):** L5 (`BottomNav`) and L6 (confetti/trail)
> currently *share* `z-[60]`. They never animate at the same instant (a
> celebration fires after navigation settles, and confetti is
> `pointer-events-none`), so it isn't a live bug — but a future pass should lift
> celebrations to `z-[70]` so the layer ladder is unambiguous. Flagged, not
> fixed.

---

### 3.11 The co-movement matrix (which layers may move together)

Rows = the layer initiating motion. ✅ = may animate **simultaneously**; ⛔ =
must hold still / be quieted; ➖ = not applicable.

| While THIS moves → | L1 bg | L2 ambient | L3 content | L4 controls | L5 nav | L6 celebr. | L7 sheet |
|--------------------|:-----:|:----------:|:----------:|:-----------:|:------:|:----------:|:--------:|
| **L1 background (idle)** | ➖ | ✅ (loops) | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| **L2 ambient (idle loop)** | ✅ | ➖ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| **L3 route transition** | ⛔ | ⛔* | ➖ | ⛔ | ⛔† | ⛔ | ➖ |
| **L4 press / feedback** | ✅ | ✅ | ⛔‡ | ➖ | ✅ | ⛔ | ✅ |
| **L5 tab pill glide** | ⛔ | ⛔* | ✅§ | ⛔ | ➖ | ⛔ | ⛔ |
| **L6 celebration** | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ➖ | ⛔ |
| **L7 modal open/close** | ⛔ | ⛔* | ⛔(dims) | ⛔ | ⛔ | ⛔ | ➖ |

Footnotes:

- **\*** L2's idle loops pause, **but** the transition-scoped **veil** is allowed
  (it is *caused by* the move and dies with it).
- **†** During a **push/pop** the nav bar stays anchored (it does not slide with
  the page).
- **‡** During a route transition `html[data-transitioning] *` pauses all
  animation, so an L4 press in-flight is frozen, not running concurrently.
- **§** L3+L5 is the **one sanctioned simultaneous pair**: on a **tab** switch
  the content fade (240 ms) and the WAAPI pill glide (240 ms) run together,
  choreographed to the identical `--lior-ease-silk` curve so they read as a
  single coordinated motion, not two competing ones.

**Reading the matrix in one sentence:** *the background and ambient layers may
only co-move with each other and with calm content/controls/nav at rest; the
instant a real navigation, celebration, or sheet fires, everything below it goes
quiet, and the only legal "two things at once" is the tab content + tab pill
moving in lockstep.*

---

### 3.12 Implementation checklist for layers 2–7 (the contract, distilled)

A senior engineer building any new animated surface must answer:

1. **Which layer is this?** (Pick exactly one L2–L7.) Its z-index comes from
   §3.10's ladder.
2. **Does it idle-animate?** If yes → it's L2, loop ≥ 2000 ms, transform+opacity
   only, and it MUST pause on the three quiet-flags (§3.9.1). If no → it's
   feedback (L4), chrome (L5), celebration (L6), or overlay (L7).
3. **Does it move during a route change?** Almost always **no** — only the L3
   route, the L2 veil, and the choreographed L5 pill are allowed. Everything
   else is paused by `html[data-transitioning="1"] *`.
4. **Does it blur?** Default no. If a glass surface must, add
   `data-skip-blur-on-transition` so blur drops during transitions
   (`root-fixes.css:123-127`).
5. **What's the curve/duration?** Pull from the canonical ladder only
   (`--lior-ease-*`, `--lior-motion-*`, `springSmooth/Snappy/Gentle`). No
   bounce/elastic (banned by `motionExperience.assert.mjs:66-70`).
6. **Animatable props?** transform + opacity (+ `color` micro only). Any `lior-*`
   keyframe touching width/height/top/left/margin/padding/filter/backdrop-filter
   fails the assert guard (`motionExperience.assert.mjs:81-87`) — and, more
   importantly, breaks the compositor-only promise that lets this whole stack
   hold 90+ fps on mid-range Android.
7. **Does it respect the background?** If your surface makes L1 fight for
   attention, you've built it wrong: gate it through the flags, cap its density
   per §3.9.3, and let the stage breathe.
## 4. Tab Bar, Navigation & Shared-Element Transitions

> Phases 5 + 6 + 7 of the Lior Motion Operating System. This is the connective tissue of the
> whole app: the tab bar is the one chrome element on screen at all times, and navigation is the
> verb that moves you through the world. Everything here harmonizes with the **fixed Home
> background** (`components/AmbientVisuals.tsx`) — the stage never moves; only the performers do.
> All timings, easings, and springs are the canonical tokens already shipped in
> `styles/root-fixes.css :root`, `utils/motion.ts`, and `utils/TransitionEngine.ts`. Where I
> introduce anything new it is flagged explicitly at the end.

---

### 4.0 The governing principle — one connected world, one stage

Lior already made the single most important architectural decision correctly: **the ambient
background is a persistent stage that never remounts** (`AmbientVisuals` is memo'd and lives
above the routed view tree), and **transitions pause that stage** by setting
`document.documentElement.dataset.transitioning='1'` (`TransitionEngine._setTransitioning`,
`utils/TransitionEngine.ts:242`), which the CSS in `styles/root-fixes.css:115-119` turns into
`animation-play-state: paused` on every descendant. This is the secret that lets the foreground
move fast and rich without the background ever competing.

So the mental model for this entire section is:

- **The stage (ambient gradient + hearts + sheen) is fixed.** It holds still — and during a
  transition it goes *completely still* (paused) so 100% of the GPU budget goes to the moving
  surface.
- **The surfaces (routed views) are sheets of warm paper** that slide, push, bloom, and settle
  over that stage. They are opaque enough to carry their own content but the stage shows through
  the edges and the safe-area, which is what makes Lior feel like one continuous space rather than
  a stack of disconnected screens.
- **The tab bar is a floating glass object that lives in front of everything** (`z-[60]`,
  `components/BottomNav.tsx:160`) and is the only chrome that survives every transition. It is the
  user's anchor. Its motion must therefore be the *calmest, most reliable* motion in the app — a
  lighthouse, not a firework.

Three motion families, three jobs:

| Family | Job | Engine | Token |
|---|---|---|---|
| **Tab switch** (lateral, peer-to-peer) | "Glance sideways" | keep-alive CSS opacity fade (`App.tsx:runTabTransition`) + WAAPI pill glide | `--lior-motion-tab` 240ms / `--lior-ease-silk` |
| **Push / Expand** (deeper, into detail) | "Open / dive in" | View Transitions API (`_runNativeVT`) | `--lior-motion-push` 360ms / `--lior-motion-morph` 400ms |
| **Pop / Modal-close** (back, out) | "Step back / put it down" | View Transitions API, old-on-top reveal | `--lior-motion-pop` 260ms / `--lior-motion-modal` 380ms |

---

## (a) THE TAB BAR — Dynamic-Island / Liquid-Glass-grade motion

### 4.1 Audit of the shipped `BottomNav.tsx`

I read `components/BottomNav.tsx` line by line. It is already very good — this is not a rewrite,
it is a polish pass. What is shipped:

**Structure.** A fixed, centered, pill-shaped bar (`width: min(calc(100vw - 36px), 372px)`,
`borderRadius: 32`, height `76`) with five slots: Home, Us, **center FAB (Add)**, Moments,
Memories (`BottomNav.tsx:40-46`). A single `IND = 56`px **neumorphic pill** (`pillRef`) glides
behind the active icon. The center Add slot has its own always-visible squircle and the pill
*hides* (`opacity:0`) when Add is active (`BottomNav.tsx:65-68`).

**The pill glide — already excellent (`movePill`, `BottomNav.tsx:60-123`).** This is the crown
jewel and the brief explicitly says to honour it:
- Runs on **WAAPI** (`pill.animate(...)`) so it lives on the **compositor thread** and survives a
  fully blocked main thread while React reconciles the destination view (`BottomNav.tsx:98-112`).
- 240ms / `cubic-bezier(0.16,1,0.3,1)` = exactly `--lior-motion-tab` / `--lior-ease-silk`
  (`BottomNav.tsx:26-27`). No overshoot, by deliberate design (comment at `:22-25`).
- **Interruption-correct:** on a new tap mid-flight it reads the *live* matrix position off the
  compositor (`new DOMMatrix(getComputedStyle(pill).transform).m41`, `:86-91`), commits it inline,
  cancels, and re-animates from there. This is the single hardest thing to get right in a pill
  indicator and it is done properly.
- Position is measured via `getBoundingClientRect` deferred behind a `requestAnimationFrame`
  (`:139-142`) so the read never forces synchronous layout inside the tap's render task.

**The icons — pure CSS spring (`.bn-icon`, `root-fixes.css:285-296`).** `scale(0.84)` →
`scale(1)` + `translateY(-1px)` on `.is-active`, transitioned over `--lior-motion-tab` /
`--lior-ease-silk`. Five framer-motion spring instances were deliberately replaced with one
compositor transition each (comment `:280-284`). Color cross-fades in `0.06s linear`
(`BottomNav.tsx:302-305`) — almost instant, intentionally.

**The FAB — `.bn-fab` (`root-fixes.css:297-305`).** `:active` → `scale(0.92) translateY(1px)`
over 170ms `--lior-ease-soft`. A clean press-in.

**Haptics + audio (`handleNavTap`, `BottomNav.tsx:144-152`).** Add fires `Haptics.press()` (Medium)
+ `Audio.play('press')`; every other tab fires `Haptics.softTap()` + `Audio.play('navSwitch')`.
This already follows the house rule (haptics on explicit product actions, `BottomNav.tsx:245-250`
fires only a *prefetch event* on `pointerDown`, never a haptic).

**Prefetch (`onPointerDown`, `:245-250`).** Dispatches `te:prefetch` before the finger lifts so
`App.tsx:293-304` can parse the destination's lazy chunk in the gap.

**Keyboard avoidance (`:164-166`).** Slides the whole bar down `calc(100% + 24px)` + fades over
220ms `--lior-ease-soft` when the IME opens.

#### Audit verdict — the four gaps to a Dynamic-Island grade feel

The bar is **mechanically flawless** but **expressively flat**. Against the Dynamic Island /
Liquid Glass bar, four things are missing — none require touching the brand look, only the motion:

1. **No press-down on the icon you tap.** The pill and the destination icon animate, but the
   *finger's own target* gives zero tactile compression at the moment of contact. The Island always
   acknowledges the touch point first, before anything else moves.
2. **The pill teleports its *shape*, only translating.** A true liquid-glass indicator **stretches
   toward** its destination (leading edge departs first, trailing edge catches up — a momentary
   capsule) and **settles** back to a circle. Right now it is a rigid 56px circle sliding on rails.
3. **No "arrival bloom" on the destination icon.** The icon scales `0.84→1` but there's no
   acknowledgement *pop* when the pill actually lands under it — the two events are independent.
4. **The center FAB is inert until pressed.** On the Island the persistent element is alive — a
   slow idle breath. The Add orb sits dead-still, which on a relationship app is a missed warmth
   cue.

The redesign below fixes all four **without** adding a single millisecond of idle main-thread work
and **without** a live `backdrop-filter` (the baked-glass decision at `BottomNav.tsx:193-204` is
correct and must be preserved — a live blur on a fixed bar re-rasterizes every scroll frame).

---

### 4.2 The Liquid-Glass tab tap — frame-by-frame

Scenario: user is on **Home**, taps **Memories** (rightmost). Total elapsed = 240ms, locked to
`--lior-motion-tab` so the pill, the icon scale, and the keep-alive view fade all land on the same
frame. Times are from `pointerdown`.

```
t = 0ms      pointerdown on Memories button
             ├─ FIRE: te:prefetch{view:'timeline'}  (existing, BottomNav.tsx:248)
             └─ NEW  ▸ tapped button gets .bn-pressing → icon wrapper scale 1→0.88
                       over --lior-motion-press (90ms) / --lior-ease-press.
                       NO haptic yet (press-in is visual only; matches index.tsx rule).

t = 0–90ms   PRESS-IN. Only the touched icon compresses. The pill has NOT moved.
             This is the Island's "I felt you" beat. If the finger lifts here it's a
             committed tap; if it slides off and cancels, scroll cancellation in
             index.tsx clears data-pressing and the icon springs back (no nav).

t = ~90ms    pointerup → handleNavTap('timeline')  (BottomNav.tsx:144)
             ├─ HAPTIC: Haptics.softTap()  (Light) — fires HERE, on the confirmed action
             ├─ AUDIO:  Audio.play('navSwitch')
             ├─ .bn-pressing removed → tapped icon releases 0.88→ (its active scale)
             └─ setView('timeline') → App.tsx:runTabTransition (the lock-free fast path)

t = 90ms     PILL DEPARTS — the liquid stretch (the headline change).
  ↓          The WAAPI glide already exists (movePill). We upgrade its single
             translateX keyframe into a 3-keyframe stretch-and-settle on a
             scaleX/translateX pair, still pure compositor, still 240ms silk:

               from  : translateX(fromX)  scaleX(1)
               40%   : translateX(midX)   scaleX(1.28)   ← capsule: stretched toward target
               to    : translateX(toX)    scaleX(1)      ← re-rounds to a circle on arrival

             The leading edge reaches ahead while the body catches up — the glass
             "flows" rather than "rides". scaleX only (height constant) keeps it a
             pill, never an egg. transform-origin stays center so both edges share
             the stretch. This reads as liquid because the silk curve front-loads
             the velocity: by 40% the pill is already 78% of the way AND maximally
             stretched, then it decelerates and un-stretches in lockstep.

t = 90–330ms VIEW CROSSFADE (concurrent, the keep-alive path).
             Home shell → .is-cached (opacity:0, visibility:hidden, OFF-flow but
             still mounted — root-fixes.css:176-184). Memories shell → .is-active
             runs @keyframes keep-alive-tab-enter (opacity 0→1) over --lior-motion-tab
             / --lior-ease-silk (root-fixes.css:186-200). No remount, no layout — the
             cheapest possible swap on a heavy tab. NOTE: the keep-alive path runs at
             the SAME 240ms as the pill, but starts ~90ms later (after the press), so
             the content settles a beat after the pill — correct: the indicator leads,
             the content follows.

t = ~150ms   PILL ARRIVAL BLOOM (NEW). When the WAAPI glide passes 70% (≈t+168ms),
  ↓          add .bn-arrived to the destination icon for one cycle:
               @keyframes bn-icon-arrive: 0%→ scale(1)  ·  55%→ scale(1.14)  ·  100%→ scale(1)
             over --lior-motion-feedback (140ms) / --lior-ease-silk. The destination
             icon gives one soft swell exactly as the pill slides under it — the pill
             and icon "kiss". This is the missing acknowledgement. Color has already
             flipped (0.06s linear, BottomNav.tsx:304) so the bloom lands on the
             already-active purple icon.

t = 330ms    SETTLE. Pill is a circle under Memories. Icon at active scale. View at
             opacity 1. WAAPI onfinish commits committedX (BottomNav.tsx:115-120).
             Everything is still. The bar exhales.
```

**Why this is Liquid-Glass and not a gimmick:** the only *new* moving property is the pill's
`scaleX` (one extra compositor transform channel) and two short icon scale pops. Zero new layout,
zero new paint, zero blur. The stretch communicates *direction and intent* (the glass leans toward
where you're going); the bloom communicates *arrival*; the press communicates *contact*. Three
honest signals, each ≤140ms, all silk, no overshoot — fully consistent with the canonical "no
bounce" rule that `tests/motionExperience.assert.mjs:66-70` enforces.

#### 4.2.1 The pill-stretch implementation (upgrade `movePill`)

`movePill` currently animates a single `translateX` keyframe pair (`BottomNav.tsx:101-112`).
Replace the keyframe array with the stretch-and-settle, computing `midX` as the geometric midpoint
biased toward travel direction. The interruption logic (live matrix read, commit-before-cancel) is
untouched — `m41` still reads X correctly because `scaleX` does not affect the translate component
of the matrix when origin is center *only if we keep scale out of the committed inline transform*.
Practically: on interruption, commit `translateX(fromX) scaleX(1)` (drop the stretch), then
re-animate. The stretch is purely cosmetic mid-flight and always resolves to `scaleX(1)`.

```
const dir = Math.sign(tx - fromX) || 1;
const midX = fromX + (tx - fromX) * 0.62;          // past the geometric midpoint
const stretch = Math.min(1.3, 1 + Math.abs(tx - fromX) / 520); // longer travel → more stretch, capped
waapiAnim.current = pill.animate([
  { transform: `translateX(${fromX}px) scaleX(1)` },
  { transform: `translateX(${midX}px) scaleX(${stretch})`, offset: 0.4 },
  { transform: `translateX(${tx}px) scaleX(1)` },
], { duration: SPRING_MS, easing: SPRING_EASE, fill: 'forwards', composite: 'replace' });
```

Key detail: **stretch scales with travel distance** (Home→Memories stretches more than
Home→Us) and is **capped at 1.3** so adjacent hops feel taut and long hops feel liquid — never
rubbery. `onfinish` commits `translateX(${tx}px) scaleX(1)` (`BottomNav.tsx:116`), guaranteeing the
resting state is always a clean circle.

#### 4.2.2 Press-in primitive (new `.bn-pressing`)

The bar should use the **same press language as the rest of the app** (`.spring-press` from
`index.tsx`) but scoped tighter so only the icon glyph compresses, not the whole 60px slot (a
full-slot press on a 5-up bar looks like a stomp). Add to `root-fixes.css` near `.bn-icon`:

```
.bn-icon.bn-pressing { transform: scale(0.88) translateZ(0); transition: transform var(--lior-motion-press) var(--lior-ease-press); }
```

Wire it in `BottomNav.tsx` `onPointerDown` (set a `data-pressing` on the icon wrapper) and clear it
in `onPointerUp`/`onPointerCancel`. This must respect the **global scroll cancellation** already in
`index.tsx` — if the pointer is part of a scroll, the press never commits. (Do **not** add a
separate scroll detector; reuse the global `data-pressing` mechanism so behavior is identical
everywhere.)

#### 4.2.3 Arrival bloom (new `.bn-arrived` / `@keyframes bn-icon-arrive`)

```
@keyframes bn-icon-arrive { 0% { transform: translate3d(0,-1px,0) scale(1); } 55% { transform: translate3d(0,-1px,0) scale(1.14); } 100% { transform: translate3d(0,-1px,0) scale(1); } }
.bn-icon.is-active.bn-arrived { animation: bn-icon-arrive var(--lior-motion-feedback) var(--lior-ease-silk); }
```

Trigger from `movePill`: when the WAAPI animation crosses 70% progress, `requestAnimationFrame`-add
`.bn-arrived` to the destination icon and remove it on `animationend`. (The `translate3d(0,-1px,0)`
preserves the active icon's -1px lift from `.bn-icon.is-active` so the bloom doesn't drop it.)

#### 4.2.4 Center FAB — the living anchor (new idle breath)

The Add orb is the persistent heart of the bar. Give it the app's `heartbeat`/`breathe` cadence so
it is *alive but never distracting* — strictly an ambient loop ≥2000ms per the canonical rule that
ambient loops must not compete with gesture feedback:

```
@keyframes bn-fab-breathe { 0%,100% { transform: translateZ(0) scale(1); } 50% { transform: translateZ(0) scale(1.025); } }
.bn-fab { animation: bn-fab-breathe 4200ms var(--lior-ease-soft) infinite; }
```

4.2s, ±2.5% scale — below the threshold of conscious notice, felt more than seen, matching the
`animate-breathe` heart on the notification dot (`BottomNav.tsx:309`). Critically, this animation is
**auto-paused during every transition** by the existing `html[data-transitioning="1"] *` rule
(`root-fixes.css:115-119`) and is `transform`-only, so it costs nothing and never fights a route
push. On `:active` the press (`.bn-fab:active`, `root-fixes.css:303-305`) overrides the breath —
exactly right. Under reduced motion, gate it off (add `.bn-fab` to the `@media
(prefers-reduced-motion: reduce)` block).

> **Reduced-motion for the whole bar:** the pill stretch must collapse to a plain translate (no
> scaleX), the arrival bloom must not run, and the FAB breath must stop. Add the three new classes
> to the existing reduced-motion guards. The WAAPI pill glide already has no reduced-motion path in
> `movePill` — gate it: if `prefersReducedMotion()` (`utils/motion.ts:61`), call `movePill(id, true)`
> (the existing instant snap at `BottomNav.tsx:75-81`) instead of animating.

---

## (b) NAVIGATION — one coherent, connected world

`App.tsx:navigateTo` (`:429-518`) already resolves direction correctly. Here is the **full map**,
each route mapped onto an existing `EngineDirection`, with the exact motion and the rationale for
why it makes the app feel like *one space*.

### 4.3 Direction resolution table (as shipped, with the feel each must deliver)

| From → To | Direction (`App.tsx`) | Engine path | Token | The feeling |
|---|---|---|---|---|
| Home ↔ Us / Moments / Memories | `tab` (`:449`) | keep-alive fade + pill glide | 240ms silk | Peer glance — you turned your head, the room didn't change |
| Home → any detail (Timeline item, Pet, Question, Milestone) | `push` (`:450`) | View Transitions push | 360ms silk | Walking deeper into the same room |
| Home tile → detail (flagged tiles) | `expand` (upgraded from push, `TransitionEngine.ts:150`) | VT bloom from tile origin | 400ms `--lior-motion-morph` | The card *became* the page |
| detail → back (button or edge-swipe) | `pop` (`goBack`, `:533`) / gesture-back | VT old-on-top reveal | 260ms silk | The page slides off, revealing where you were |
| any → Add | `modal` (`:445`) | VT sheet-up | 380ms silk | A sheet of paper rises from the bottom |
| Add → anywhere (dismiss) | `modal-close` (`:448, :533`) | VT sheet-down, old-on-top | 260ms silk | You set the sheet back down |
| Profile → Milestone detail | `push` (non-tab → `:450`) | VT push | 360ms silk | Deeper into your story |
| Settings ↔ anything | `push` in / `pop` out | VT push/pop | 360 / 260ms | Settings is a *place you go*, not a layer that flips |

The elegance of the shipped design is that **all six directions share two easings**
(`--lior-ease-silk` for incoming, `--lior-ease-soft` for outgoing, `root-fixes.css:399-432`) and a
**single spatial grammar**: forward = new arrives at full opacity travelling its full distance
(`lior-vt-push-in` goes `translate3d(100%)` → `0`, `root-fixes.css:337-340`), old recedes + dims
(`push-out` → `translate3d(-25%) scale(0.96) opacity 0.7`, `:333-336`); back = the *old* paints on
top (`z-index:2`, `:451-452`) and slides off to reveal the genuine previous screen underneath
coming *forward* from depth (`pop-in` from `-25% scale(0.96)` → `0`, `:348-351`). That old-on-top
reveal is what makes "back" feel like *uncovering* rather than *replacing* — the iOS hallmark.

### 4.4 Home ↔ peer tabs — the lateral glance (the most-traveled path)

This must be the **fastest, calmest** transition because it's used hundreds of times a session.
The shipped keep-alive crossfade (`App.tsx:351-383`, `runTabTransition`) is correct and must not be
upgraded to a spatial slide — a sideways slide between peer tabs would imply hierarchy that doesn't
exist and would fight the fixed background. Keep it as the **opacity-only silk fade** the assert
guard requires (`motionExperience.assert.mjs:24-28`).

**The one refinement:** the keep-alive enter is opacity-only (`keep-alive-tab-enter`,
`root-fixes.css:197-200`), but the brief's canonical CSS already ships a richer per-section reveal
(`.home-reveal` / `home-reveal-item` staggered children, `root-fixes.css:202-266`). On a tab
*return* to a heavy tab those section reveals should **not** re-run (the content was already there,
re-staggering it would feel like a cold load). Confirm the `.home-reveal` animations are gated to
*first mount only* (they should be, since the shell stays mounted and the keyframe is `both` fill —
it won't replay without a remount). The lateral fade carries the whole tab; individual sections
stay put. This is correct as-is; the spec is to **not break it** by accidentally remounting.

The pill is the star of this transition (§4.2). The view fade is deliberately understated so the
**pill glide is the thing the eye follows** — exactly the Dynamic Island relationship where the
pill is the protagonist and the content is the set.

### 4.5 Home → detail — push vs. expand (the dive)

Two flavors, chosen by whether the source is a **tile with an origin**:

- **Plain push** (`lior-vt-push-in/out`, 360ms): used when there is no meaningful spatial origin —
  e.g. a toolbar button, a list-row "see all", a deep link. New screen enters from
  `translate3d(100%)` at full opacity; Home recedes to `-25% scale(0.96)` and dims to `0.7`. The
  **transition sheen** (`[data-lior-motion-veil]`, `root-fixes.css:129-147`, `lior-motion-veil`
  keyframe) sweeps left-to-right across the seam for the push duration — a single diagonal glint of
  light tracking the new surface as it slides in. This is the "big navigation moment" the
  `Layout.tsx` sheen layer exists for (`motionExperience.assert.mjs:48-58`).

- **Expand / tile-bloom** (`lior-vt-expand-in`, 400ms `--lior-motion-morph`): used when the user
  taps a **bento tile / card** on Home. `useTileOpen` (`hooks/useTileOpen.ts:49-84`) writes the
  tapped tile's center into `--lior-open-x/y`, sets `data-lior-open-expand='1'`, and adds
  `.tile-open-lifting` (the card lifts `scale(1.035)` + shadow grows, `index.css:1738-1747`). Then
  `TransitionEngine.navigate` **upgrades the push to expand** (`TransitionEngine.ts:147-151`) and
  the new page blooms from that exact origin (`transform-origin: var(--lior-open-x/y)`,
  `root-fixes.css:437-444`). Frame-by-frame in §4.7 — this is the system's signature move.

**The handoff that makes it magical** is already wired: the card *lifts* (`tile-lift`, 300ms) while
the route *blooms from the card's center* (400ms) — concurrently (`useTileOpen.ts:79-84` fires
`navigate()` in parallel with the lift). So for the first 300ms the user sees the card pick itself
up *and* the destination growing out of it — they read as the same gesture. The 300ms lift held
inside the 400ms bloom (`useTileOpen.ts:21-23`) means the card is still lifted as the page reaches
~75% scale, so there's never a frame where the card has dropped but the page hasn't arrived.

### 4.6 Back, modal, and the connected-world guarantees

**Back (`pop`).** Three triggers, one feel: the in-screen back button (`goBack`, `App.tsx:524`), the
Android hardware back (funneled through `onHardwareBack`, per the codebase's back-button
architecture), and the **left-edge gesture** (`TransitionEngine._pd/_pm/_pu`, `:348-482`). The
gesture is **1:1 finger-tracked** — the current screen follows the finger pixel-for-pixel
(`c.style.transform = translate3d(${dx}px,0,0)`, `:405`) with no animation while dragging, then
either commits (velocity > 0.35px/ms OR past 38% width, `:431`) by flying off to `+W` over a
velocity-derived duration (`:434-436`), or snaps back over `T_POP` (`:471-473`). On commit it fires
`te:gesture-back` and `App.tsx:273-287` pops the history stack. **This is the connected-world
proof:** the screen you're dragging is a real object you can grab and throw, and the thing revealed
underneath is the genuine previous screen (kept in the history stack, scroll position restored via
`pendingScrollRestore`, `App.tsx:264-269`). It is never a fake regenerated page.

> One small coherence fix: the gesture-back exit uses `E_STANDARD` (`--lior-ease-soft`,
> `TransitionEngine.ts:440`) for the throw, while the *button*-driven pop uses the VT `pop` keyframes
> (silk in / soft out). These already match the soft-out language, so the felt result is consistent.
> No change needed — flagged only so a future editor doesn't "fix" one and desync them.

**Modal (Add composer).** `any → add-memory` = `modal` (sheet rises from `translate3d(0,100%)` →
`0`, `lior-vt-modal-in`, `root-fixes.css:358-361`), 380ms silk; the screen behind recedes to
`-1.5% scale(0.965)` + dims (`modal-out`, `:354-357`). Dismissal = `modal-close` (`App.tsx:448,533`):
the sheet slides *back down* on top (`z-index:2`, `:452`) over 260ms while the screen beneath
settles forward (`modal-close-in` from `-1.5% scale(0.965)` → `0`, `:368-372`). The asymmetry —
**rise slow (380ms), dismiss quick (260ms)** — is correct: presenting is an arrival you savor,
dismissing is a release you want instant.

**Settings / Profile / Premium.** These are non-tab views, so they resolve to `push` in / `pop`
out (`App.tsx:449-450`). That is the right call: Settings is *a place you walk to and back from*,
not a flippy overlay. Keep it. Profile → Milestone is push-on-push (deeper into the same story),
and the back gesture works at every depth because `historyStack` (`App.tsx:457-459`) records each
push.

**The connected-world guarantee, stated precisely:** because (1) the ambient stage never remounts
across any of these, (2) every forward motion travels the full screen distance at full opacity (no
crossfade-in-place that would read as "different app"), and (3) every back motion reveals the
*real* preserved previous screen with its scroll restored — the entire app behaves as one
continuous physical space the couple moves through together, not a deck of cards being swapped.

---

## (c) SHARED-ELEMENT TRANSITIONS — the morph catalog

**Current state:** I grepped the whole repo — there is **zero** use of `view-transition-name` today
(no matches anywhere). The `expand` direction already morphs the *whole page* from a tile's
*centroid* (`--lior-open-x/y`), which is a coarse shared-element effect. The opportunity is to add
**named shared elements** so a specific sub-element (the photo, the cover, the pet) is the thing
that physically grows into its detail counterpart — true continuity, the Apple Photos "tap a
thumbnail, it expands into the full photo *in place*" feel.

### 4.8 The mechanism — building on `expand` + `view-transition-name`

The View Transitions API path (`_runNativeVT`, `TransitionEngine.ts:189-234`) snapshots
`::view-transition-old/new(root)` today. To get **per-element** morphs, tag the morphing element on
*both* the source and destination with the **same** `view-transition-name`. The browser then
captures *that element* as its own transition group and tweens its position/size/opacity from
source rect → destination rect automatically — no manual FLIP math.

The discipline required (and the rules a senior engineer must follow):

1. **Names must be unique per transition.** Two elements with the same name on screen = the API
   throws and `_runNativeVT` falls back to the JS clone (`TransitionEngine.ts:228-233`). So tag with
   a stable id: `view-transition-name: lior-memory-${id}`.
2. **Apply the name only during the transition, then remove it.** A persistent
   `view-transition-name` makes the element a perpetual transition group (perf cost + breaks the
   *next* transition). Set it in the `useTileOpen` callback (or a sibling hook), read the
   destination element's name on mount, and clear both on `vt.finished` (extend the `settle()`
   cleanup, `TransitionEngine.ts:198-203`).
3. **The element must exist in both DOM states.** Source card's `<img>` and detail page's hero
   `<img>` both carry `view-transition-name: lior-memory-photo-${id}`. The browser morphs old→new.
4. **Fall back gracefully.** Where VT is unsupported, the existing `expand` whole-page bloom
   (`TransitionEngine.ts:77-83` legacy clone blooms from center) is the floor — still good, just not
   per-element. Reduced motion → instant (already handled, `root-fixes.css:457-461`).
5. **Honour the assert guard.** Any new `@keyframes` for these must stay **transform + opacity
   only** — `motionExperience.assert.mjs:81-87` will fail the build on `width/height/top/left/filter`.
   The per-element morph itself is browser-driven (no keyframe needed); only custom *easing* is set
   via `::view-transition-group(NAME) { animation-timing-function: var(--lior-ease-silk); }`.

I introduce one **new naming convention token family** (flagged at the end): the `lior-shared-*`
`view-transition-name` namespace. No new *motion* tokens — every morph reuses `--lior-motion-morph`
(400ms) and `--lior-ease-silk`.

### 4.9 The catalog — every morph opportunity, with a spec each

For each: the **source element**, the **destination element**, the **shared name**, the
**direction it rides on**, and the **frame-by-frame**. All ride the `expand` origin mechanism
(tile lift + page bloom) with a *named sub-element* layered on top.

#### M1 — Memory card → Memory detail (the canonical case)

- **Source:** a card in `views/MemoryTimeline.tsx` (the `.bento-card`/`.aurora-card` that
  `useTileOpen` already lifts). **Destination:** the detail view's hero region.
- **Shared names:** photo `lior-shared-memory-photo-${id}`; title `lior-shared-memory-title-${id}`.
- **Rides on:** `expand` (tile origin already set by `useTileOpen`).

```
t=0       tap card → useTileOpen: set --lior-open-x/y to card center, add .tile-open-lifting,
          set view-transition-name on the card's <img> AND its title to the shared names.
          The detail view's hero <img>/<h1> declare the same names (read on mount).
t=0–300   card lifts scale(1.035)+shadow (tile-lift). Concurrently the route push→expand begins.
t=0–400   PAGE bloom: ::view-transition-new(root) scales 0.55→1 from the card's centroid
          (lior-vt-expand-in, root-fixes.css:376-380). MEANWHILE the named photo group
          tweens from the card-thumbnail rect → the detail-hero rect (browser-driven,
          silk), so the photo appears to grow OUT of the card into its full size while the
          surrounding page blooms around it. The title slides+scales from card position to
          header position on the same curve.
t=400     names cleared in settle(). Photo at full size, page at scale 1, card gone.
```

This is the Apple Photos moment: the thumbnail you touched *is* the photo you're now looking at.

#### M2 — Photo → fullscreen lightbox

- **Source:** any `<img>` thumbnail (detail page, recap, keepsake). **Destination:** full-bleed
  lightbox overlay. **Shared name:** `lior-shared-photo-${id}`. **Rides on:** `modal` (the lightbox
  is a sheet over the current screen) — but the *photo itself* uses its shared name so it grows from
  thumbnail rect to full-screen rect rather than the whole modal sliding up.

```
t=0     tap thumbnail → set view-transition-name on it; lightbox <img> declares same name.
        Direction = modal (the dimming scrim rises). FIRE Haptics.tap() (Light).
t=0–380 SCRIM: a black/warm-tint backdrop fades in (opacity-only) under the photo. The
        PHOTO group morphs thumbnail-rect → centered full-screen rect on --lior-ease-silk.
        The photo visibly LIFTS off the page and expands to fill — the page behind dims.
t=380   photo full-screen, scrim at target opacity. name cleared.
close   reverse: modal-close, photo morphs back into its exact thumbnail slot (260ms).
```

The photo never crossfades or pops — it is one continuous object that grows and shrinks. This is
the single highest-delight morph in a *memory* app and should be the reference implementation.

#### M3 — CocoPet → Pet profile

- **Source:** the pet sprite on Home / pet tile. **Destination:** the pet on its profile page.
  **Shared name:** `lior-shared-pet`. **Rides on:** `expand`.

```
t=0     tap pet → tile-lift on its card; set view-transition-name:lior-shared-pet on the pet
        canvas/sprite element. Profile page's pet element declares the same name.
t=0–400 the PET stays a continuous object: it morphs from its small Home position to its large
        profile position (translate+scale, silk) while the profile page blooms around it from
        the tile origin. The pet does a single doubleBeat heartbeat (Haptics.doubleBeat) at
        t≈120 — it "greets" you as it arrives. (Heartbeat is the brand's affection cue.)
t=400   pet at profile scale/position. The R3F pet scene takes over its own idle animation
        (which was paused by data-transitioning during the move — root-fixes.css:115).
```

Note the stage discipline: the pet's *own* idle/breathing animation is paused during the
transition (it's inside the `data-transitioning` pause scope), so the *morph* is the only motion —
no double-animation jitter. It resumes on `settle()`.

#### M4 — Daily Question card → Question detail / partner reveal

- **Source:** the `DailyQuestion.tsx` card on Home. **Destination:** the full question + answer
  view (`views/DailyMoments.tsx`). **Shared names:** card surface `lior-shared-question-${id}`;
  the prompt text `lior-shared-question-text-${id}`. **Rides on:** `expand`.
- **Special beat — the partner-response reveal.** When the partner's answer is revealed (the
  app's core ritual), this is NOT a navigation — it's an in-place reveal. Spec: the answer panel
  unfolds with a `springGentle` (`utils/motion.ts:34`, stiffness 170) height-less reveal — clip via
  `transform: scaleY` from a top origin + opacity, **never** animating `height` (assert guard).
  Frame: at t=0 fire `Haptics.heartbeat()`; 0–400ms the answer card scales `scaleY(0.6)→1` from top
  origin + `opacity 0→1` on silk; at t≈200ms a one-shot soft sheen sweeps the revealed text
  (reuse `lior-motion-veil` scoped to the card). The reveal must feel like *unfolding a note your
  partner left*, not a UI panel expanding — hence the gentle spring and the heartbeat.

#### M5 — Achievement / Milestone tile → Achievement page

- **Source:** a milestone tile in `views/Us.tsx` or `views/Profile.tsx`. **Destination:** the
  milestone's full page. **Shared names:** the medallion/badge graphic `lior-shared-badge-${id}`;
  the milestone title `lior-shared-milestone-title-${id}`. **Rides on:** `expand` (Profile→Milestone
  is push, upgraded to expand if launched from a tile via `useTileOpen`).

```
t=0     tap milestone tile → tile-lift; set names on the badge + title.
t=0–400 page blooms from tile origin. The BADGE morphs from its small tile position to the
        large hero position. As it crosses ~60% (t≈240ms), the badge does ONE celebrate
        micro-cue: a single soft scale swell (1→1.08→1 over --lior-motion-feedback) + the
        existing celebrate haptic ladder is TOO MUCH here (5-beat is for actual unlocks);
        use Haptics.success (one warm confirm) instead. Reserve Haptics.celebrate() for the
        moment a milestone is FIRST earned, not for viewing it.
t=400   badge at hero scale. Title settled. names cleared.
```

#### M6 — Weekly Recap cover → Recap story

- **Source:** the recap cover card (`RecapCarousel` cover). **Destination:** the full-screen recap
  story (`WeeklyRecap`). **Shared name:** the cover image `lior-shared-recap-cover-${week}`.
  **Rides on:** `expand` → then the story itself runs as a story sequence (out of scope here).

```
t=0     tap cover → tile-lift; set view-transition-name on the cover image.
t=0–400 the COVER image morphs from card rect → full-screen story-cover rect on silk while
        the story shell blooms from the tile origin. Because the cover image is the SAME
        object, the user feels they "opened the cover" of a little book — the recap.
t=400+  the story's first slide's content fades/staggers IN (revealVariants, motion.ts:41)
        once the cover has landed, NOT during the morph (sequencing: morph first, content
        second, so the two don't collide). Auto-advance is a separate spec (§ story section).
```

#### M7 — Voice note / Aura-Pulse / OpenWhen (the comms surfaces, per brief)

Lior has no messenger — these are the real comms surfaces and each gets a *tailored* morph:

- **VoiceNote bubble → expanded player (`views/VoiceNotes.tsx`).** Shared name on the waveform:
  `lior-shared-voice-wave-${id}`. The waveform is the continuous object — it grows from the
  list-row mini-waveform into the full player's large waveform (silk, 400ms, `expand`). At t=0 fire
  `Haptics.softTap`; the play affordance pulses once on arrival.
- **Aura-Pulse ping (`views/AuraSignal.tsx`).** This is presence, not navigation. Sending a pulse =
  a radial bloom from the send button (a transform-scale ring, `--lior-motion-morph`,
  `Haptics.heartbeat()` at fire) that expands and fades — *not* a route change. Receiving a partner's
  pulse = the same ring blooms *inward* to the avatar + one `Haptics.doubleBeat`. These are
  shared-*moment* motions, not shared-element; specced here because the brief routes "presence" to
  Pulse. They must obey the stage rule: the ring is a foreground overlay, the ambient hearts behind
  it keep floating (the ring is brief, <600ms, and does not set `data-transitioning`).
- **OpenWhen letter (`views/OpenWhen.tsx`).** Tapping a sealed letter → `expand` with the envelope
  as the shared element (`lior-shared-letter-${id}`): the envelope grows from the list into a
  centered card, then (sequenced after the 400ms morph) the letter content unfolds with the M4
  `scaleY` reveal. `Haptics.tap` on open; a soft success when the letter finishes unfolding. The
  "unsealing" must feel ceremonial — never rush it; the morph is the full 400ms `--lior-motion-morph`.

#### M8 — DuetJournal turn handoff (`views/DuetJournal.tsx`)

Turn-based shared journaling. Opening an entry from the duet list → `expand` with the entry card as
shared element (`lior-shared-duet-${id}`). The *turn handoff* (partner's contribution appearing)
reuses the M4 reveal: partner's text unfolds top-origin `scaleY` + opacity, `springGentle`,
`Haptics.heartbeat()` — visually signaling "your turn / their turn" without a hard cut.

### 4.10 Shared-element implementation contract (for the engineer)

A single hook — call it `useSharedMorph(name: string)` — returns props to spread on **both** the
source and destination element. It:

1. On the source: in the `useTileOpen` tap callback, sets `el.style.viewTransitionName = name`
   right before `navigate()` (so the snapshot in `_runNativeVT`'s `commit()` captures it).
2. On the destination: sets the same `viewTransitionName` in a `useLayoutEffect` on mount (before
   paint) so the new snapshot has it.
3. Registers a cleanup that clears both names — hook it into `settle()`
   (`TransitionEngine.ts:198-203`) via a new `onSettle` callback array (mirror the existing
   `onPrefetch` pattern, `TransitionEngine.ts:251-255`) so names are cleared exactly when the VT
   finishes (or the watchdog fires).
4. Under reduced motion or no-VT-support: no-ops (the `expand`/`push` fallback carries it).

Per-element easing override (the only new CSS) goes in `root-fixes.css`:

```
::view-transition-group(*) { animation-timing-function: var(--lior-ease-silk); animation-duration: var(--lior-motion-morph); }
```

Scope it under the shared-name groups so it doesn't override the root push/pop timings. This is
**transform + opacity only** by virtue of being browser-driven group morphs — it passes the assert
guard (which only scans `@keyframes`, `motionExperience.assert.mjs:72-87`, and these morphs use no
custom keyframe).

---

### 4.11 Performance & stage-harmony budget (non-negotiable)

Every recommendation above obeys the shipped invariants — re-stated so nothing here regresses them:

- **The ambient stage pauses during every push/expand/pop/modal** (`data-transitioning='1'`,
  `TransitionEngine.ts:242` → `root-fixes.css:115-119`). Tab switches do **not** set it (the
  lock-free `runTabTransition` path, `App.tsx:356-383`, uses `data-tab-transitioning` which does
  *not* pause ambient) — correct, because a 240ms peer fade is cheap and the stage should keep
  living during a glance. The pill stretch, icon bloom, and FAB breath all run on the compositor and
  are individually <2ms/frame.
- **No live `backdrop-filter`** anywhere in the bar or transitions — the bar's glass is baked
  (`BottomNav.tsx:193-204`), and blur is force-disabled during transitions
  (`root-fixes.css:123-127`). None of my additions reintroduce it.
- **Every new animation is transform/opacity-only** so it passes `motionExperience.assert.mjs`
  (≥8 keyframes, all transform+opacity, no bounce/elastic curve). The new keyframes I add
  (`bn-icon-arrive`, `bn-fab-breathe`) and the pill `scaleX` stretch are all compliant; I verified
  against the assert rules at `:66-87`.
- **No overshoot, ever** (`:66-70` bans `1.56`/bounce/elastic). The pill stretch returns to
  `scaleX(1)`, the blooms return to `scale(1)` — all on silk, all critically damped. The
  Liquid-Glass *look* comes from the stretch-and-settle shape, not from a springy rebound.
- **Reduced motion** collapses all of it: pill → plain translate, no stretch; no arrival bloom; no
  FAB breath; route layer → instant opacity (`root-fixes.css:457-461`); `useTileOpen` already
  short-circuits (`hooks/useTileOpen.ts:51-57`). Add the three new bar classes to the existing
  `@media (prefers-reduced-motion: reduce)` blocks.

The result: a tab bar that breathes and flows like the Dynamic Island, navigation that moves you
through one continuous warm space, and shared elements that make every "open" feel like the thing
you touched *became* the thing you're looking at — all without ever disturbing the fixed background
that is the soul of the app.
## 5. Screen Blueprints — Home, Timeline, Daily Questions

> Scope: the three surfaces a couple touches every single day — `views/Home.tsx`, `views/MemoryTimeline.tsx`, `components/DailyQuestion.tsx`, `views/DailyMoments.tsx`. These are the *habit loop*. Everything here is grounded in the shipped code and the canonical token system (`utils/motion.ts`, `styles/root-fixes.css`, `index.css`, `hooks/useTileOpen.ts`). Where the code already does the right thing I say so and pin the exact line; where it fights itself I prescribe the fix in canonical tokens.
>
> **Non-negotiable for this whole section:** Home sits *directly on the fixed `AmbientVisuals` stage* (`components/AmbientVisuals.tsx`). The stage is the performance partner, not the backdrop to ignore. Every foreground beat below is choreographed to either (a) let the stage breathe through it, or (b) explicitly pause it via `data-transitioning='1'`. Foreground motion never loops faster than the ambient layers (which run `>= 2000ms`), so the two never visually beat against each other.

---

### 5.0 The shared grammar these three screens speak

Before the per-screen frame work, three rules bind all of Home/Timeline/Questions so they feel like one product, not three:

1. **Entrances decelerate, exits accelerate.** Entering content uses `--lior-ease-silk` `cubic-bezier(0.16,1,0.3,1)` (or `springSmooth {260,30,0.9}`). Leaving content uses `--lior-ease-exit` `cubic-bezier(0.4,0,0.2,1)`. This is already the law in `root-fixes.css:393` and `motion.ts:21`.
2. **No bounce, ever.** Every spring in `motion.ts` is critically damped (`springSmooth`, `springSnappy {460,34,0.7}`, `springGentle {170,26,1}`). The only sanctioned overshoot in the app is the `~0.3%` whisper on `.spring-press` release (`index.css:1691`) — felt, not seen. Any framer spring you add with a damping ratio under ~0.9 is a bug against this grammar.
3. **Tap = lift, navigate = bloom.** A card never just "gets replaced." `useTileOpen()` lifts the tapped surface (`tile-lift` 300ms scale `1 → 1.035`, `index.css:1738`) while `TransitionEngine` upgrades the push to an `expand` that blooms the new page from `--lior-open-x/y` (the tapped tile's centre, set in `useTileOpen.ts:67`). Home wires this on almost every tile; Timeline and Questions should adopt the same verb (see 5.2.4 and 5.3).

---

### 5.1 HOME — choreography on the living stage

Home is a vertical scroll of full-width "sections" (each wrapped by `<ScrollReveal>` → `.home-reveal-*`, `Home.tsx:231`) plus one 2-column bento grid (`.home-reveal-item`, `Home.tsx:984`). The reveal system is **CSS-keyframe driven** (`lior-home-reveal` 520ms silk, `root-fixes.css:207`), not framer — deliberately, so 8+ sections animating at once cost the compositor, not the main thread, while the R3F stage keeps its frame budget.

#### 5.1.1 Cold-open choreography (first paint → settled, frame-by-frame)

The intent: the stage is already alive (gradient wash + floating hearts), then the *content* arrives like a hand laying cards onto a lit table — top-down, decelerating, never all at once.

The shipped reveal ladder, element by element, with the exact delay each should carry via `style={{ '--home-reveal-delay' }}` (`Home.tsx:239`) — note the section wrappers currently pass NO `delay`, so they all fire at `0ms`. **That is the one real defect in Home's opening: every section blooms simultaneously.** Prescribed cascade (additive, all on the existing `lior-home-reveal` 520ms silk keyframe):

| Order | Element (file:line) | `--home-reveal-delay` | Reveal variant | Rationale |
|------|----------------------|----------------------|----------------|-----------|
| — | Header avatar + name (`Home.tsx:589`) | framer `springSmooth`, `x:-20→0` | (own motion) | Identity lands first, off the reveal system. |
| — | Sync pill (`Home.tsx:660`) | framer `springSnappy` `delay:0.2` | (own motion) | Already staggered 200ms behind the name. Keep. |
| 1 | Days-Together hero (`Home.tsx:684`, `fadeScale`) | `0ms` | `fadeScale` (y12, scale .965) | The emotional anchor — arrives with the header, count-up begins (5.1.2). |
| 2 | Heartbeat + Pet row (`Home.tsx:738`, `popIn`) | `90ms` | `popIn` (scale .94) | Pops a beat after the hero settles. |
| 3 | Status pills (`Home.tsx:783`) | `150ms` | (transform-only recede wrapper) | These carry `backdrop-filter`; reveal them with a `.home-reveal-slideFromLeft`-style transform-only entry — **never animate opacity on this wrapper** or the frosted glass flattens (same backdrop-root trap documented at `Home.tsx:780`). |
| 4 | Countdown card (`Home.tsx:881`, `slideFromRight`) | `210ms` | `slideFromRight` (x28) | Slides in from the right edge — directional variety against the vertical stack. |
| 5 | InsightWhisper (`Home.tsx:924`) | `270ms` | `fadeUp` | Quiet partner-insight; arrives late so it reads as an aside. |
| 6 | DailyQuestion (`Home.tsx:927`) | `330ms` | `fadeUp` | The ritual card — see 5.3 for its internal life. |
| 7 | On-This-Day (`Home.tsx:933`, `tiltUp`) | `390ms` | `tiltUp` (y26, scale .975) | Conditional; when present it's a delight, so it earns the most dramatic entry. |
| 8 | Bento grid (`Home.tsx:984`) | grid self-staggers `30/80/130/180/230/280ms` (`root-fixes.css:254`) **+ a `450ms` base offset on the grid container** | per-item `lior-home-reveal` | Already the only correctly-staggered block. Add a base delay so it doesn't race the sections above it. |

**Implementation note:** add the base delay by setting `--home-reveal-delay` on each `<ScrollReveal>` via its existing `delay` prop (it already multiplies by 1000 and rounds, `Home.tsx:239`), e.g. `<ScrollReveal variant="slideFromRight" delay={0.21}>`. For the grid's `450ms` base, wrap the `[data-home-reveal-grid]` div in a `.home-reveal` with `delay={0.45}` OR add `[data-home-reveal-grid]{ animation-delay: 450ms }` — prefer the prop so it stays declarative.

Total cold-open runway: header (0) → grid last item (`450 + 280 + 520` = **~1250ms to fully settled**). That is the correct ceiling — under ~1.3s the whole page has "arrived," matching Apple's home-screen settle and well inside the "feels instant but intentional" window.

#### 5.1.2 The day-count number — the one hero beat

`useCountUp` (`Home.tsx:246`) animates the days-together integer from 0 → target over **1800ms** with an ease-out-cubic (`1 - (1-p)^3`, line 268), gated on `heroInView` (`useInView once, margin -100px`, line 321). This is the single most emotional micro-moment on Home and it is implemented well. Keep it, with two refinements:

- **Start the count *after* the hero card has settled, not on mount.** It already keys off `heroInView`, but `fadeScale` reveal + count both starting at t=0 means the number is tweening while the card is still fading up. Gate the count start behind the reveal: have the hero's `lior-home-reveal` `animationend` flip a `heroSettled` flag, and pass `inView && heroSettled` to `useCountUp`. The number then begins ticking on a *settled* card — the eye locks onto it.
- **Tabular figures.** The legacy serif (`Outfit/Playfair`, `Home.tsx:40`) must render the counter with `font-variant-numeric: tabular-nums` so the 5.5rem digits don't reflow/jitter as they tick (e.g. 1→2 width change). This is a known perceived-quality fix for this app.

The hero also flips between "N days" and the detailed duration on tap (`showDetailedDuration`, `Home.tsx:693`) via a 500ms opacity+translate crossfade (lines 714/724). That `duration-500` is non-canonical — **retoken to `--lior-motion-morph` (400ms) on `--lior-ease-silk`** so the flip belongs to the same family as the route `expand`.

#### 5.1.3 React beats — press, lift, status toggles

- **Every tile press** is the global `.spring-press` primitive: down `scale(.955) translateY(2px)` over 60ms (`index.css:1697`), release over 300ms with the whisper-overshoot `var(--spring-bounce)`. The bento tiles *also* layer a framer `whileTap={{ scale:0.93, y:2 }}` with `spring {600,26}` (`Home.tsx:991`). **This is a double-transform conflict** — CSS `.spring-press:active` and framer `whileTap` both write `transform` to the same node tree on tap. Prescription: pick one. Keep `.spring-press` (it has scroll-cancellation wired globally in `index.tsx`) and **delete the `whileTap`/`transition` from the bento `motion.div`s** (`Home.tsx:991,1011,1033,1052,1072,1110`), reducing them to plain `onClick={(e)=>open(e,…)}` wrappers. Net: one transform owner, less main-thread spring work, identical felt result.
- **Tile → page** is `useTileOpen` (`open(e, () => setView(...))`, e.g. `Home.tsx:886`). The card lifts (`tile-lift`, 300ms) while the route blooms from its centre. Already correct on Countdown, On-This-Day, Open-When, Dinner, Aura Board, Bonsai, Private Space, Premium. **Gap: the Days hero and the Heartbeat/Pet buttons do not use `open()`** — the hero is a `TiltCard` self-toggle (fine, it doesn't navigate) but the Pet button (`Home.tsx:771`) navigates with a bare `setView('coco-pet')` and so jump-cuts. Wire it through `open()` for consistency.
- **Status pill toggle** (`toggleMyStatus`, `Home.tsx:538`) swaps awake/asleep. Today it's an instant style swap. Add a `--lior-motion-feedback` (140ms) `--lior-ease-soft` crossfade on the icon (Sun↔Moon) and fire `Haptics.toggleOn/off` (services/haptics.ts) on the flip — this is an explicit product action, so haptics are sanctioned (the `index.tsx` rule: haptics on explicit actions only, never raw pointerdown).
- **`isTogether` morph** (`Home.tsx:596`): when the partner comes online, the name button morphs into a warm gradient "Together now" pill via a `transition-all duration-300`. Retoken the `duration-300` to `--lior-motion-pop` (260ms) `--lior-ease-silk` and let the `animate-presence-dot` (the emerald presence dot, line 626) be the one looping element — capped well above 2000ms so it doesn't compete with the stage.

#### 5.1.4 Scroll behaviour on the living stage

Two compositor-only scroll systems are already in place and must be preserved:

- **`.scroll-recede`** (`index.css:1642`): as the hero leaves the viewport it sinks `translateY(-12px) scale(0.96)` and dims to `0.45`, scrubbed 1:1 by `animation-timeline: view()` — zero JS. The hero uses `.scroll-recede` (`Home.tsx:688`); the status pills use `.scroll-recede-flat` (transform-only, `Home.tsx:783`) precisely because they hold `backdrop-filter` and animating ancestor opacity would flatten their frost. **Respect this split religiously** — any new glass section gets `-flat`.
- **Floating header overlay** (`Home.tsx:565`): a fixed bar whose opacity/blur is mutated *directly on the DOM node from a rAF'd scroll listener* (`Home.tsx:466`), bypassing React re-render entirely. It is pre-promoted (`translateZ(0)`, `will-change`, `contain:layout paint style`, lines 578-580) so toggling `backdrop-filter` mid-scroll never re-creates a paint layer. This is the right pattern; do not convert it to state.
- **`content-visibility:auto` on `.home-reveal`** (`root-fixes.css:226`) skips paint *and* the 52px backdrop-blur of offscreen glass cards. This is what keeps the R3F stage's frame budget intact while a long Home scrolls. Never put a glass card outside a `.home-reveal` wrapper, or it paints permanently.

#### 5.1.5 HOME MOTION-DENSITY LIMITS (because it lives on the stage)

These are hard caps specific to Home. The stage already eats GPU; the foreground gets a strict budget:

1. **Max 1 looping foreground animation visible at rest, above the fold.** Inventory of current loops: `animate-spin-slow` on the awake Sun (status pills, ×1–2), `animate-presence-dot`, `animate-lock-breathe` (Private Space lock, `Home.tsx:1088`), the Lior Gold crown's framer `scale:[1,1.05,1]` `3.6s` loop (`Home.tsx:1130`), `HeartbeatRipple` (only when ambient audio is playing). **Rule:** the Gold crown loop and the lock-breathe are *below the fold* (in the bento), so they're allowed; but the awake-Sun `animate-spin-slow` is above the fold and duplicated across both status pills. **Cap the Sun to a single slow rotation ≥ 6s, or freeze it** — two spinning suns + a live R3F stage is the exact "competes with the background" failure this section exists to prevent.
2. **Every looping foreground animation ≥ 2000ms period.** Matches the ambient-loop floor. The Gold crown `3.6s` and `animate-lock-breathe` comply; verify `animate-spin-slow` and `ripple-ring` (`0.8s`, `Home.tsx:186`) — the ripple is gated behind `showHeartbeat && isLinked && AmbientService.isPlaying`, a rare transient burst, so its sub-2s period is acceptable *as a one-shot* but it must never become a resting loop.
3. **Simultaneous-entrance cap during cold-open: the stagger guarantees it.** Because reveals are delay-offset (5.1.1), at most ~2–3 sections are mid-tween in any single frame. Do **not** add `whileInView` framer reveals to Home sections — that would put main-thread springs in contention with the CSS reveals and the R3F tick. CSS keyframes only on Home.
4. **Transitions pause the stage.** `TransitionEngine` sets `documentElement.dataset.transitioning='1'`, which `AmbientVisuals` reads to pause `LiveBackground3D`/`FloatingHeartsScene` and which `[data-tier]` reads to kill `.scroll-recede` on low tiers (`index.css:1670`). So during any tile bloom, the stage is *frozen* — the foreground gets the full frame budget for the 360ms `expand`. This is correct; never start a Home loop that ignores `data-transitioning`.

#### 5.1.6 HOME VISUAL-HIERARCHY rules (what's allowed to move, and how loud)

Motion loudness must track emotional priority, not decoration:

- **Tier A (the relationship):** Days-together count-up (1800ms, once), heartbeat send/receive particle burst (`HeartbeatParticles`, `Home.tsx:585`), `isTogether` presence morph. These are the loudest, and they're earned — they're about *the two people*. Everything else is quieter than these.
- **Tier B (today's ritual):** DailyQuestion card (5.3), On-This-Day reveal, Countdown. Gentle silk reveals, `tiltUp`/`slideFromRight` — present but never animated at rest.
- **Tier C (utilities — the bento):** Open When / Dinner / Aura / Bonsai / Private / Gold. These are *buttons*, per the app's warm-aesthetic memory ("secondary features as buttons not tiles"). Their only motion is the entrance stagger + `.spring-press`. No idle loops except the single below-fold Gold crown shimmer.
- **The hero gradient and stage own all ambient/atmospheric motion.** Foreground Tier C must be *still* at rest so the stage reads through it. If a designer wants more life, it goes into the stage spec (which is frozen), not new foreground loops.

---

### 5.2 TIMELINE — memories enter, expand, and open

`views/MemoryTimeline.tsx` is a `PullToRefresh`-wrapped, month-grouped scrapbook: a stats strip, then per-month `<motion.section>` chapters, each with one `featured` 4:3 card + a 2-col grid of 3:4 cards (`MemoryCard`, line 128). Tapping a card opens `MemoryDetailModal` (a portal bottom-sheet, line 678).

#### 5.2.1 How memories ENTER (list reveal, frame-by-frame)

- **Stats strip** (`MemoryTimeline.tsx:1499`): `opacity:0,y:-6 → 1,0`, 500ms `EASE_SILK`. Drops in from above the fold first. Keep.
- **Month chapters** (`motion.section`, line 1562): `opacity:0,y:10 → 1,0`, 500ms `EASE_SILK`, `delay: min(groupIdx*0.06, 0.24)` — chapters cascade at 60ms each, capped at 240ms. Correct and canonical.
- **Cards** (`MemoryCardBase`, line 181): `opacity:0,y:10 → 1,0`, **220ms** `[0.16,1,0.3,1]` (silk), `delay: min(index*0.035, 0.32)`. Crucially, only the **first 9 cards** get a JS entrance (`animateEntrance = index < 9`, line 179) — below that, `initial={false}` so framer never drives offscreen springs. This is the right call; a 300-memory timeline would otherwise fire hundreds of simultaneous offscreen tweens. **Pair it with `content-visibility:auto`** (cards already carry `perf-list-item`/`data-perf-list-item`, line 189) so offscreen cards skip paint too.

**One refinement:** the 220ms card duration is slightly faster than the canonical `--lior-motion-pop` (260ms). Bump card entrance to **260ms** so it matches the pop token and reads a touch more deliberate — these are *photos of their life*, they deserve to settle, not snap.

#### 5.2.2 How the photo/media itself animates

`MemoryCard` media has **no Ken Burns at rest** — correct for a dense grid (idle pans on 9+ cards would be chaos and would compete with nothing useful). The film-frame filter (`saturate(1.18) contrast(1.04) sepia(0.12)`, line 217) is static. Loading state uses `<Skeleton type="image">` (line 206) which should cross-dissolve to the loaded image over `--lior-motion-micro` (200ms) `--lior-ease-soft` — **today the swap is a hard cut** (skeleton unmounts, img mounts). Prescription: wrap the media swap in a 200ms opacity crossfade keyed on `mediaLoading` so photos *develop in* rather than pop.

Contrast with `DailyMoments` `PhotoCard` (`DailyMoments.tsx:137`), which **does** do a one-shot reveal: `initial={{ y:-20, scale:1.15 }} whileInView={{ y:0, scale:1 }}` over **1200ms** silk, `once`. That's a deliberate "settle into frame" for the sparse, large moments grid. The two are correctly differentiated: dense timeline = quiet; ephemeral moments = one luxurious settle. Keep both, but note the moments reveal at 1200ms is the *outer* bound — never exceed it for a grid item.

#### 5.2.3 EXPAND — card → detail (the shared-element moment)

This is the marquee Timeline transition and the place to invest most. Today: tapping a card calls `feedback.light()` + `onOpen` (line 186), which sets `selectedMemory`; the `MemoryDetailModal` portal then enters as a **bottom-sheet** — backdrop `opacity 0→1` 200ms (line 818), sheet `y:'100%'→0` spring `{340,34}` (line 834). It's a clean iOS sheet, but it is **not** a shared-element expand — the tapped photo does not visibly *become* the hero of the sheet.

**Prescription — true shared-element bloom (frame-by-frame):**

1. **t=0 (tap):** `feedback.light()` fires (keep). Capture the tapped card's `getBoundingClientRect()` and write `--lior-open-x/y` to `documentElement` — i.e. **route this open through the same `useTileOpen` origin mechanism** (`useTileOpen.ts:67`) even though it's a modal, not a route. Add the `tile-lift` class to the card so it picks up (300ms).
2. **t=0–60ms:** card lifts (`scale 1→1.035`), backdrop blur begins fading in.
3. **t=60–440ms:** the sheet enters. Instead of a generic `y:100%`, the detail hero photo scales+translates *from the card's rect to its docked position* — a FLIP. Use framer `layoutId={`mem-${memory.id}`}` on both the grid card's `<img>` and the detail hero `<img>` (line 903), with `transition={{ type:'spring', ...springSmooth }}`. Framer's shared-layout then tweens the photo between the two positions automatically. The surrounding sheet chrome (date block, comments) fades/rises behind it with `opacity 0→1, y:12→0` over `--lior-motion-modal` (380ms) silk.
4. **t=440ms:** settled. The photo that was a grid thumbnail is now the sheet hero — *the same photo, never duplicated or cross-faded*. This is the Apple Photos "tap a thumbnail, it grows into the viewer" beat.

Because the modal is a `document.body` portal (line 816), the FLIP must use `motion.div` with `layoutId` inside a shared `LayoutGroup` spanning both the timeline list and the portal — wrap `MemoryTimelineView`'s return in `<LayoutGroup>`. If that proves too heavy on mid-range Android, the acceptable fallback is the **expand-from-origin** CSS path: reuse `lior-vt-expand-in` semantics (scale up from `--lior-open-x/y`, `root-fixes.css:376`) on the sheet container so it at least blooms from the tapped tile rather than always from the bottom edge.

**Reduced motion:** both paths must collapse to the existing opacity-only modal (the global `<MotionConfig reducedMotion="user">` already neuters framer transforms; ensure the CSS expand path is inside a `@media (prefers-reduced-motion: no-preference)` guard like `.scroll-recede` is).

#### 5.2.4 Inside the detail sheet — swipe, dismiss, reactions, comments

The detail modal is already rich; specify the motion contract:

- **Swipe between memories** (`useViewerGestures`, line 722): `onNavigate(±1)` swaps `selectedMemory`; the keyed inner `motion.div` (line 865) slides the new memory in from `navDir * 56px` with `opacity 0.4→1` over **260ms** `[0.22,1,0.36,1]` (soft). The sheet itself stays mounted (`key="memory-detail"`, line 1685) so only the *content* slides — correct, this is the iOS Photos horizontal pager. `feedback.light()` fires per navigate (line 1386). Keep; retoken the 0.26 to `DUR_POP`.
- **Pull-down dismiss** (`gestures.sheetY`, line 829): the wrapper follows the finger 1:1; release past threshold runs the exit `y:'100%'` spring `{340,34}`. The drag handle (line 848) is the grab affordance. This is correct native behaviour — the live drag `y` is deliberately kept on a *separate* wrapper from the enter/exit spring (line 826) so they never fight over the same value. Preserve that separation.
- **Reactions row** (`Loved` chip + notes count, line 1066): static chips. The `Loved` heart could earn a one-shot `Haptics.success` + a 200ms `scale 1→1.15→1` `springSnappy` pop *on first tap only* — a tiny delight, not a loop.
- **Comment send** (`sendComment`, line 766): the send button only exists when `inputText.trim()` — it springs in via `AnimatePresence` `scale:0→1` `springSnappy` (line 1230) and springs out on send. New comment bubbles enter `opacity:0,y:8 → 1,0` (the bubble list). After send, auto-scroll to bottom `behavior:'smooth'` (line 782). This is correct and snappy. Add `Haptics.tap()` on send to match DailyMoments' explicit-action haptics.
- **Reply pill** (line 1192): height-auto expand/collapse `opacity+height` 160ms — fine as-is (a chrome micro-transition, sub-200ms is acceptable for height collapse).

#### 5.2.5 Delete (destructive motion must read as loss, gently)

`requestDelete` → `ConfirmModal` → `confirmDelete` optimistically filters the memory out of state (`MemoryTimeline.tsx:1317`). The card currently just *vanishes* (the `AnimatePresence exit={{ opacity:0 }}`, `MemoryCard` line 184). For a memory — emotionally weighted — the exit should be a **collapse, not a blink**: `exit={{ opacity:0, scale:0.92, transition:{ duration:0.2, ease: EASE_EXIT } }}`. `feedback.tap()` already fires on request (line 1305). Keep the `ConfirmModal` as the gate (deleting a memory must never be a one-tap accident).

#### 5.2.6 Empty + recovery states

The empty state (line 1438) is well-choreographed: icon `scale .9→1` springSmooth with a `breathe-glow` halo, headline `y:20→0` delay 0.15, body delay 0.25, CTA `y:10→0` delay 0.4 spring. A clean top-down cascade — keep, but retoken the ad-hoc `duration:0.8 ease:'easeOut'` lines (1455, 1464) to silk so the empty state speaks the same curve as the rest. The `Syncing memories` pill pulses (`animate-pulse`) — acceptable transient.

---

### 5.3 DAILY QUESTIONS — the emotional core of the daily ritual

`components/DailyQuestion.tsx` lives on Home (`Home.tsx:927`) and is *the* two-person beat. Its motion must carry the emotional arc: **curiosity → vulnerability (you answer) → anticipation (waiting) → the reveal (you see them).** The component already models four states via `AnimatePresence mode="wait"` (line 93): `revealed`, `waiting`, `expanded` (input), `prompt`.

#### 5.3.1 Question reveal (the card at rest)

The card is glass (`backdrop-blur(24px)`, line 70) and uses `layout="size"` with a `spring {400,32}` (line 77) so it **grows/shrinks fluidly** as state changes — when the textarea expands, the card breathes open rather than jumping. This is the right primitive. Two refinements:

- Retoken the layout spring to `springSnappy` `{460,34,0.7}` so the card's size morph matches the app's "quick UI" family rather than a one-off `{400,32}`.
- The card sits at reveal-order **6** in the cold-open cascade (5.1.1, `~330ms` delay). On a fresh day, the question text (`font-serif italic`, line 88) should *fade up* with the card; on a day where the partner has already answered (the `revealed` path can be true on load), suppress the count-up of attention — see 5.3.4.

#### 5.3.2 Answer submission (vulnerability)

1. **Tap card → expand input** (`handleCardClick`, line 35): `expanded=true`, then `setTimeout(focus, 350)` (line 38). The `AnimatePresence` swaps `prompt → input` with `opacity+height 0→auto` (line 128). The 350ms focus delay is tuned to let the height-expand finish before the keyboard rises — **keep it, and align it to the keyboard system** (`--lior-kb-rise`): the card should sit inside a `kb-inset-bottom`/`KeyboardSpacer` so when the IME opens, the card isn't occluded. This is the documented keyboard-overlay contract.
2. **Type** → the Send button's enabled state crossfades its background (line 166) — instant, fine.
3. **Submit** (`handleSubmit`, line 42): optimistically writes `myAnswer` into `entry`, collapses input (`expanded=false`). Today the transition to the `waiting` state is a plain opacity swap. **Prescription:** on submit, fire `Haptics.success` (explicit product action) and let the input collapse via the `layout` spring while the `waiting` row fades up `opacity:0→1` — *and add a one-shot "sealed" micro-beat*: a tiny lock/envelope icon that scales `0→1` `springSnappy` next to "Waiting for {partner}…", reinforcing the `"won't see this until they answer too"` privacy promise (line 174). This is the emotional payoff of *being vulnerable first*.

#### 5.3.3 Waiting state (anticipation)

The `waiting` row (line 110) is a static dot + italic text. Anticipation deserves one *quiet* pulse: the amber dot (`#fb923c`, line 118) gets a `--lior-motion`-respecting breathe (`scale 1→1.25→1`, `opacity 0.6→1→0.6`, **2400ms** ease-in-out loop) — a soft heartbeat that says "still open, still waiting." It's on Home over the stage, so it obeys the ≥2000ms loop floor (5.1.5). Exactly one looping element here; nothing else moves.

#### 5.3.4 PARTNER-RESPONSE REVEAL (the beat the whole app is built around)

When both have answered, the card enters `revealed` (line 94) and shows two `AnswerBubble`s (line 200): yours (`isMe`, rose tint) `delay:0`, theirs (`delay:0.12`) — both `opacity:0,y:8 → 1,0`. This is good but **underplayed for the single most important moment in the product.** This is where Lior earns "love, presence, the emotional beat." Full frame-by-frame upgrade:

1. **Trigger:** the partner's answer arrives via sync while the card is in `waiting`. Do **not** silently swap to `revealed` — that throws away the moment. Instead, intercept the transition.
2. **t=0–150ms — anticipation snap:** the waiting dot stops pulsing and the card does a single `Haptics.heartbeat` (services/haptics.ts) — a literal heartbeat as their words arrive. The card's glass border warms (rose) over 150ms `--lior-ease-soft`.
3. **t=150–400ms — your answer settles first:** your `AnswerBubble` is already on screen (you wrote it) — it gently lifts into the revealed layout via the card's `layout` spring. No surprise here; it's *yours*.
4. **t=400–700ms — their answer blooms:** their bubble enters with a *little more* than the current `y:8` — `opacity:0, y:14, scale:0.97 → 1,0,1` over `--lior-motion-morph` (400ms) `--lior-ease-silk`, **delay 0.25** (slightly more than the current 0.12) so there's a held breath before *their* words appear. As it lands, a `Haptics.doubleBeat` and a *single* soft particle (reuse one `HeartbeatParticles`-style heart, not a celebration storm) drifts up behind the card.
5. **t=700ms+ — rest:** both bubbles static. The card stays warm-bordered for the session. No looping.

The discipline: this beat is **loud once, then silent.** It is a Tier-A moment (5.1.6) — it's allowed to be the loudest thing on Home for those ~700ms, and the stage is *not* paused (this isn't a route transition), so the particle and haptics must be light enough to coexist with the live R3F hearts. One heart, not fifty.

#### 5.3.5 Completion / streak feedback

DailyMoments uses `feedback.celebrate()` (5-beat escalate) on a successful moment post (`DailyMoments.tsx:716`) — appropriate for "you shared something." For the *daily question*, completing it (both answered) should **not** use the full `celebrate()` — that's too loud and would fire every day, deadening it. The 5.3.4 `heartbeat → doubleBeat` ladder *is* the completion celebration; it's proportionate to a daily ritual. Reserve `celebrate()` for genuine milestones (streak hitting 7/30/100), surfaced via the streak chip in the header (`Home.tsx:646`), which should `scale 1→1.2→1` `springSnappy` + `celebrate()` only when the streak *crosses* a milestone, not every increment.

---

### 5.4 Cross-screen consistency checks (the audit hooks)

So a senior engineer can verify the build matches this blueprint:

1. **No raw `duration-300/500` on these screens** — all retoken to `--lior-motion-*`. Current offenders to fix: `Home.tsx:596` (`duration-300` morph), `Home.tsx:714/724` (`duration-500` hero flip), `MemoryTimeline.tsx:1455/1464` (`duration:0.8`).
2. **No framer `whileTap` co-located with `.spring-press`** — the bento double-transform (5.1.3) is the only instance; remove it.
3. **Every looping foreground animation on Home is ≥2000ms** — audit `animate-spin-slow` (the one likely violator) and cap to ≤1 above-the-fold loop.
4. **Card entrance springs are critically damped** — grep for any new `damping < 0.85 * sqrt(stiffness)` in these files; there should be none.
5. **Reduced-motion:** the partner-reveal (5.3.4) particle + haptics must be skipped when `prefersReducedMotion()` (`motion.ts:61`) is true, falling back to the plain opacity bubble reveal. The `<MotionConfig reducedMotion="user">` handles framer; the bespoke particle/haptic calls need an explicit guard.
6. **`motionExperience.assert.mjs`:** the new CSS (hero-flip retoken, card-collapse exit, expand-modal path) must keep all `lior-vt-*`/`tile-lift`/`lior-home-reveal` keyframes **transform+opacity only** — no `width`/`top`/`filter` animated in a keyframe, or the guard fails. The FLIP for 5.2.3, if implemented in framer `layoutId`, is exempt (it's JS transform), but any CSS `expand` fallback must scale, not resize.

---

### 5.5 Summary of prescribed changes (build checklist)

- **Home:** stagger the section reveals (currently all `0ms`) per the 5.1.1 ladder; gate count-up on `heroSettled`; tabular-nums on the day counter; remove bento `whileTap`/`spring-press` conflict; retoken hero-flip + `isTogether` morph; cap above-fold loops to 1 (the awake Sun); wire Pet button through `open()`; add toggle haptics + 140ms icon crossfade on status flip.
- **Timeline:** bump card entrance 220→260ms; crossfade skeleton→photo (200ms); implement shared-element expand (5.2.3, `layoutId` FLIP with CSS expand-from-origin fallback); collapse-not-blink delete exit; add send haptic; retoken empty-state durations to silk.
- **Daily Questions:** retoken layout spring to `springSnappy`; keyboard-inset the expanded input; add `sealed` micro-beat + `Haptics.success` on submit; quiet 2400ms breathe on the waiting dot; **upgrade the partner-response reveal to the 5.3.4 heartbeat→doubleBeat + single-heart sequence** (the headline emotional investment); reserve `celebrate()` for streak milestones only.
## 6. Screen Blueprints — Connection, Relationship Profile, Premium, Settings

> **Scope.** Phase 4, part 2. This section specs the foreground motion for four clusters: the
> **Connection** surfaces (Lior has no messenger — "chat" maps to DuetJournal, VoiceNotes,
> AuraSignal/Pulse, and the DailyQuestion reveal), the **Relationship Profile** (the `Us` tab +
> `Profile.tsx`), **Premium** (`Premium.tsx` — the most luxurious surface in the app), and
> **Settings** (the groups inside `Profile.tsx`). Every recommendation is grounded in the real
> files and uses the canonical token system verbatim (`utils/motion.ts`, `styles/root-fixes.css`,
> `components/premium/GoldKit.tsx`, `services/haptics.ts`). New tokens are flagged explicitly at
> the end.
>
> **The fixed background, restated for this section.** Connection and the `Us`/`Profile` surfaces
> render *over* the shared `AmbientVisuals` stage (warm radial wash + R3F hearts). They are
> light-themed and **transparent** — so all foreground motion here must be **transform + opacity
> only**, must never paint an opaque full-bleed rectangle that would occlude the wash, and must
> respect `document.documentElement.dataset.transitioning='1'` (the engine already pauses ambient
> layers during a route change; foreground entrances ride *after* the route settles).
> The **Premium** and **GoldShell** surfaces (`DuetJournal`, `VoiceNotes`) are the deliberate
> exception: they paint their **own** dark `lp-stage` aurora *because* they are a sealed wing —
> the "Gold" world — and the Home stage is intentionally covered there. That is a feature, not a
> leak: it signals "you've entered the vault." Everywhere else, the Home stage shows through.

---

### 6.0 Motion contract for this whole section

Two distinct motion dialects coexist here, and the rule for which to use is **surface-based**, not
preference-based:

| Dialect | Where | Springs / curves | Source of truth |
|---|---|---|---|
| **Warm-light** | `Us.tsx`, `Profile.tsx`, `AuraSignal.tsx`, DailyQuestion reveal | `springSmooth` / `springSnappy` / `springGentle` from `utils/motion.ts`; CSS uses `--lior-ease-silk/soft/press/exit` | `utils/motion.ts:32-34`, `styles/root-fixes.css :root` |
| **Gold-dark** | `Premium.tsx`, `DuetJournal.tsx`, `VoiceNotes.tsx`, `ComposeSheet`, `DuetSpread`, `WaxSeal` | `GOLD_SOFT_SPRING {280,32,0.9}` / `GOLD_PRESS_SPRING {560,30}` from `GoldKit.tsx` | `components/premium/GoldKit.tsx:33-34` |

**Critical:** `GOLD_SOFT_SPRING` (`{stiffness:280, damping:32, mass:0.9}`, `GoldKit.tsx:33`) is a
hair stiffer than the canonical `springSmooth` (`{260,30,0.9}`, `motion.ts:32`) and `PRESS_SPRING`
in `Premium.tsx:60` is `{560,30}` vs. the warm `springSnappy {460,34,0.7}`. These are **already
shipped and consistent within the Gold wing** — do not "fix" them to the warm springs. The Gold
wing is allowed its own marginally-firmer signature because it is a self-contained world. Within
each surface, never introduce a third spring.

Durations everywhere map to the ms ladder: `press 90 · feedback 140 · micro 200 · tab 240 ·
pop 260 · push 360 · modal 380 · morph 400`. Anything that loops (pulse rings, sheen, breathing
orbs) must be `>= 2000ms` so it never competes with a gesture (the rule the canonical system
already enforces; `VoiceNotes` recording rings use `3000ms+`, `AuraSignal:100` blobs use
`15000–20000ms`).

---

## 6.A CONNECTION — the real comms surfaces

There is no chat screen. "Connection" is four rituals: **turn-based shared writing** (DuetJournal),
**presence pings** (AuraSignal/Pulse), **voice** (VoiceNotes), and the **partner-response reveal**
(DailyQuestion, covered in §3 — here we spec only its *reveal* moment as it appears in
`Premium.tsx`'s spotlight and `DuetJournal`'s ceremony, which share the wax-crack vocabulary).

The animating idea for all four: **two people, asynchronous, never co-present at the keyboard.**
Motion must dramatize *separation then arrival* — the wax seal that hides one pen until both are
down, the charge-ring that turns intent into a felt ping, the waveform that turns a voice into a
visible object. No "typing…" dots, no read-receipt ticks borrowed from messengers. We earn the
emotional beat instead.

---

### 6.A.1 DuetJournal — turn-based entries (`views/DuetJournal.tsx`)

This is the flagship Connection surface and the richest motion sequence in the app. It already
implements a four-phase ceremony state machine (`CeremonyPhase = 'idle' | 'sealed' | 'cracking' |
'open'`, `DuetJournal.tsx:30`). The blueprint formalizes, tightens, and frame-locks what's there.

#### Stage transition: begin → deal → active (`DuetJournal.tsx:596-712`)

The single `<AnimatePresence mode="wait" initial={false}>` swap between the three stage states is
correct. Lock the choreography:

- **Each stage card** enters `{opacity:0, y:14}` → `{opacity:1, y:0}` on `GOLD_SOFT_SPRING`, exits
  `{opacity:0, y:-10, transition:{duration:0.2}}` (`DuetJournal.tsx:599-604`). Keep `mode="wait"`
  so the outgoing card fully clears before the incoming arrives — with the Gold soft spring this
  reads as ~360–400ms total, matching `push`. Do **not** crossfade them; the vertical hand-off is
  what makes "the table is being reset" legible.

#### Deal-the-cards (`DuetJournal.tsx:632-659`) — frame-by-frame

The three prompt cards are dealt with `goldStagger` (`staggerChildren:0.055, delayChildren:0.04`,
`GoldKit.tsx:36-39`) and `dealCardVariants` (`DuetJournal.tsx:426-429`), each with a per-index
resting tilt (`-2° / +1.6° / -1°`) that resolves to `0°`. This is the strongest single gesture on
the screen — it must feel like cards thrown onto a table.

| Frame (ms from stage settle) | Card 0 | Card 1 | Card 2 |
|---|---|---|---|
| 0 | `opacity:0, y:30, rotate:-2°` | hidden | hidden |
| 40 (`delayChildren`) | spring start → `y:0, rotate:0` | — | — |
| 95 (`+0.055`) | settling | spring start | — |
| 150 | settled | settling | spring start |
| ~420 | rest | rest | rest (`GOLD_SOFT_SPRING` settle) |

Keep the `whileTap={{scale:0.97}}` on `GOLD_PRESS_SPRING` for each card (`DuetJournal.tsx:644-645`).
**Add** (cheap, high-value): on `handleChoose` (`:487`) the two *unchosen* cards should not just be
unmounted by the stage swap — they should visibly "go back to the deck." Implement by giving the
chosen card `layoutId="duet-active-card"` and letting the active-stage card adopt the same
`layoutId`, so the tapped prompt **morphs** into the `ActiveDuetCard` header (a `morph`, 400ms,
`GOLD_SOFT_SPRING`) while the siblings fall away with their existing exit. This is the single
biggest upgrade available here and uses only `framer-motion` layout (transform-only).
`feedback.tap()` already fires at `:488`.

#### Writing → sealing one answer (`AnswerSlot`, `DuetJournal.tsx:137-202`)

Each partner has a slot that flips between an **empty pen button** and a **sealed wax card** via
`<AnimatePresence mode="wait" initial={false}>` (`:138`). The sealed state's hero moment is the
`WaxSeal` stamping in:

```
initial={{ scale: 1.7, opacity: 0, rotate: 8 }}
animate={{ scale: 1,   opacity: 1, rotate: 0 }}
transition={{ ...GOLD_PRESS_SPRING, delay: 0.12 }}   // DuetJournal.tsx:162-164
```

This is a **press-down stamp**: it arrives oversized and rotated, then the firm `GOLD_PRESS_SPRING`
(`{560,30}`) slams it to rest — exactly the physical metaphor of pressing a signet into hot wax.
**Frame lock & refine:**

| Frame | State |
|---|---|
| 0 | slot's sealed card fades up `{opacity:0, scale:0.97}` → 1 on `GOLD_SOFT_SPRING` (`:140-143`) |
| +120ms (`delay:0.12`) | seal begins: `scale 1.7→1`, `rotate 8°→0°`, opacity 0→1 |
| +~180ms | seal "lands" (snappy press spring, no overshoot) |

**Haptic:** the seal landing must be felt. Replace nothing in `handleSeal`, but at the moment the
non-completing branch fires (`:518-522`) call `Haptics.press()` (Medium, `services/haptics.ts:81`)
*instead of* the current `feedback.tap()` so the stamp has weight. The completing branch already
escalates to `feedback.celebrate()` (§ below). Document this as: **one pen down = Medium press;
both pens down = celebrate**.

The decorative **ghost lines** behind the seal (`:152-159`, blurred 5px) must stay static — they
are the "you can't read it" signifier. Never animate their width or unblur them; that would imply
the text is becoming legible, which breaks the privacy promise.

#### The reveal ceremony — `sealed → cracking → open` (`DuetJournal.tsx:526-537`)

When both answers exist, `handleSeal` runs the timed ceremony:

```
setPhase('sealed');
t+700ms  → setPhase('cracking'); feedback.celebrate();   // :532-535
t+1650ms → setPhase('open');                              // :536
```

This is the emotional climax of the entire Connection cluster. Full frame map:

| t (ms) | Phase | What moves | Tokens |
|---|---|---|---|
| 0 | `sealed` | both `WaxSeal`s sit at rest; `statusCopy` swaps to "Both sealed. Breaking the wax…" (`:224`) | — |
| 0–700 | `sealed` | **anticipation hold.** Add: a single slow `scale:[1,1.04,1]` breath on the seal cluster over the full 700ms (one cycle, `--lior-ease-soft`) so the pause feels alive, not frozen | new loop ≤700ms (one-shot, allowed since it's not a competing repeat) |
| 700 | `cracking` | `WaxSeal cracked=true` → the two clipped halves fly apart: left `{x:-0.45·size, y:+0.18·size, rotate:-26°, opacity:0}`, right `{x:+0.45·size, y:+0.1·size, rotate:22°, opacity:0}` over `0.55s` `EASE_SOFT` (`WaxSeal.tsx:79-85`) | `EASE_SOFT [0.22,1,0.36,1]` |
| 700 | `cracking` | `UnlockBurst` fires — 18 particles on radial trajectories (`DuetJournal.tsx:68-88`, CSS `lp-burst`) | CSS keyframe |
| 700 | `cracking` | **`feedback.celebrate()`** → the escalating 5-beat (`services/haptics.ts:101` / `Haptics.celebrate()` `:514`) | Haptic ladder |
| ~1250 | `cracking` | wax halves fully gone; writing block begins its exit `{opacity:0, scale:0.98, duration:0.25}` (`:252`) | — |
| 1650 | `open` | `DuetSpread` mounts: both letters unfold (next block) | `goldStagger` |

**Reduced motion (`DuetJournal.tsx:526-530`):** the path correctly collapses to an instant
`setPhase('open')` + `feedback.celebrate()`, and `WaxSeal` swaps its crack poses to a pure
`opacity:0` fade (`WaxSeal.tsx:79-85`, `crackTransition` 0.15s `:85`). Keep this exactly.

#### DuetSpread — the letters unfold (`components/premium/duet-journal/DuetSpread.tsx`)

The opened spread is the payoff. It uses `perspective:900` (`DuetSpread.tsx:40`) and unfolds each
letter from a face-down tilt:

```
hidden:  { opacity:0, y:24, rotateX:-26°, rotate:0 }
visible: { opacity:1, y:0,  rotateX:0,    rotate: ±tilt }  // :18-21, GOLD_SOFT_SPRING
```

The alternating resting `tilt` (`-0.6° / +0.7°`, `:62`) gives the two letters a hand-laid,
slightly-imperfect feel — keep it; it's the difference between "paper" and "div." The `&` divider
between them pops via `ampersandVariants {scale:0.6→1}` (`:23-26`), gated behind the same
`goldStagger`, so the sequence reads **first letter unfolds → "&" blooms → second letter unfolds**.
Frame budget: with `staggerChildren:0.055` and `GOLD_SOFT_SPRING`, both letters are settled by
~600ms after `open`. That lands the whole ceremony at ~2.25s — long for a transition, **correct**
for a ceremony. Do not shorten it.

#### Shelf spine expand/collapse (`ShelfSpine`, `DuetJournal.tsx:326-422`)

Archive rows expand with `<AnimatePresence initial={false}>` and `{opacity:0, y:-8}` →
`{opacity:1, y:0}` on `GOLD_SOFT_SPRING` (`:384-389`), chevron rotates `0→180°` on the same spring
(`:377`). This is clean. One guard: the expansion animates `y` and `opacity` only (good — no
`height:auto` spring, which jitters on Android WebView). If a revealed spread is inside, it carries
its own `DuetSpread` stagger, so let the container settle first (the `y:-8` slide is short, ~260ms)
before the letters cascade. `feedback.tap()` on toggle (`:725`) — keep.

#### "Tuck onto the shelf" (`DuetJournal.tsx:299-311`)

The active card retires via the stage `AnimatePresence` exit. **Add** a directional cue: because
the card is being *filed away*, give it an exit of `{opacity:0, y:-10, scale:0.97}` and let the
shelf section's first child do a one-time `goldRise` re-stagger so the just-tucked entry visibly
"joins the shelf." This connects cause (tuck) to effect (a new spine appears) — a Notion-grade
continuity beat. `feedback.tap()` already at `handleTuck` (`:540`).

---

### 6.A.2 ComposeSheet — typing & composing (`components/premium/duet-journal/ComposeSheet.tsx`)

The private writing surface. It is a bottom sheet portaled to `document.body` (React-19-safe
pattern, `ComposeSheet.tsx:81`).

#### Entrance (`:84-107`)

- Scrim: `opacity 0→1` (`:85-86`), exit `opacity:0, duration:0.22` (`:87`).
- Sheet: `y:'104%' → 0` on `SHEET_SPRING {stiffness:400, damping:41, mass:1}` (`:26, :92-96`),
  exit `y:'104%', duration:0.3, ease:[0.4,0,0.7,0.2]` (`:95`).

`SHEET_SPRING` here is intentionally more damped (`damping:41`) than `GOLD_SOFT_SPRING` — a sheet
that overshoots feels cheap, a sheet that glides up and *stops dead* feels like glass on a rail.
**Keep `SHEET_SPRING` for all bottom sheets in the Gold wing** (it is duplicated in `VoiceNotes`'
review sheet via `GOLD_SOFT_SPRING` at `VoiceNotes.tsx:766` — see fix note in §6.A.4). The exit
curve `[0.4,0,0.7,0.2]` is an accelerate-into-floor — correct for "dropping" a sheet; this maps to
the `--lior-ease-exit` family in spirit and should stay.

#### Focus timing (`:34-41`)

The textarea is focused **420ms** after open (`setTimeout(... 420)`, `:37`) — i.e. *after* the
sheet has settled (`SHEET_SPRING` lands ~380–400ms). This is deliberate and correct: focusing
mid-flight on Android raises the keyboard while the sheet is still translating, which fights the
`--lior-kb-rise` model and produces a double-jump. **Do not lower the 420ms.** Pair it with the
keyboard system: the sheet already has `paddingBottom: env(safe-area-inset-bottom)` (`:104`); when
the keyboard rises, the sheet should ride `--lior-kb-rise` (overlay model) rather than reflow.

#### The composing micro-loop (the actual "typing")

There is no typing animation today, and there should be **almost** none — but two restrained beats
elevate it:

1. **Caret = accent.** Already done: `caretColor: accent` (`:164`). This is the entire "typing
   feels alive" budget on the page body. Keep.
2. **Char counter pressure** (`:172-177`). As `text.length` crosses `MAX_CHARS-60` (`nearLimit`,
   `:79`), the counter switches color to `GOLD.light` instantly. **Add** a `springSnappy`
   `scale:[1, 1.08, 1]` pulse (one-shot, ~200ms `micro`) on the counter the first frame it enters
   `nearLimit`, so the writer feels the ceiling approaching without a jarring warning. Transform
   only.
3. **Seal CTA enable** (`:181`). `GoldCTA` goes from disabled (`rgba(255,255,255,0.08)`,
   `GoldKit.tsx:256`) to live gradient the instant `trimmed` becomes non-empty. **Add** a 200ms
   `micro` cross-fade on the CTA's `background` *and* a single `scale:[1,1.02,1]` so the button
   "wakes up" on the first real character — the moment the page becomes sendable is worth marking.

#### Pan-to-dismiss (`:59-70, :123-128`)

The grab-zone-scoped pan is the right pattern (textarea keeps native selection). Resistance is
asymmetric: downward `1:1`, upward `×0.06` (`:60, :125`). Threshold: `offset.y>130 || velocity.y>700`
→ dismiss with `feedback.tap()` (`:64-66`); otherwise spring home on `{stiffness:420, damping:34}`
(`:68`). This is iOS-grade — keep verbatim. The only addition: on a *committed* dismiss, fire
`Haptics.softTap()` (`services/haptics.ts:248`, Light-short) the instant the threshold is crossed,
not on release, so the gesture confirms under the thumb.

#### Sealing from the sheet → the stamp hand-off

When `handleSeal` (`:74-77`) calls `onSeal(trimmed)`, the sheet closes (its own exit) and the
`AnswerSlot` stamp (§6.A.1) plays. **Continuity rule:** the sheet's exit (`y:'104%'`, 300ms) and
the stamp's `delay:0.12` are sequenced so the wax appears to be *what the sheet left behind*. Do
not let them overlap visually — the sheet must be ≥60% off-screen before the stamp's scale-down
reads. Current timings already satisfy this; lock them.

---

### 6.A.3 AuraSignal / Pulse — presence + heartbeat ping (`views/AuraSignal.tsx`)

This is the purest "felt presence, not a message" surface (`:189`). It is **warm-light** dialect
(renders over the Home stage; `bg-gray-50`, `:175`). Its motion is built around one verb:
**charge, then fire.**

#### Signal selection (`:251-308`)

Signal cards are `motion.button` with `layout`, entering `{opacity:0, y:30}` →
`{opacity:1, y:0}` on `{type:'spring', stiffness:400, damping:25, delay: index*0.08}` (`:260-266`).
On select, the chosen card scales to `1.02` and **siblings dim to `opacity:0.2`** (`:262-264`) —
this focus-pull is excellent and on-brand. Two refinements:

- `stiffness:400, damping:25` here is *slightly* underdamped vs. the warm canon. Migrate to
  `springSnappy {460,34,0.7}` (`motion.ts:33`) for the select/scale response so it matches every
  other warm toggle in the app. Keep the `delay: index*0.08` entrance stagger.
- The selected card's pulsing inner orb (`:289-295`, `scale:[1,1.2,1], opacity:[0.5,0,0.5]`,
  `duration:2, repeat:Infinity`) is a `2000ms` loop — exactly at the ambient floor. Keep; it reads
  as a heartbeat at rest.

#### Hold-to-send charge ring (`:135-149, :327-372`) — frame-by-frame

This is the signature interaction. `startCharge` ticks `progress += 2` every `10ms` (~500ms to
full, `:139-141`), driving an SVG ring (`strokeDashoffset`, `:332-336`) and an inner "charge wave"
fill (`height:${holdProgress}%`, `:368-370`). At 100% → `fireSignal`.

| t (ms) | progress | Ring | Orb | Haptic |
|---|---|---|---|---|
| 0 (pointerdown) | 0 | empty | `whileTap scale:0.9` (`:346`) | `feedback.tap()` (`:137`) |
| 0–500 | 0→100 | `strokeDashoffset` sweeps `339.292→0` (`:335`) | inner wave rises 0→100%; outer glow grows `boxShadow:0 0 ${progress}px` (`:350`) | every 20% (`progress%20===0`): `navigator.vibrate(10)` (`:142`) |
| ~100,200,… | 20,40,… | — | Navigation icon `-translate-y-1 scale-110` while `progress>0` (`:359`) | tick |
| 500 | 100 | full ring | — | — |
| 500 | — | `fireSignal` (`:156`): `controls.start({scale:[1,20], opacity:[1,0], duration:0.8})` (`:129`) — the orb **expands to fill the screen and dissolves** | `feedback.celebrate()` (`:165`) |
| 500–1300 | — | whole stage `opacity→0` (`:181`, `transition-opacity duration-1000`) | — |
| ~2500 | — | reset + `setView('home')` (`:167-171`) | — |

**Upgrades, all token-aligned:**

1. **Replace the raw tick haptic.** `navigator.vibrate(10)` at 20% intervals (`:142`) bypasses the
   rich ladder. Swap to `Haptics.longPressProgress(holdProgress/100)` (`services/haptics.ts:541`),
   which is *built for exactly this* — it escalates Light→Medium→Heavy as the argument goes 0→1
   (header doc `:35, :56`). The charge will physically intensify under the thumb. This is the
   single highest-impact change on the screen.
2. **The fire = heartbeat, not just celebrate.** Pulse's entire metaphor is sending a heartbeat
   across distance. At `fireSignal` keep `feedback.celebrate()` for the sender's "it's away" pop,
   but the *defining* haptic for this feature should be `Haptics.doubleBeat()` (`:493`, the
   "romantic double heartbeat," header doc `:54`). Fire `doubleBeat()` at the instant the ring
   completes (t=500), *then* let the dissolve play. Sender feels their own heartbeat leave.
3. **Receive side (cross-device, via `SyncService.sendSignal('AURA_SIGNAL', …)` `:158-164`).** When
   the partner's device renders the incoming aura, the receive animation should be the *mirror* of
   the send dissolve: the `activeSignal.color` `FluidBackground` (`:85-116`) blooms `opacity:0→1`
   over `1.5s` (already `:91`), and the receiving haptic **must** be `Haptics.doubleBeat()` —
   header doc explicitly maps "Aura signal received → doubleBeat()" (`:54`). Two phones, one
   heartbeat pattern, seconds apart. That symmetry is the product.
4. **Cancel.** `cancelCharge` (`:151-154`) resets `holdProgress` instantly. **Add** a 140ms
   `feedback` ease-out on the ring's `strokeDashoffset` back to empty (don't snap), and
   `Haptics.softTap()` on cancel so a slipped finger feels acknowledged, not ignored.

#### The fluid background blobs (`FluidBackground`, `:85-116`)

Two blurred color blobs drift on `15s`/`20s` infinite `easeInOut` loops (`:100, :110`),
`mix-blend-screen` (`:92). These are well above the `2000ms` floor and are the only ambient layer
AuraSignal paints over the Home stage. Keep them — but they should honor `paused`/reduced-motion:
gate the two `animate` loops behind `useReducedMotion()` (the view doesn't currently; the
`controls` and pulse rings should also freeze). This is a correctness gap, not a redesign.

---

### 6.A.4 VoiceNotes — record & playback (`views/VoiceNotes.tsx`)

Gold-dark dialect (`GoldShell`, accent `#f43f5e`, `:26, :555`). Three motion centers: the **record
orb**, the **full-screen recording stage**, and the **review sheet**.

#### Record orb (`RecordOrb`, `:105-137`)

`whileTap={{scale:0.94}}` on `GOLD_PRESS_SPRING` (`:107-108`). Around it: a soft radial halo
(`:114-117`), two counter-rotating CSS orbits (`lp-orbit` / `lp-orbit--reverse`, `:119-120`), and
two static glow rings (`:122-123`). The orbits are the "alive while idle" loop and are CSS-driven
(compositor-only). Keep. The press uses the firm Gold press spring — correct; tapping a record
button should feel like a hardware shutter, not a soft UI tap. **Haptic:** `startRecording` fires
`feedback.tap()` (`:442`). Upgrade to `Haptics.press()` (Medium) — beginning a recording is a
committed action.

#### Recording stage (`:614-748`) — frame-by-frame

Portaled overlay, dark `lp-stage` aurora (`:622-632`). The entrance is a plain scrim fade
(`opacity 0→1`, `:619-621`) — keep it cheap; the *content* is what staggers in:

| t (ms) | Element | Motion | Source |
|---|---|---|---|
| 0 | overlay scrim | `opacity 0→1` | `:619` |
| 0–∞ | 3 pulse rings | `scale:[1,1.15,1], opacity:[0.4,0.15,0.4]`, `duration:3+ring*0.5s`, `delay:ring*0.6` | `:636-648` (loops ≥3000ms ✓) |
| 80 | "Recording" chip | `{opacity:0,y:14}`→`0` `GOLD_SOFT_SPRING delay:0.08` | `:653-657` |
| 80 | red status dot | `scale:[1,1.4,1]`, `duration:1.2 repeat` | `:659-664` |
| 120 | elapsed timer | `{opacity:0,y:12}`→`0` `GOLD_SOFT_SPRING delay:0.12` | `:671-675` |
| 200 | live waveform | container `opacity:0→1 delay:0.2`; each bar `scaleY` springs `{400,25}` to live amplitude | `:682-704` |
| 150 | Stop button | `scale:0→1` `{spring,400,22,delay:0.15}`; pulsing ring `scale:[1,1.22,1]` `1.7s` | `:707-732` |
| 300 | "Tap to stop" | `opacity 0→1 delay:0.3` | `:734-742` |

The live waveform (`:690-702`) springs each bar's `scaleY` to real FFT amplitude
(`drawWaveform`, `:387-396`) on `{type:'spring', stiffness:400, damping:25}`. This is the right
call — a spring per bar gives the waveform body weight instead of a twitchy linear follow. **Note**
`transformOrigin:'center'` (`:695`) means bars grow from the centerline — keep, it's the
oscilloscope read. All amplitude motion is `scaleY` (transform-only) ✓. Reduced-motion correctly
freezes the pulse rings and status dot (`reducedMotion ? undefined`, `:645, :660, :708`).

#### Review sheet (`:751-874`)

Same portal+pan pattern as `ComposeSheet`. Sheet rises `y:'104%'→0` on `GOLD_SOFT_SPRING`
(`:762-766`), pan-to-dismiss `offset.y>130 || velocity.y>700` (`:545`). **Consistency fix:** this
sheet uses `GOLD_SOFT_SPRING` for its rise while `ComposeSheet` uses the more-damped
`SHEET_SPRING {400,41,1}`. They should be identical. Promote `SHEET_SPRING` to a shared export in
`GoldKit.tsx` and use it for *both* sheets — a sheet that rises with `damping:32` (soft spring)
has a faint overshoot at the top that `damping:41` removes. Low-risk, high-polish.

#### Playback (`VoiceNoteCard`, `:141-282`)

The jewel waveform (`JewelWaveform`, `:66-101`) reveals a gold progress sweep via
`clipPath: inset(0 ${(1-progress)*100}% 0 0)` (`:86`). **This is the correct way to animate a
progress fill** — `clip-path inset` does not distort the rounded bar caps the way `scaleX` would
(see the explicit progress-bar warning in §6.B.1). Keep it; make it the reference pattern.

Card mount: `layout` + `{opacity:0,y:20}`→`0`, `{spring,500,32, delay:index*0.04}` (`:194-199`);
delete exit `{opacity:0, x:-80}` (`:198`) — a leftward swipe-off that reads as "discarded." Playing
state cross-fades border/shadow over `0.3s ease` (`:208`) and blooms a rose radial (`:211-216`).
All good. One add: when playback **starts**, pulse the play button `scale:[1,1.12,1]` (`micro`,
`springSnappy`) so the tap-to-play has a confirmation beat beyond the icon swap. `feedback.tap()`
already at `:183`.

#### Delete (`:253-262, :496-500`)

`whileTap={{scale:0.82}}` (deep press) + the card's `exit x:-80` slide. **Add** `Haptics.warning()`
(`services/haptics.ts:93`) on delete — a destructive action deserves the distinct warning pattern,
not a plain tap. (Mirror the `Us` undo-toast model in §6.B if you want a softer path.)

---

## 6.B RELATIONSHIP PROFILE — the `Us` tab + `Profile.tsx`

Warm-light dialect throughout. These render over the Home stage and must stay transparent.

### 6.B.1 The `Us` tab (`views/Us.tsx`)

#### Shared-spaces grid entrance (`:218-260`)

Three cards stagger in `{opacity:0, y:14, scale:0.96}` → `1` on
`{type:'spring', stiffness:340, damping:24, delay: i*0.05}` (`:221-223`). Migrate the literal spring
to `springSnappy {460,34,0.7}`? **No** — `{340,24}` is closer to `springGentle/springSmooth` and
these are *large soft surfaces*. Standardize on `springSmooth {260,30,0.9}` (`motion.ts:32`) with
the `delay:i*0.05` stagger so the grid matches every other card grid in the warm app. The
`whileTap={{scale:0.96}}` press (`:224`) is fine; it should ride `springSnappy`.

#### Tab switching (`:357-681`)

The three tabs (`bucket | wishlist | milestones`) swap under `<AnimatePresence mode="wait">` with
`{opacity:0, y:14}`→`{opacity:1, y:0}`, exit `{opacity:0, y:-10}`, `duration:0.18` (`:361`). This
is `tab`-class motion (240ms ladder; 180ms here is acceptable for a content panel). Keep `mode="wait"`.
**The pink pill tab control** (`:321-353`) currently has no shared-element indicator — the active
background is a per-button conditional gradient. **Upgrade:** give the active tab a
`layoutId="us-tab-pill"` `motion.div` (like `Premium`'s `lp-plan-ring`, `Premium.tsx:864-872`) so
the pink pill **slides** between tabs on `springSnappy` instead of hard-cutting. This is the
canonical Linear/Arc tab feel and the app already proves the pattern in Premium.

#### Bucket-list progress bar (`:364-375`) — the rounded-corner trap

```
<motion.div initial={{width:0}} animate={{width:`${pct}%`}}
  transition={{type:'spring', stiffness:80, damping:18}} />   // :371-372
```

It animates **`width`**, not `scaleX`. **This is correct and must stay.** The bar is
`rounded-full` (`:370`); animating `scaleX` from a left origin would stretch the right-end cap into
an ellipse mid-flight (the classic distortion). Animating measured `width` keeps both pinned caps
perfectly round. The same correct choice appears in `DuetJournal`'s `FreeMeter` (`width` tween,
`DuetJournal.tsx:114-120`) and `Profile`'s cloud-media bar (CSS `width` transition,
`Profile.tsx:916-921`). **Codify this as the app-wide rule: progress fills animate `width` (or
`clip-path inset`), never `scaleX`.** The only cost is that `width` is a layout-thread property; it
is acceptable here because these bars are short, infrequent, and not animated during scroll.
`stiffness:80, damping:18` gives a slow, satisfying "filling up" — keep for the bucket meter
specifically (it's a celebration of progress, slowness is the point).

#### List item add/remove (`:420-477, :553-575`)

Items enter `{opacity:0, scale:0.9}`→`1` with `delay:i*0.04` and exit `{opacity:0, scale:0.85}`
under `<AnimatePresence>` (`:424-426`). Deletes route through an **undo toast** (`:90-107`,
`toast.showUndo`) with a *deferred commit* — the item hides optimistically and only really deletes
on toast expiry. The motion must respect this: the item should animate out on `markPendingDelete`
(scale-fade, ~200ms) and, on `onUndo`, animate **back in** with the same enter variant. Today the
re-appear is implicit via re-render; make it explicit so undo feels like the item *returns* rather
than blinks. Pair the delete tap with `Haptics.softTap()` and the undo with `Haptics.select()`.

#### Completed-section accordion (`:454-475`)

This one animates `height:0 → 'auto'` (`:456`). `height:auto` springs are the one place Android
WebView reliably jank. Acceptable here because it's a rare, user-initiated toggle and not in a
scroll path — but cap it: use a **tween** `{duration:0.24, ease: EASE_SOFT}` rather than a spring on
the height, and let the inner grid carry the life via its own item stagger. Opacity + height only.

#### Milestones horizontal rail (`:651-677`)

Cards enter `{opacity:0, x:20}`→`0` with `delay:i*0.06` (`:655-657`) inside a native horizontal
scroller (`data-lenis-prevent`, `:652`). Keep. **Add** the perceived-depth cue from the canonical
system: as the rail scrolls, nothing parallaxes today — a tasteful touch is a CSS
`scroll-snap-type: x proximity` so cards settle, plus letting each card's emoji
(`text-4xl`, `:664`) do a tiny `scale` on snap. Optional; the entrance is already good.

#### Pulse CTA (`:265-303`)

The full-width rose gradient button into AuraSignal enters `{opacity:0,y:12}`→`0`
`{spring,300,24,delay:0.24}` (`:268-270`), `whileTap scale:0.98` (`:271`). It's the loudest element
in `Us` by design (it's the bridge to a Connection surface). Keep. Ensure its tap fires
`feedback.tap()` and that the route into `aura-signal` uses the `push` direction (it's entering a
focused task), set via the nav layer.

### 6.B.2 Statistics & growth visualization (count-ups, milestones, achievements)

`Us` and `Premium` both surface *counts written as prose*, not big number mastheads — a deliberate
taste decision the user has repeatedly enforced (no stat mastheads). Honor it: **do not add
odometer count-ups to `Us`.** Where a number *does* animate (the bucket `pct`, `:368`), it updates
instantly as text while the bar fills — the bar is the animation, the number is just a label.

For the **`Premium` "vault as a sentence"** (`Premium.tsx:451-466`) and **pillar live-lines**
(`:468-476`), the upgrade from brochure copy to real state arrives in an idle slot
(`scheduleIdleTask`, `:430`). When `live` resolves and a subline's text changes, cross-fade the
text node `{opacity:0,y:7}`→`{opacity:1,y:0}` over `micro`/180ms (the exact pattern already used for
the plan value-line, `Premium.tsx:903-915`). This makes "the page learning about you" feel
intentional rather than a flicker. **One count-up *is* allowed and luxurious:** the membership
card's `days together` (`Premium.tsx:148-150`) may odometer-roll on first reveal — but only there,
only once, because it's the hero artifact of the Gold card. Use a `springGentle`-driven
`useTransform` from 0→days over ~900ms, tabular-nums, never re-running on re-render.

### 6.B.3 `Profile.tsx` as Settings — see §6.D (toggles/rows live there).

---

## 6.C PREMIUM — the most luxurious surface in the app (`views/Premium.tsx`)

This is the showcase. It already paints its own dark `lp-backdrop lp-stage` with `StarField`,
3-blob aurora + parallax, and grain (`Premium.tsx:582-590`) — the deliberate "you've entered the
vault" world. Everything below makes it feel hand-built, not sold.

### 6.C.1 Entrance & scroll-reveal architecture (`:599, :635, :641, …`)

Every section uses `variants={riseVariants} initial="hidden" whileInView="visible"
viewport={VIEWPORT_ONCE}` (`:62-69`) — `{opacity:0, y:26, scale:0.985}`→`1` on `SOFT_SPRING
{280,32,0.9}`, revealing **as it scrolls into view, once** (`margin:'0px 0px -48px 0px'`). This is
exactly right for a long luxury page: cheap first paint, alive on scroll, never re-animating. Keep
the architecture. The aurora drifts at `-0.12×` scroll via `useAuroraParallax` (`:400, :584`,
`GoldKit.tsx:51-77`) — transform-only, rAF-throttled, reduced-motion-gated. This is the depth that
sells "premium." Do not touch it.

### 6.C.2 The holographic membership card (`MemberCard`, `:73-191`) — the hero

This is the single most luxurious object in Lior and the centerpiece of the upsell. It must feel
like a physical foil card under a light.

- **Pointer-tilt:** `rotateX/rotateY` springs `{170,18}` driven by pointer position
  (`:80-81, :94-98`), with `perspective:1100` (`:113`) and `transformStyle:preserve-3d` (`:118`).
  The `getBoundingClientRect` is cached on `pointerenter` (`:88-92`) to avoid layout thrash in the
  move handler — a real low-end-Android optimization. **Keep verbatim.**
- **Pointer-tracked glow:** `useMotionTemplate` radial that follows the cursor (`:82-84, :130`).
- **Auto sheen sweep:** `lp-holo-sheen` (`:132`) — a CSS loop, must be `≥2000ms`.

**Frame-by-frame on first reveal (just-unlocked):**

| t (ms) | Element | Motion |
|---|---|---|
| 0 | card | `riseVariants` rise (`:635`) |
| 0 | `UnlockBurst` | 18-particle radial burst if `justUnlocked` (`:636`, `:205-215`) |
| 0 | bottom badge | `AnimatePresence mode="wait"` swaps "Reserved for you" → "Gold member" `{opacity,y:8→0}` `SOFT_SPRING` (`:155-183`) |
| +0 | haptic | `feedback.celebrate()` (`handleUnlock`, `:533`) |

**Upgrade — the unlock ceremony.** Unlocking Gold is the highest-value moment in the app and today
it's a burst + toast (`:526-536`). Make it a *moment*:

1. At `handleUnlock`, before flipping `isPremium`, run a 400ms `morph`: the whole `MemberCard`
   does one slow `rotateY:[0, 8, 0]` "catch the light" tilt (driven imperatively via the existing
   springs) while the `lp-holo-sheen` does a single accelerated sweep.
2. Then the badge swap + `UnlockBurst` + `feedback.celebrate()` fire together.
3. The `isPremium` "Gold membership active" panel (`:957-983`) enters `{opacity:0, scale:0.92}`→`1`
   on `SOFT_SPRING` only when `justUnlocked` (already wired, `:959-960`) — keep, it's the
   denouement.

Total ceremony ≤1.2s (`unlockTimerRef` clears `justUnlocked` at 1400ms, `:535`). Do not exceed it.

### 6.C.3 "Tonight" spotlight (`:649-675`)

The single live, doable-now card. `lq lq--sheen lq-press`, `whileTap scale:0.98` on `PRESS_SPRING
{560,30}` (`:653-655`), with a giant ghost icon (`148px, strokeWidth:1`, `lq-ghost`, `:660`)
bleeding behind the copy. The content is chosen by real state (`spotlight` memo, `:487-509`). This
is the page's "one thing" — keep the loud press and the ghost icon; they make a single card feel
like a poster. When `live` resolves and `spotlight` changes identity, cross-fade the card content
(not the card) on `micro`.

### 6.C.4 Three-pillars catalogue (`:685-795`)

Each pillar is a `lq lq--sheen` glass panel with a 150px ghost icon (`:699`) and a column of child
rows (`:741-780`), each row `whileTap scale:0.98` on `PRESS_SPRING` (`:747-748`). The Studio pillar
embeds a **live heirloom thumbnail** rotated `5°` in a foil frame (`:704-727`), frosted when sealed
(`filter` brightness/saturate, `:716-720`). This is gorgeous restraint — the artwork sells itself.

- **Row reveal:** the pillar panel rises once (`riseVariants`), rows are static inside it. Good —
  rows revealing individually inside an already-revealed card would be over-animated. Keep static.
- **Sealed-thumb shimmer:** the frosted heirloom should get a *very slow* `lp-holo-sheen` so a
  locked strike looks like treasure under frost, reinforcing the upsell. Loop ≥3000ms.
- **Usage chips** (`:766-773`): free users see `"{n} of {limit}"`, premium sees an `InfinityIcon`.
  On unlock, cross-fade chip→infinity on `micro` so the limit visibly *dissolves* into ∞.

### 6.C.5 Free-vs-Gold comparison (`:805-834`)

Rows slide in individually `{opacity:0, x:-16}`→`0` with `viewport once` and `delay:i*0.045`
(`:817-824`). This per-row cascade as the table scrolls into view is premium-grade — keep. The
`SOFT_SPRING` per row is correct.

### 6.C.6 Plan selector (`:846-900`) — the shared-element ring

`LayoutGroup id="lp-plans"` (`:846`) + a `layoutId="lp-plan-ring"` `motion.div` border that
**slides** between the three plan cards on `{spring,420,34}` (`:864-872`). This is the canonical
Linear-grade selection morph and the reference implementation for the `Us` tab-pill upgrade
(§6.B.1). The value-line below cross-fades per selection `{opacity,y:7→0}` `duration:0.18`
`EASE_SOFT` (`:903-915`). `feedback.tap()` on each plan select (`:855`). All correct — this is the
model, not the thing to change. Consider `Haptics.select()` instead of `tap()` on plan change (it's
a picker, and `select()` is the selection-tick pattern, `services/haptics.ts:349`).

### 6.C.7 The CTA (`:929-953`)

`lp-cta` 56px button, `whileTap scale:0.97` `PRESS_SPRING` (`:930-932`), gradient
`#ff5c7c→#8b5cf6` with inner-light inset shadow (`:935-939`). The `lp-cta` class carries the
shimmer sweep. This is the "buy" moment — the press must be firm and the shimmer must read as
*precious metal catching light*, not a loading bar. Keep `PRESS_SPRING`. Fire `Haptics.success()`
the instant it's tapped (before `handleUnlock`'s celebrate) so the commitment registers under the
thumb, then the celebrate plays on the card.

### 6.C.8 Upsell that feels luxurious, not salesy — the governing rules

1. **Sell with artifacts, not badges.** The live heirloom thumb (`:704`), the holographic card
   (`:73`), the prose vault (`:451`) — these *show* the value. Never add "LIMITED TIME" pulses,
   countdown timers, or bouncing CTAs. The only repeating motion permitted on Premium is ambient
   (`lp-holo-sheen`, aurora drift, `lp-live-dot`) and all of it is `≥2000ms`.
2. **The paywall (`PremiumModal`) arrives, never ambushes.** Every gate (`GoldGate`,
   `GoldKit.tsx:271-335`) blurs its children `14px` and floats a single `lp-foil` panel up on
   `GOLD_SOFT_SPRING` (`:297-301`). Keep this — a blurred preview that says "this is yours, here"
   is aspirational, not coercive.
3. **Restraint on motion = luxury signal.** Resist the urge to animate the comparison numbers or
   the pillar promises on a timer. The page should be *still* until the user scrolls or touches.

---

## 6.D SETTINGS — making even settings feel alive (`views/Profile.tsx`)

Settings live as glass-panel groups inside `Profile.tsx` (Personal Info, Aesthetic Studio, Together
Song, Preferences, Storage & Backup, Account). Warm-light dialect. The bar: settings should feel
*responsive and considered*, never inert — but never gratuitous either.

### 6.D.1 Row & group reveals

The groups are currently static (no entrance). **Add** a restrained scroll-reveal that matches the
rest of the warm app: wrap each group section in `revealVariants` (`motion.ts:41-44`,
`{opacity:0,y:16}`→`1` on `springSmooth`) with `inViewOnce` (`motion.ts:58`) and a per-group
`staggerContainer(0.06)` so the panels *settle in* as you scroll. Keep it subtle (y:16, not 26 —
settings shouldn't feel as theatrical as Premium). Transform+opacity only; these render over the
Home stage.

### 6.D.2 Toggle switches — the hero micro-interaction (`ToggleRow`, `:492-541`)

The haptics & sound toggles are the most-touched controls in Settings and the place to invest.
Current: a 48×28 track, a 22px knob that slides `left:3 → left:23` on `transition-all duration-300`
(CSS, `:530-538`), with the icon badge cross-fading gradient on/off (`:500-511`).

**The haptic wiring is already exemplary and is the template** (`:275-289`):

```
handleToggleHaptics: Haptics.setEnabled(next);
  if (next) { Haptics.success(); Audio.play('toggleOn'); }   // :279
handleToggleAudio:
  if (next) { Haptics.toggleOn();  Audio.play('toggleOn');  } // :287
  else      { Haptics.toggleOff(); Audio.play('toggleOff'); } // :288
```

`Haptics.toggleOn()`/`toggleOff()` (`services/haptics.ts:430, :448`) are the purpose-built
Selection+Light / Light+Selection patterns (header doc `:48-49`). **Upgrade the haptics toggle to
match the audio toggle:** use `Haptics.toggleOn()/toggleOff()` instead of the current
`success()`-only path (`:279`) so both toggles share the identical, directional on/off feel.

**Upgrade the *visual* spring (the gap today):** the knob uses a CSS `duration-300` tween, which is
the one un-springy control on the screen. Convert the knob to a `motion.span` driven by
`springSnappy {460,34,0.7}` (`motion.ts:33`) animating `x: 0 → 20` (transform, not `left` — `left`
is layout-thread). The track gradient + shadow can stay on the 300ms CSS cross-fade. Frame:

| t (ms) | Knob | Track | Icon badge |
|---|---|---|---|
| 0 (tap) | spring start `x:0→20` | gradient cross-fade begins (300ms) | gradient + shadow begin (300ms, `:501`) |
| 0 | — | — | — |
| ~90 | knob ~70% across (snappy) | — | — |
| ~140 | knob settled (no overshoot) | mid cross-fade | mid |
| 300 | rest | gradient done | done |
| 0 | **haptic:** `toggleOn()/toggleOff()` fires at tap, synced to knob launch | | |

The knob landing at ~140ms while the color finishes at 300ms is *intentional* — the physical thing
(knob) responds instantly to the thumb; the cosmetic thing (color) catches up. That split is what
makes a toggle feel mechanical and satisfying (the iOS feel).

### 6.D.3 Theme picker — "Aesthetic Studio" (`:656-791`)

The theme grid is a genuine delight surface. Selected tile scales `1.06` with a white ring
(CSS `transition: transform 0.2s ease, box-shadow 0.2s`, `:731-732`); `handleThemeChange` fires
`Haptics.select()` + `Audio.play('select')` (`:271-272`) and **applies the theme with a
circular-reveal origin** at the tapped tile's center (`:264-270`, `ThemeService.applyTheme(...,
{origin})`). This origin-aware theme swap is the standout — it's the View-Transitions "ripple from
the tap point" pattern, applied to a live re-skin.

- **Keep** the `select()` haptic (correct for a picker, `:271`).
- **Upgrade the tile press** from CSS `0.2s ease` to `springSnappy` on `scale` so the selected tile
  *pops* with the same spring vocabulary as the rest of the app, while the ring/shadow stay on the
  CSS cross-fade. The active-theme **hero card** (`:662-710`) updates its gradient live; let its
  palette dots (`:695-707`) do a one-shot `springSnappy` `scale:[0.8,1]` stagger when the active
  theme changes, so the hero visibly "re-paints" to the new theme. This makes choosing a theme feel
  like the app *becoming* that theme.

### 6.D.4 Save button (`:550-562`) & Together-Song card (`:793-855`)

- **Save:** spinner via `<Save className="animate-spin">` on `isSaving` (`:560`), then
  `setView('home')` after 600ms (`:387-390`). `Haptics.success()` + `Audio.play('confirm')` fire on
  tap (`:384-385`). Keep. The 600ms hold lets the success haptic land before the route runs — good
  sequencing. Ensure the exit uses `pop`/`tab` direction (returning home), not `push`.
- **Together Song:** the empty→filled state should cross-fade (`AnimatePresence mode="wait"`,
  `micro`) between the dashed-upload affordance (`:828-845`) and the album-icon row (`:806-827`) so
  adding a song feels like the card *receiving* it. On successful upload, a one-shot
  `Haptics.success()` and a `scale:[1,1.03,1]` bloom on the new album icon.

### 6.D.5 Storage bar & identity modal

- **Cloud-media bar** (`:915-921`): CSS `width` transition `0.5s ease` — correct (`width`, not
  `scaleX`; rounded caps preserved; matches §6.B.1 rule). Keep.
- **Identity modal** (`:1014-1058`): a bottom sheet with a handle bar but **no entrance animation
  today** — it just appears. Convert to the canonical sheet: scrim `opacity 0→1`, panel
  `y:'100%'→0` on `springGentle {170,26,1}` (large soft surface, `motion.ts:34`), exit `y:'100%'`
  on `EASE_EXIT`. It's a rare modal, so it can afford the gentle, weighty rise. `ConfirmModal`
  (`:1060`) should share the same sheet motion for consistency.

---

## 6.E Cross-cutting checklist (build-from rules for this section)

1. **Dialect by surface, not taste.** Warm surfaces → `motion.ts` springs + `--lior-ease-*`. Gold
   wing (`Premium`, `DuetJournal`, `VoiceNotes`) → `GoldKit` springs. Never mix within a surface.
2. **Progress fills: `width` or `clip-path inset` — never `scaleX`.** Confirmed correct in
   `Us:371`, `DuetJournal FreeMeter:114`, `VoiceNotes JewelWaveform:86`, `Profile:916`. Make it a
   lint-level norm.
3. **Loops ≥2000ms.** All ambient/pulse/sheen here already comply (`AuraSignal` blobs 15–20s,
   `VoiceNotes` rings 3s+, pulse orbs 2s). Anything new that repeats obeys the floor.
4. **Transform + opacity only** on every surface that renders over the Home stage; the Gold wing
   may paint its own `lp-stage` (intentional cover), but its *foreground* motion is still
   transform/opacity (verified across `DuetJournal`/`VoiceNotes`/`Premium`).
5. **Haptics on explicit product actions, mapped to the rich ladder.** Key upgrades flagged:
   `AuraSignal` charge → `longPressProgress(n)`; aura send/receive → `doubleBeat()`; one duet pen →
   `press()`, both pens → `celebrate()`; record start → `press()`; voice delete → `warning()`;
   toggles → `toggleOn()/toggleOff()`; plan/theme pick → `select()`. All exist in
   `services/haptics.ts`.
6. **Reduced motion.** `<MotionConfig reducedMotion="user">` covers framer globally; the explicit
   `useReducedMotion()` branches in `DuetJournal` (`:526`), `VoiceNotes` (`:645` etc.), and
   `WaxSeal` (`:76`) are the model. **Gap to fix:** `AuraSignal` does not gate its `controls`
   dissolve, pulse rings, or fluid blobs behind reduced-motion — add it.
7. **Sequence sheets and stamps; never overlap.** ComposeSheet exit (300ms) must precede the
   AnswerSlot stamp (`delay:0.12`); the unlock ceremony stays ≤1.2s (`unlockTimerRef` 1400ms cap).
8. **Promote `SHEET_SPRING` to `GoldKit`** and use it for both `ComposeSheet` (`:26`) and the
   `VoiceNotes` review sheet (currently `GOLD_SOFT_SPRING`, `:766`) for one bottom-sheet feel.
## 7. Delight Moments, Gestures & Haptic Synchronization

> **Scope.** This section specifies Phases 8 (Delight Moments), 9 (Gestures), and 10
> (Haptic + Motion Synchronization). It is grounded entirely in the shipped Lior
> codebase: `utils/gesture.ts`, `services/haptics.ts`, `utils/feedback.ts`,
> `utils/motion.ts`, `components/PhysicsConfetti.tsx`, `components/PullToRefresh.tsx`,
> `utils/TransitionEngine.ts`, `components/AmbientVisuals.tsx`, and `styles/root-fixes.css`.
> Where a beat references a duration or curve, it uses the **canonical tokens** verbatim
> (`--lior-motion-*`, `--lior-ease-*`, `springSmooth/Snappy/Gentle`). Any new value is
> flagged inline as `⚠ NEW`.

---

### 7.0 The Layer Contract (read this first)

Lior renders in a fixed z-order. Delight moments are **Layer 6 — Celebrations**, and
they obey one inviolable rule: **the fixed background stage quiets while a celebration
plays, and the celebration never competes with it.**

| Layer | What lives there | Real anchor (z-index) |
|------|------------------|------------------------|
| 0 — Stage | `AmbientVisuals` (LiveBackground wash, R3F LiveBackground3D + FloatingHeartsScene) | `z-[1]` (`FloatingHeartsScene.tsx:580`, `ConstellationCanvas.tsx:340`) |
| 1 — Content | Home masthead, bento tiles, view content | default flow |
| 2 — Sticky chrome | `BottomNav` pill + FAB | `z-[60]` (`BottomNav.tsx:160`) |
| 3 — Route surfaces | View-Transition / clone surfaces | engine-managed |
| 4 — Sheets/modals | ActionSheet, ConfirmModal, sheets | `z-[140]`–`z-[200]` |
| 5 — Toasts | `DynamicToast` | `z-[100]` (`DynamicToast.tsx:41`) |
| **6 — Celebrations** | **`PhysicsConfetti`**, full-screen aura takeover, milestone bloom | **`z-[55]`** confetti (`PhysicsConfetti.tsx:234`), **`z-[9999]`** aura (`App.tsx:1167`) |

**The quieting mechanism already exists — reuse it, never reinvent.**
`AmbientVisuals` pauses itself whenever any of `data-ambient-motion-paused`,
`data-transitioning`, or `data-tab-transitioning` is set on `<html>`
(`AmbientVisuals.tsx:24`, `:106`–`:109`). `effectivePaused` propagates this to the R3F
layers (`AmbientVisuals.tsx:158`, `:225`, `:229`).

> **Celebration layer contract (binding for every Phase-8 sequence below):**
> 1. **Quiet the stage.** On celebration start, set
>    `document.documentElement.dataset.ambientMotionPaused = '1'`. This pauses the wash,
>    sheen, hearts, and 3D bg so confetti/bloom owns the frame. Clear it on celebration end.
> 2. **Borrow the GPU.** `PhysicsConfetti` registers in `AnimationEngine` at
>    `priority: 5, budgetMs: 3, minTier: 'medium'` (`PhysicsConfetti.tsx:164`–`:169`) — it is
>    already skipped on `low`/`css-only` tiers and during `data-transitioning`.
> 3. **Never fire a celebration mid-route.** Gate every trigger on
>    `!document.documentElement.dataset.transitioning`. Confetti during a push reads as jank.
> 4. **One celebration at a time.** A celebration in flight suppresses lower-tier haptics via
>    the `Haptics` debounce/sequence cooldowns (`haptics.ts:191`–`:206`).
> 5. **Honour reduced-motion.** Under `prefers-reduced-motion: reduce`, confetti is suppressed
>    entirely and the moment is carried by **opacity + a single haptic** only (see §7.1.9).

---

## PHASE 8 — DELIGHT MOMENTS (frame-by-frame)

Each sequence below is a timeline of **beats**. Every beat names: `t` (ms from trigger),
the **layer**, the **visual** (with token), and the **haptic** (with the exact
`services/haptics.ts` method). Beats are authored so the **haptic peak lands on the
visual peak** — that synchronization is the entire craft (see Phase 10).

Shared infrastructure these sequences assume:
- A single app-level `<PhysicsConfetti ref={confettiRef} />` mounted once near the root
  (sibling of `AuraSignalReceiver` in `App.tsx`). Call `confettiRef.current.trigger(x, y)`
  to burst 220 particles from `(x, y)` (`PhysicsConfetti.tsx:138`–`:145`,`:81`–`:108`).
  ⚠ **Gap to close:** the component exists but is **not yet mounted/wired** in `App.tsx`
  (no `confettiRef` reference found). Phase 8 requires mounting it.
- `Haptics.celebrate()` = escalating 4-beat over 148 ms (`haptics.ts:514`–`:529`).
- `Haptics.doubleBeat()` = lub-dub → 520 ms breath → lub-dub (`haptics.ts:493`–`:506`).
- `Haptics.heartbeat()` = Light → 120 ms → Medium (`haptics.ts:477`–`:486`).

---

### 7.1.1 First Couple Connection — "two become one"

**The single most important magical moment in the app.** Two users pair; the app must
feel like two signals finding each other. Uses `doubleBeat` per the brief. Triggered the
instant pairing succeeds (the partner's `myName`/`partnerName` reconcile).

**Pre-roll (the search):** while pairing resolves, a single warm dot pulses center-screen
using `springGentle` scale `0.9↔1.0` on a ≥2000 ms ambient loop (so it never competes —
brief rule). No haptic yet.

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 6 | **Quiet the stage:** set `ambientMotionPaused='1'`. Two dots (you = warm rose, partner = accent) sit at left/right thirds, opacity 1. | — |
| 0 → 420 | 6 | Both dots travel toward center, `transform: translate3d()` on `--lior-ease-silk`, `420ms` (just over `--lior-motion-morph`). Slight scale-up `1 → 1.15`. | `Haptics.heartbeat()` at t=0 — Light(0)→Medium(120) as they approach |
| 420 | 6 | **Contact.** Dots meet; a single `--lior-motion-feedback` (140 ms) `springSnappy` scale-pop `1.15 → 1.0` merges them into one heart glyph. | `Haptics.doubleBeat()` fires — lub-dub, 520 ms breath, lub-dub (`haptics.ts:493`) |
| 460 | 6 | `confettiRef.current.trigger(cx, cy)` from the merge point — 220 particles, theme-tinted (`syncConfettiPalette`, `PhysicsConfetti.tsx:67`). | (covered by doubleBeat tail) |
| 700 | 5 | `DynamicToast` rises from top, "You're connected 💞", `--lior-motion-pop` (260 ms) silk. | — |
| 1600 | 6 | Confetti naturally decays (life decay `0.00018·delta`, `PhysicsConfetti.tsx:193`); particles float off via buoyancy. | — |
| 2200 | 6 | **Unquiet the stage:** clear `ambientMotionPaused`. Ambient hearts resume and "adopt" the merged heart — a handoff from celebration to stage. | — |

**Why doubleBeat here:** two cardiac cycles literally encode *two hearts, now in rhythm*.
It is the only place in the app that uses `doubleBeat` for a deliberate event (vs.
`App.tsx:1134` which uses it for an *incoming* aura). That exclusivity makes it feel sacred.

---

### 7.1.2 Anniversary Celebration

Fired on app open when `today === anniversary` (Countdowns/SpecialDates). This is the
**grandest** confetti moment — full theatrical bloom, longest duration.

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 6 | Quiet stage. A soft radial **golden** flash (opacity `0 → 0.4 → 0`, 600 ms, `--lior-ease-silk`) blooms from center. | `Haptics.celebrate()` — Light(0)→Light(55)→Light(105)→Medium(148) (`haptics.ts:517`) |
| 120 | 6 | `confettiRef.current.trigger()` (center default). Hearts/stars/petals explode (`SHAPES`, `PhysicsConfetti.tsx:79`). | (celebrate tail) |
| 300 | 1 | Anniversary card scales in from `0.92 → 1.0`, `springGentle` (large soft surface), with the years-count number animating via a count-up over 800 ms. | — |
| 1100 | 1 | Count-up settles on the final number; `--lior-motion-feedback` scale-tick `1.0 → 1.04 → 1.0`. | `Haptics.success()` (rising two-pulse, `haptics.ts:394`) |
| ~3000 | 6 | Confetti fully decayed; **unquiet stage**. | — |

**Replay affordance:** a small "🎉 Replay" ghost button (`Haptics.softTap()` on press) lets
the couple re-trigger `confettiRef.current.trigger()` — anniversaries should be re-livable.

---

### 7.1.3 Daily-Question Completion Reward Loop

The retention-critical ritual. `DailyQuestion.tsx` already renders the **reveal** when
`bothAnswered` (`DailyQuestion.tsx:93`–`:106`) via an `AnimatePresence mode="wait"` swap.
Today the reveal is a plain `opacity/y` fade. Phase 8 upgrades it into a **two-part reward
loop**: (A) *you answer* → quiet anticipation; (B) *partner answers* → the reveal payoff.

**Part A — You submit your answer (partner pending):**

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 1 | Submit button `spring-press` down (`--lior-motion-press` 90 ms). | `Haptics.success()` on submit (save semantic, `haptics.ts:394`) |
| 90 | 1 | Answer card collapses into the "waiting" pill (`DailyQuestion.tsx:108`–`:117`), `--lior-motion-pop` silk. The orange status dot (`#fb923c`) begins a ≥2000 ms breathing pulse `opacity 0.5↔1` (`springGentle`). | — |

No confetti in Part A — the payoff is *deferred* on purpose. The breathing dot is the
"loading love" state.

**Part B — Partner answers; both now answered (the reveal):**

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 1 | Quiet stage briefly (`ambientMotionPaused` for 1200 ms only). | `Haptics.heartbeat()` — Light→Medium, "their answer arrived" |
| 0 → 240 | 1 | The "waiting" pill cross-fades out; **your** `AnswerBubble` enters first: `opacity 0→1, y 8→0`, `springSmooth` (`motion.ts:32`, matching `revealVariants`). | — |
| 240 → 480 | 1 | **Partner's** `AnswerBubble` enters second, staggered by `0.06s` (`staggerItem`, `motion.ts:52`). A 1 px hairline draws between them L→R over 300 ms (`scaleX 0→1`, `transform-origin:left`). | `Haptics.select()` as the partner bubble lands (a fine "tick" of connection) |
| 520 | 6 | **Small** celebratory burst — `confettiRef.current.trigger(cardCenterX, cardCenterY)` but at **reduced count** (see ⚠ NEW below) so it's intimate, not a full anniversary blast. | `Haptics.celebrate()` (escalating 4-beat) |
| 1200 | 6 | Unquiet stage. | — |

⚠ **NEW (behavioral param, not a token):** `PhysicsConfetti.trigger()` hardcodes
`explode(cx, cy, 220)` (`PhysicsConfetti.tsx:143`). Add an optional `count` arg so daily-question
uses `~70` particles. Suggested signature: `trigger(x?, y?, count = 220)`.

**Streak sub-beat:** if this completion extends a streak, after the reveal settles (t≈1300)
flash a streak chip with `Haptics.milestone()` (gentle tap-tap-tap, `haptics.ts:307`).

---

### 7.1.4 First Memory Added — "the first stone"

The very first memory a couple saves. A one-time, never-repeated moment.

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 4 | AddMemory save button `spring-press` (90 ms). Sheet begins `modal-close` exit (`--lior-motion-pop`). | `Haptics.success()` (save) |
| 200 | 1 | New memory card lands in the Timeline via **`expand` direction** semantics — but inverted: it scales in `0.85 → 1.0` from where the sheet was, `--lior-motion-morph` (400 ms) `--lior-ease-silk`, with a one-time **shimmer sweep** (linear-gradient highlight translating L→R, 600 ms). | — |
| 600 | 6 | A *gentle* upward drift of ~40 petals only (not the full burst) from the card — quiet, not loud. `confettiRef.current.trigger(cardX, cardY, 40)`. | `Haptics.celebrate()` |
| 700 | 5 | Toast: "Your first memory together 🌱" `--lior-motion-pop`. | — |

**Distinction from ordinary memory-add:** ordinary adds get only the `expand`/shimmer + a
single `Haptics.success()` — *no confetti*. Confetti on every add would cheapen it (memory
rule: "never mass-rewrite, change feeling not features"). First-add is special precisely
because it's the only one with petals.

---

### 7.1.5 Relationship Milestones (Us tab / BonsaiBloom / streaks)

Milestones (`views/Us.tsx`, `BonsaiBloom.tsx`) are **quieter, earned** moments — growth,
not fireworks. They use `Haptics.milestone()` and `Haptics.celebrate()`, never `doubleBeat`
(reserved for connection).

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 1 | Milestone tile lifts (`tile-open-lifting` → `scale 1.035` + shadow, `index.css` `tile-lift`). | `Haptics.milestone()` (Light·Light·Light, `haptics.ts:307`) |
| 0 → 400 | 1 | The stat number count-ups; `BonsaiBloom` grows a new branch via `springGentle` (large soft surface). | — |
| 400 | 1 | New milestone badge "pops" in: `springSnappy` scale `0 → 1.0`, slight rotate `-8° → 0°`. | `Haptics.success()` at the pop apex |
| 450 | 6 | **Only for major milestones** (e.g. 1-year, 100 memories): `confettiRef.current.trigger(badgeX, badgeY, 120)`. Minor milestones get no confetti. | `Haptics.celebrate()` for majors only |

**Tiering rule:** minor milestone = `milestone()` + scale-pop, no confetti. Major milestone =
`celebrate()` + 120-particle burst. This prevents milestone fatigue.

---

### 7.1.6 Premium Purchase — "Welcome to Gold"

Already partially wired: `Premium.tsx` `handleUnlock` calls `feedback.celebrate()` (which is
`Haptics.success()` + a two-tone chime, `feedback.ts:164`) and sets `justUnlocked` for 1400 ms
(`Premium.tsx:526`–`:536`). Phase 8 elevates it to a true Layer-6 luxury moment.

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 1 | Unlock CTA `spring-press` (90 ms). | `feedback.celebrate()` → `Haptics.success()` + chime (`feedback.ts:140`,`:164`) |
| 0 | 6 | Quiet stage. A **gold** radial wash blooms `opacity 0 → 0.5 → 0`, 700 ms `--lior-ease-silk` (warmer, slower than confetti flash — luxury reads as *unhurried*). | — |
| 150 | 6 | `confettiRef.current.trigger()` but with the **gold heirloom palette** — confetti palette already syncs from theme tokens (`PhysicsConfetti.tsx:67`–`:78`); for Gold, temporarily push gold triplets before trigger. | `Haptics.celebrate()` (escalating) |
| 300 → 1100 | 1 | The Gold crown/seal does a slow `springGentle` scale-in `0.8 → 1.0` with a rotating specular highlight (compositor-only `transform: rotate` on a masked gradient). | — |
| 1100 | 1 | Seal settles; `--lior-motion-feedback` tick. | `Haptics.success()` (the "it's done" confirm) |
| 1400 | 6 | `justUnlocked` clears; unquiet stage. | — |

**Restraint note:** the brief warns the user rejected "dark/glassy/dense" 3× — Premium must
read as **warm gold light, not casino**. The gold wash is *soft and brief*; no looping
shimmer, no dense particle storms. One bloom, one settle.

---

### 7.1.7 Returning-After-Many-Days Welcome-Back

When the app opens after an absence (e.g. ≥3 days since `lastOpenedAt`). This is **tender,
not celebratory** — the emotional register is "we missed you", carried mostly by the
ambient stage warming up rather than confetti.

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 0 | Stage is *softly dimmed* (it boots paused via `data-transitioning` during launch). | — |
| 0 → 800 | 0 | Stage **warms in**: ambient wash opacity `0.4 → 1.0` over 800 ms `--lior-ease-silk` as `data-transitioning` clears (`AmbientVisuals` resumes naturally). The hearts drift back. | `Haptics.heartbeat()` once at t=200 — a single quiet "still here" pulse |
| 600 | 1 | A centered line fades up (`opacity 0→1, y 12→0`, `springSmooth`): "Welcome back — it's been {n} days." | — |
| 1200 | 1 | Below it, a single memory thumbnail (the couple's most-loved) gently scales `0.95 → 1.0` (`springGentle`) — a *callback*, inviting re-entry. | `Haptics.softTap()` as it settles |

**No confetti.** Confetti on return would feel like a party for someone who *left*. The
warmth comes from the **stage itself coming back to life** — which is exactly the brief's
"stage is the performance" philosophy. Tap the thumbnail → `expand` route into that memory.

---

### 7.1.8 Aura Signal / Pulse Send & Receive (real comms surface)

The connection blueprint maps to real surfaces. **Pulse send** (`AuraSignal.tsx fireSignal`,
`:156`–`:172`) already calls `feedback.celebrate()`. **Pulse receive** (`App.tsx
AuraSignalReceiver`, `:1130`–`:1147`) already fires `Haptics.doubleBeat()` + `Audio('heartbeat')`
and takes over full-screen at `z-[9999]` with a 6 s auto-dismiss.

**Send sequence:**

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 1 | Hold-to-send charge ring fills (`AuraSignal` `holdProgress`); ring stroke advances. | `Haptics.longPressProgress(n)` crossing 0.33/0.66 (`haptics.ts:541`) |
| ~380 | 1 | Charge completes; signal launches — the chosen-color `FluidBackground` pulses out. | `feedback.celebrate()` (`AuraSignal.tsx:165`) |
| 2500 | 3 | Auto-returns to Home via `pop` (`AuraSignal.tsx:170`). | — |

**Receive sequence (the magic):**

| t (ms) | Layer | Visual | Haptic |
|-------:|-------|--------|--------|
| 0 | 6 | Full-screen aura overlay fades in at `z-[9999]`, backdrop-blur, liquid bg scales `1→1.2→1` on a 4 s ambient loop (`App.tsx:1171`–`:1174`). | `Haptics.doubleBeat()` (`App.tsx:1134`) — *the* signature receive feel |
| 0 | — | `Audio.play('heartbeat')` synced to the doubleBeat (`App.tsx:1135`). | (paired audio) |
| ~6000 | 6 | Auto-dismiss, `exit={{opacity:0, scale:1.1}}` (`App.tsx:1165`). | — |

This is the one place `doubleBeat` is *received* rather than *initiated* — the symmetry with
First-Couple-Connection (§7.1.1) is intentional: the same heartbeat that bonded you is the
one that reaches across distance.

---

### 7.1.9 Reduced-Motion variants for ALL Phase-8 sequences

Under `prefers-reduced-motion: reduce` (honoured globally via `<MotionConfig reducedMotion="user">`
and `prefersReducedMotion()`, `motion.ts:61`):

- **No `PhysicsConfetti`** — skip every `trigger()` call. (The canvas physics is pure motion.)
- **No scale/translate bloom** — replace with **opacity-only** cross-fades at the same token
  durations.
- **Keep exactly one haptic** per moment (the "peak" haptic): connection → `doubleBeat`;
  anniversary/daily/premium/major-milestone → `celebrate`; first-memory → `success`;
  welcome-back → `heartbeat`. Haptics are *not* motion and remain a valid accessible signal.
- **Stage quieting still applies** (it's an opacity/pause, not motion).
- **Never** add a blanket `* { animation: none }` — it breaks `tests/motionExperience.assert.mjs`,
  which asserts the `lior-vt-*` / `keep-alive*` / `lior-motion*` keyframes still exist and remain
  transform+opacity-only.

---

## PHASE 9 — GESTURES (physics, resistance, thresholds, snap, paired haptics)

All gestures are grounded in `utils/gesture.ts`. The shared spring engine is a single RAF
loop integrating semi-implicit Euler at 60–120 fps (`gesture.ts:61`–`:85`), with presets
`SPRING_PRESETS` (`gesture.ts:39`–`:52`). The two spring vocabularies coexist deliberately:
`gesture.ts` springs drive **direct-DOM** gestures (no React reconcile per frame);
`motion.ts` springs (`springSmooth/Snappy/Gentle`) drive **framer-motion** component animations.

### 7.2.1 Press / Tap — `attachPress` (`gesture.ts:168`)

- **Physics:** `SPRING_PRESETS.button` `{stiffness:600, damping:32, mass:0.7}` — snappy, no
  overshoot.
- **Down:** synchronous write `scale → 0.97`, `opacity → 0.88` in the same task as the
  pointer event (`gesture.ts:192`–`:196`) — guaranteed `<16 ms` feedback. This is the
  global press primitive (also the `[data-press]` delegated path, `gesture.ts:848`–`:859`,
  and the `.spring-press` CSS class).
- **Up:** spring back to `1.0` (`gesture.ts:201`–`:203`).
- **Snap values:** `pressScale 0.97`, `pressOpacity 0.88` (defaults; `gesture.ts:169`–`:170`).
- **Haptic pairing:** **none on the raw press** by default — visual press is global,
  haptics are explicit (see Phase 10 rule). The *action* the press triggers carries the
  haptic (`tap`/`press`/`heavy` per semantics).

### 7.2.2 Drag — `attachDrag` (`gesture.ts:241`)

- **Physics:** `SPRING_PRESETS.drag` `{stiffness:200, damping:22, mass:1}` — physical lag.
- **Pickup:** `scale → 1.05`, shadow `0 24px 48px rgba(0,0,0,0.18)` (`gesture.ts:259`–`:263`).
- **During drag:** finger position is truth — `sx.snap(tx)` directly, **no spring lag while
  held** (`gesture.ts:307`–`:312`). Velocity tracked in px/ms (`gesture.ts:298`–`:301`).
- **Release (the throw):** momentum look-ahead — target = `cur + v·80ms`; inject velocity
  then spring to target: `sx.flick(vx*1000).to(targetX)` (`gesture.ts:324`–`:336`). Feels
  like a real toss that settles.
- **Bounds:** optional clamp box (`gesture.ts:328`–`:332`).
- **Haptic pairing:** `Haptics.dragPickup()` (Light) on `onStart`; `Haptics.dragDrop()`
  (Light) on settle (`haptics.ts:284`,`:295`). Used by OurRoom item drag.

### 7.2.3 Swipe — `attachSwipe` (`gesture.ts:378`)

- **Velocity threshold:** commit if `|velocity| > 0.4 px/ms` **OR** `|offset| > 80 px`
  (`gesture.ts:379`–`:380`,`:452`).
- **Axis lock:** first 10 px decides swipe-vs-scroll; if perpendicular dominates by `1.5×`,
  release to native scroll (`gesture.ts:421`–`:426`).
- **Rubber-band (no handler for that direction):** resistance curve
  `offset = primary·0.22·(1 − min(|primary|/380, 0.82))` (`gesture.ts:439`–`:441`) — the
  surface gives, but resists, telling the user "nothing here."
- **Commit animation:** content flies off to `±innerWidth·1.1` then snaps back to 0 and
  invokes the handler after `260 ms` (`gesture.ts:454`–`:467`) — matches `--lior-motion-pop`.
- **Haptic pairing:** `Haptics.tap()` (Light) on a committed swipe; `Haptics.softTap()` if it
  snaps back (cancelled), so the body distinguishes "sent" from "nope."

### 7.2.4 Pull-to-Refresh — `components/PullToRefresh.tsx`

- **Resistance:** `resistance = delta · 0.4` (`PullToRefresh.tsx:64`), clamped to `maxPull 120`.
- **Threshold:** `80 px` (`PullToRefresh.tsx:28`).
- **During pull:** direct `style.height` write with `transition:none` (`PullToRefresh.tsx:47`)
  — compositor-only, no React reconcile per frame.
- **Snap on release:** `height 220ms cubic-bezier(0.22, 1, 0.36, 1)` — i.e. **`--lior-ease-soft`**
  at a 220 ms duration (`PullToRefresh.tsx:47`). Holds at `50 px` while refreshing
  (`PullToRefresh.tsx:87`).
- **Indicator:** heart `liorPtrSpin 1s linear` + `liorPtrPulse 1s` while refreshing
  (`PullToRefresh.tsx:128`–`:137`), fills on completion.
- **Haptic pairing (rising-edge only):** `feedback.light()` exactly when crossing the
  threshold up (`PullToRefresh.tsx:70`–`:72`); `feedback.tap()` on release-into-refresh
  (`:88`); `feedback.success()` when the refresh resolves (`:96`). Three distinct beats =
  "armed / committed / done."

### 7.2.5 Long-Press — `attachLongPress` (`gesture.ts:1016`)

- **Threshold:** `380 ms` hold (iOS standard, `gesture.ts:1017`).
- **Cancel:** pointer move `> 8 px` aborts (`gesture.ts:1018`,`:1093`).
- **Visual:** a 48 px SVG progress ring fills clockwise (`stroke-dashoffset`), centered, fades
  in over `0.12s` (`gesture.ts:980`–`:990`). Element scales `1.0 → 0.97` across the hold
  (`gesture.ts:1046`).
- **Haptic escalation (each fires once):** 33% → `Haptics.tap()` (Light); 66% →
  `Haptics.press()` (Medium); 100% → `Haptics.heavy()` (Heavy) (`gesture.ts:1049`–`:1050`,`:1055`).
  This is the canonical *charging* feel — the haptic ladder *is* the progress bar for the finger.
- **Cancel-back:** snap `scale → 1.0` on a critically-damped silk settle (`--lior-ease-silk`,
  `gesture.ts:1073`). NOTE: this site shipped with a `cubic-bezier(0.34,1.56,0.64,1)` overshoot —
  a leftover the de-bounce sweep missed; it has been retoken to silk so the cancel reads as a calm
  "released," consistent with the no-bounce law (§1 principle 2). There is **no overshoot anywhere
  in the system** — the only sanctioned spring "life" is the ~0.3% whisper on `.spring-press` release.

### 7.2.6 Pinch — `attachPinch` (`gesture.ts:585`)

- **Range:** `minScale 0.5`, `maxScale 4` (`gesture.ts:586`–`:587`).
- **Live:** `scale = baseScale · (dist/baseDistance)`, written directly during the two-finger
  move (`gesture.ts:613`–`:616`).
- **Release snap:** if within `0.15` of `1.0`, snap back to `1.0` via `SPRING_PRESETS.button`
  (`gesture.ts:622`–`:625`) — photos want to *return home*.
- **Haptic pairing:** `Haptics.select()` (Selection tick) at each integer zoom crossing
  (1×, 2×, 3×) — a soft "detent" so the body feels the zoom steps; `Haptics.softTap()` on the
  snap-back to 1×.

### 7.2.7 Modal-Dismiss (pull-down) — `attachModalDismiss` (`gesture.ts:507`)

- **Threshold:** dismiss if `y > 120 px` **OR** `velocity > 0.5 px/ms` (`gesture.ts:508`–`:509`,`:552`).
- **Pull-up resistance:** rubber-band `dy · 0.08` (`gesture.ts:542`) — sheet barely moves up.
- **`onProgress (0→1)`** drives the backdrop opacity fade (`gesture.ts:515`) — the room behind
  brightens as you pull the sheet down.
- **Dismiss animation:** spring to `innerHeight·1.1`, call `onDismiss` after `300 ms`
  (`gesture.ts:553`–`:555`), `SPRING_PRESETS.modal`.
- **Haptic pairing:** `Haptics.press()` (Medium, "modal close" per `haptics.ts:46`) at the
  instant dismiss commits; nothing on snap-back (silent return is calmer).

### 7.2.8 Peek / Edge-Back Gesture — `utils/TransitionEngine.ts`

The system-level back gesture is **1:1 finger-tracked** and is the most-felt gesture in the app.

- **Edge zone:** only claims pointers starting within `EDGE_PX = 28 px` of the left edge
  (`TransitionEngine.ts:30`,`:350`).
- **Axis lock:** claims `x` only if horizontal dominates and `dx > 0` (`:376`–`:386`); otherwise
  releases to scroll.
- **Live tracking:** the current surface follows the finger 1:1 —
  `transform: translate3d(${dx}px,0,0)` with `transition:none` (`:400`–`:406`). The surface
  *underneath* is revealed (pop z-order).
- **Prefetch:** at `dx > 20 px`, fire prefetch callbacks (`:395`–`:398`) so the destination is
  warm before commit.
- **Commit thresholds:** commit if `vel > COMMIT_VEL` **OR** `dx/W > COMMIT_FRAC` (`:431`).
- **Commit animation:** velocity-aware duration `dur = clamp(80, remain/vel, T_POP)` so a fast
  flick finishes fast, a slow drag finishes gently (`:435`–`:441`). Fires `te:gesture-back`
  → `App.tsx` does `flushSync(setState)`, then a `160 ms opacity` fade-in of the new surface
  (`:450`–`:458`).
- **Haptic pairing:** **none during tracking** (it would buzz on every frame — forbidden).
  Fire **one** `Haptics.softTap()` (Light, "back navigation" per `haptics.ts:42`) **at commit**,
  synchronized to the `te:gesture-back` dispatch. On cancel (snap-back), **silent**.

### 7.2.9 Rubber-Band Overscroll — `attachRubberBand` (`gesture.ts:667`)

- **Status:** present but **not wired** (`gesture.ts:649`–`:656`) — pointer events are the
  wrong primitive for a `touch-action: pan-y` scroller. Prefer the native Android-12+ stretch
  (`overscroll-behavior: contain`) for scroll containers.
- **If used on a non-scrolling surface:** iOS curve slope ~0.55 at origin
  `sign·(1 − 1/((|dy|·0.55)/size + 1))·size` (`gesture.ts:681`–`:686`); `SPRING_PRESETS.rubber`
  `{stiffness:450, damping:34, mass:0.8}` return.
- **Haptic pairing:** `Haptics.rigidStop()` (Heavy/"wall") **once** when the band reaches its
  asymptotic max (the "you've hit the end" thud); never during the elastic give itself.
- **Yield contract:** `shouldEngage('top')` lets tabs that embed `PullToRefresh` own the top
  edge so the two don't double up (`gesture.ts:658`–`:665`,`:706`).

### 7.2.10 Context Menus (long-press → menu)

Built on `attachLongPress` (§7.2.5) → on `onActivate`, present an `ActionSheet` (`z-[140]`,
`ActionSheet.tsx:51`).

| t (ms) | Visual | Haptic |
|-------:|--------|--------|
| 0–380 | Long-press ring fills; element scales to 0.97. | tap → press → heavy ladder (33/66/100%) |
| 380 | Ring completes; **source element lifts** (`scale 1.035` + shadow, `tile-lift`); menu sheet rises from bottom via `modal` direction (`--lior-motion-modal` 380 ms `--lior-ease-silk`); backdrop dims behind. | `Haptics.heavy()` (the activation thud, `gesture.ts:1055`) |
| menu open | Each row press → `spring-press`. | `Haptics.tap()` on row tap; `Haptics.warning()` if the row is destructive |
| dismiss | Pull-down or tap-out → `attachModalDismiss` / `modal-close`. | `Haptics.press()` on commit |

---

## PHASE 10 — HAPTIC + MOTION SYNCHRONIZATION

### 7.3.1 The Prime Rule (restated, binding)

> **Haptics fire on EXPLICIT PRODUCT ACTIONS — never on raw global `pointerdown`.**
> Global `pointerdown` haptics were deliberately removed because they felt noisy during
> scroll (documented in `index.tsx`). The **visual** press is global (`index.tsx` sets
> `data-pressing` with scroll-cancellation; `.spring-press` is the press-down primitive,
> mirrored by `attachPress` / `[data-press]`, `gesture.ts:848`). The **haptic** is fired by
> the handler of the *action* that the press performs, not by the press itself.

This rule is enforced structurally by `services/haptics.ts`:
- **Scroll suppression:** any haptic is dropped if a scroll/drag happened within
  `_scrollSuppressMs = 220 ms` (`haptics.ts:124`,`:193`). The service binds global
  `touchmove`/`wheel`/`scroll`/`pointermove` guards that mark scroll-like activity
  (`haptics.ts:132`–`:165`).
- **Debounce:** single impacts are dropped within `_debounceMs = 140 ms` of the last fire
  (`haptics.ts:120`,`:194`) — kills synthetic-click + pointerdown double-fires.
- **Drag detection:** a pointer that moves `≥ 8 px` is reclassified scroll-like
  (`haptics.ts:125`,`:150`) — so a press that turns into a drag does **not** fire the tap haptic.
- **Sequence cooldowns:** composed sequences have their own longer cooldowns
  (`success/warning 180`, `error 220`, `heartbeat 360`, `doubleBeat 900`, `celebrate 520`,
  `toggleOn/Off 160`; `haptics.ts:395`–`:531`) so they never stutter or overlap.
- **RAF-safe rhythmic path:** `heartbeatPulseSync()` has its own `70 ms` debounce independent
  of the global gate (`haptics.ts:327`–`:338`) so it can pulse inside `AnimationEngine` loops
  (e.g. a beating-heart visual) without fighting UI haptics.

### 7.3.2 Synchronization Principle

**The haptic peak must land on the visual peak — within one frame (≤16 ms).** Concretely:

- **Press-class** (90 ms): visual scale bottoms at ~`t=0` (synchronous write); the **action
  haptic fires on `pointerup`/click**, i.e. at *release*, where the user expects confirmation.
- **Spring settles:** fire the haptic at the moment the spring crosses its **target**, not at
  release — e.g. toggle "lands" → `toggleOn()` (`haptics.ts:430`).
- **Sequences as motion:** `celebrate()`'s escalating beats (0/55/105/148 ms, `haptics.ts:517`)
  are timed to ride the *front* of a confetti burst — fire `celebrate()` **before** or *at*
  `confettiRef.trigger()`, never after, so the body feels the energy as the particles launch.
- **Long-press ladder:** the three haptics (33/66/100%) are the *progress bar for the finger* —
  they must fire on the same RAF tick that crosses each fraction (`gesture.ts:1049`–`:1055`).
- **Native bridge latency:** on Android, Capacitor `selectionChanged` has ~30 ms round-trip, so
  `select()` substitutes a `Light` impact on Android (`haptics.ts:352`–`:356`). Account for this
  when syncing selection ticks to a scroll picker — drive the tick off the picker's settle, not
  its motion.

### 7.3.3 Haptic × Motion Master Table

Every interaction → its haptic (`services/haptics.ts` method) → the exact motion beat it pairs
with → the token/curve. Web fallback is the `navigator.vibrate` pattern (`haptics.ts:77`–`:102`).

| Interaction | Haptic method | iOS / Android impact | Paired motion beat | Token / curve |
|-------------|---------------|----------------------|--------------------|---------------|
| Nav tab tap | `tap()` | Light | BottomNav pill slides to tab; `.bn-icon` scale | `--lior-motion-tab` 240 ms silk |
| List row tap | `tap()` | Light | row `spring-press` 0.97 | `--lior-motion-press` 90 ms |
| Ghost / back button | `softTap()` | Light (shorter) | back-arrow `spring-press`; route `pop` | `--lior-motion-pop` 260 ms soft |
| Standard button press | `press()` | Medium | button `spring-press` | `--lior-motion-press` 90 ms |
| Center FAB / primary CTA | `heavy()` | Heavy | FAB scale-bounce; route open | `--lior-motion-push` 360 ms silk |
| Modal open | `heavy()` | Heavy | sheet rises | `--lior-motion-modal` 380 ms silk |
| Modal close / dismiss commit | `press()` | Medium | sheet slides off (`modal-close`) | `--lior-motion-pop` 260 ms soft |
| Toggle ON | `toggleOn()` | Selection→32ms→Light | knob slides, lands in groove | `--lior-motion-feedback` 140 ms |
| Toggle OFF | `toggleOff()` | Light→32ms→Selection | knob releases, settles off | `--lior-motion-feedback` 140 ms |
| Scroll picker / theme grid | `select()` | Selection tick (Light on Android) | snap-to-detent | `springSnappy` |
| Save / confirm / send | `success()` | Notification Success (rising 2-pulse) | success tick `1→1.04→1` | `--lior-motion-feedback` 140 ms |
| Delete / destructive confirm | `warning()` | Notification Warning (2 flat) | shake/red flash | `--lior-motion-feedback` 140 ms |
| Form error / invalid | `error()` | Notification Error (3 descending) | field shake `±6px` | `--lior-motion-feedback` 140 ms |
| Hard stop / overscroll wall | `rigidStop()` | Heavy | rubber-band asymptote | `SPRING_PRESETS.rubber` |
| Drag pickup | `dragPickup()` | Light | scale→1.05 + shadow | `SPRING_PRESETS.drag` |
| Drag drop / settle | `dragDrop()` | Light | flick→spring to target | `SPRING_PRESETS.drag` |
| Long-press 33% | `tap()` | Light | ring 33%, scale→0.99 | RAF, 380 ms total |
| Long-press 66% | `press()` | Medium | ring 66%, scale→0.98 | RAF |
| Long-press 100% | `heavy()` | Heavy | ring full, source lifts | `tile-lift` |
| Pull-to-refresh armed | `feedback.light()` | Light | indicator passes 80 px threshold | direct height write |
| Pull-to-refresh committed | `feedback.tap()` | Light + tick audio | hold at 50 px, heart spins | `liorPtrSpin 1s` |
| Pull-to-refresh done | `feedback.success()` | Success + chime | indicator collapses | 220 ms `--lior-ease-soft` |
| Swipe committed | `tap()` | Light | content flies off ±innerWidth·1.1 | 260 ms (`--lior-motion-pop`) |
| Swipe cancelled | `softTap()` | Light | snap back to 0 | `SPRING_PRESETS.default` |
| Pinch detent (1×/2×/3×) | `select()` | Selection | live scale | direct write |
| Edge-back commit | `softTap()` | Light | surface flies off, new fades in 160 ms | velocity-aware (`E_STANDARD`) |
| Daily-question reveal | `heartbeat()` then `celebrate()` | Light→Medium, then escalating | bubbles stagger 0.06s, hairline draws, 70-particle burst | `springSmooth` + confetti |
| First Couple Connection | `doubleBeat()` | lub-dub ×2 (520 ms breath) | dots merge, full confetti | `--lior-ease-silk` + confetti |
| Aura/Pulse received | `doubleBeat()` + audio | lub-dub ×2 | full-screen aura takeover | 4 s ambient loop |
| Anniversary | `celebrate()` then `success()` | escalating, then rising | gold flash + full confetti + count-up | `springGentle` + confetti |
| Premium purchase | `success()` (`feedback.celebrate`) then `celebrate()` | rising + chime, then escalating | gold wash, seal scale-in | `--lior-ease-silk` + confetti |
| Minor milestone | `milestone()` | Light·Light·Light | badge scale-pop | `springSnappy` |
| Major milestone | `celebrate()` | escalating | badge pop + 120-particle burst | `springSnappy` + confetti |
| First memory added | `celebrate()` (40 petals) | escalating | card `expand` + shimmer sweep | `--lior-motion-morph` 400 ms |
| Welcome-back | `heartbeat()` then `softTap()` | Light→Medium, then Light | stage warms in 800 ms, thumbnail scales | `--lior-ease-silk` + `springGentle` |
| Heart sent / romantic view | `heartbeat()` | Light→Medium (140 ms gap) | heart pulse | `springGentle` |
| Beating-heart visual (rhythmic) | `heartbeatPulseSync()` | Light per peak (70 ms debounce) | scale pulse in RAF | `AnimationEngine` tick |

### 7.3.4 Synchronization Anti-Patterns (do NOT do)

- ❌ Haptic on raw `pointerdown` / `[data-press]` down — visual only. (Phase-10 rule.)
- ❌ Haptic on any frame of a continuous gesture (drag move, edge-back track, pinch live,
   rubber-band give) — only on **state transitions** (pickup, drop, commit, detent, wall).
- ❌ Firing a celebration sequence **during** `data-transitioning='1'` — gate it out.
- ❌ Confetti on *every* memory-add, *every* milestone — reserve bursts for first/major moments.
- ❌ Letting two sequences overlap — the cooldowns (`haptics.ts:199`) prevent it; don't bypass
   them with `feedback.*` + `Haptics.*` doubled on the same action.
- ❌ A blanket `* { animation: none }` for reduced-motion — breaks
   `tests/motionExperience.assert.mjs`. Suppress per-effect (skip confetti, swap to opacity).

### 7.3.5 Implementation Checklist (for the building engineer)

1. **Mount** `<PhysicsConfetti ref={confettiRef} />` once in `App.tsx` (next to
   `AuraSignalReceiver`); expose `confettiRef.current.trigger` to celebration call-sites.
2. **Add** the optional `count` arg to `PhysicsConfetti.trigger(x?, y?, count = 220)`
   (`PhysicsConfetti.tsx:139`) for intimate bursts.
3. **Wrap** each Phase-8 sequence in a `runCelebration(fn)` helper that sets
   `ambientMotionPaused='1'`, guards on `!data-transitioning`, runs, then clears the flag.
4. **Route** all action haptics through `services/haptics.ts` (or `utils/feedback.ts` where
   audio is paired) — never call `navigator.vibrate` directly; the gates live in the service.
5. **Sync** every celebration's peak haptic to its peak visual frame (§7.3.2); fire
   `celebrate()` *at/just-before* the confetti burst, not after.
6. **Verify** reduced-motion: confetti suppressed, motion → opacity, one peak haptic survives.
7. **Run** `node tests/motionExperience.assert.mjs` to confirm no keyframe regressions.

---

*End of Section 7. The stage stays fixed; the performance synchronizes finger, eye, and pulse.*
## 8. Loading Experiences, Performance Engineering & Priority Matrix

> **Phases 11 + 12 + 13 of the Lior Motion Operating System.**
> Loading is not a waiting room — it is the first frame of the performance. The
> fixed `AmbientVisuals` stage (radial wash + R3F hearts, `components/AmbientVisuals.tsx`)
> is *already on screen* before any route resolves, so every skeleton, placeholder
> and reveal in this section is designed to sit **on top of a living background**,
> never to replace it with a dead grey screen. This section grounds every
> recommendation in shipped files, assigns a real performance budget to each
> animation class, and closes with a scored priority matrix a senior engineer can
> build straight from.
>
> **Canonical tokens used verbatim** (no reinvention): easings `--lior-ease-silk
> (0.16,1,0.3,1)`, `--lior-ease-soft (0.22,1,0.36,1)`, `--lior-ease-press
> (0.2,0,0,1)`, `--lior-ease-exit (0.4,0,0.2,1)`; durations `press 90 · feedback
> 140 · micro 200 · tab 240 · pop 260 · push 360 · modal 380 · morph 400`; springs
> `springSmooth {260/30/0.9}`, `springSnappy {460/34/0.7}`, `springGentle
> {170/26/1}` (`utils/motion.ts`); tiers `ultra/high/medium/low/css-only`
> (`utils/AnimationEngine.ts`).

---

### 8.0 The Loading Philosophy — "Progression, not waiting"

Three rules govern every loading state in Lior. They are non-negotiable and every
blueprint below obeys them.

1. **No spinners. Ever.** A spinner says "the machine is busy." A skeleton says
   "your content is arriving, here is its shape." There is exactly **one**
   indeterminate breathing element in the entire app — the cold-boot `RouteLoader`
   (`App.tsx:130`), and even that breathes (`ui-breathe 1.8s`) rather than spins.
   No new spinner is permitted anywhere.

2. **Zero CLS (Cumulative Layout Shift).** Every skeleton **must** occupy the exact
   bounding box of the content it stands in for — same `aspect-ratio`, same
   `border-radius`, same grid columns, same padding. When real content lands it
   **crossfades in place** (`SkeletonReveal`, 240ms silk) — nothing reflows, jumps,
   or pushes siblings. A layout shift during load is the single most expensive
   perceptual failure in the app and is treated as a P0 bug.

3. **Loading inherits the app's rhythm.** The reveal tempo is `--lior-motion-tab`
   (240ms) on `--lior-ease-silk`, the *same* curve a tab switch uses
   (`SkeletonReveal.tsx:31`). Content does not "pop in" on a bespoke timing — it
   arrives in the cadence the rest of the system already moves at, so the brain
   reads it as *continuation*, not interruption.

---

### 8.1 The Three Loading Primitives (shipped)

Everything in Phase 11 composes from three existing pieces. Do not introduce a
fourth primitive without flagging it.

#### A. `Skeleton` — the bounding-box placeholder (`components/Skeleton.tsx`)

A single component with **8 typed variants** that already map to real content
shapes: `text · image · avatar · card · list-item · grid · calendar · countdown`
(`Skeleton.tsx:5`). Each variant renders a `.skeleton-shell` (a warm pink-tinted
gradient box, `index.css:1755`) containing two stacked animation layers from the
restored CSS:

| Layer | Source | Animation | Tempo | Property |
|---|---|---|---|---|
| `.skeleton-aura` | `index.css:1764` | `@keyframes skeleton-aura` (opacity 0.3↔0.6) | **2.4s** `--lior-ease-soft` | **opacity only** |
| `.skeleton-shimmer` | `index.css:1773` | `@keyframes skeleton-shimmer` (`translate3d(-100%)→(100%)`) | **1.5s** `--lior-ease-soft` | **transform only** |

This is deliberately a **two-loop** design: the slow 2.4s aura *breathes* (it
rhymes with the ambient background's breathing wash), and the 1.5s shimmer
*sweeps* (it reads as "data is moving through"). Both are above the **≥2000ms /
sub-2000ms split** that keeps ambient loops from competing with gesture feedback —
the shimmer at 1.5s is the one intentional exception because it is *informational*
(it signals activity) rather than *ambient*, and it lives only inside skeleton
shells that are themselves transient.

> **Why pink, not grey.** The `.skeleton-shell` gradient is `rgba(232,160,176,…)`
> (`index.css:1758`) — a dusty rose, not neutral grey. On the warm light brand a
> grey skeleton reads as "broken/disabled"; the rose reads as "warm, alive, almost
> here." This is a brand-coherence decision, not decoration.

#### B. `SkeletonReveal` — the 240ms silk crossfade (`components/SkeletonReveal.tsx`)

The transition *from* skeleton *to* content. Two absolutely-stacked layers
crossfade through each other in one tempo:

```tsx
// SkeletonReveal.tsx:24 — skeleton layer
animate={{ opacity: loading ? 1 : 0, scale: loading ? 1 : 1.01 }}
transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}   // --lior-motion-tab + --lior-ease-silk
// :37 — content layer
animate={{ opacity: loading ? 0 : 1, scale: loading ? 0.99 : 1 }}
```

The micro-scale (skeleton drifts up to `1.01`, content settles from `0.99→1`)
gives a **subtle depth handoff** — the placeholder recedes by 1% as the real thing
surfaces. Crucially, the **animated `filter: blur` was removed** (`SkeletonReveal.tsx:22`)
— it was a per-frame compositor tax on mid-range Android for negligible
perceptual gain. **This is the rule for all loading reveals: transform + opacity
only, never blur.**

#### C. `RouteLoader` — the cold-boot anticipation screen (`App.tsx:130`)

Shown **only** before auth/first-paint resolves, never on tab switches (those use
keep-alive shells). It is the app's single "we're waking up" moment:

- A `liquid-glass` rounded tile (`App.tsx:144`) holds a `Heart` icon breathing on
  `ui-breathe 1.8s ease-in-out infinite` (`App.tsx:153`) — opacity/scale only.
- Behind it, a radial `animate-breathe-glow` aura at `scale(2.9)` (`App.tsx:138`)
  pulses the theme particle colour.
- Copy: **"Waking the room softly"** (`App.tsx:160`) — sets the emotional frame
  (a *room*, a *home*, not a *loading bar*). The vignette + theme background
  (`App.tsx:135`) means even cold boot is on-brand warm, never a white flash.

> **Route-level Suspense fallback is `null`, not a spinner** (`App.tsx:166`,
> `RouteFallback = () => null`). Because views are **preloaded synchronously**
> (`viewRegistry.tsx:48` returns a synchronous thenable once a module is cached),
> a navigated-to view mounts in the *same render pass* with no blank fallback
> frame. The fallback is `null` precisely so that on the rare un-preloaded path you
> get nothing (a held last frame under the running transition) rather than a flash
> of chrome.

---

### 8.2 Phase 11 — Per-Surface Loading Blueprints

Each blueprint specifies: the skeleton variant, the bounding-box contract (what
must match for zero CLS), the reveal, and how it harmonizes with the fixed
background.

#### 8.2.1 Home (`views/Home.tsx`)

Home is mostly **keep-alive** (it stays mounted across tabs), so its primary
"load" is the **cold first paint** and the **per-tile media fill**, not a full
skeleton sweep.

- **Masthead:** no skeleton — the greeting + date are local/instant. It does a
  one-time entrance `revealVariants` (fade + `y:16→0`, `springSmooth`,
  `motion.ts:41`) on first mount only.
- **Bento tiles:** the tile *frames* (gradient cards) paint instantly; only the
  **memory thumbnail** inside a tile loads (`Home.tsx:97`, `Home.tsx:947`
  `loading="lazy" decoding="async"`). Frame-by-frame fill:
  - **f0:** tile frame visible, image slot is the tile's own gradient (acts as its
    own placeholder — no separate skeleton needed because the frame already owns
    the box).
  - **on `img.onload`:** crossfade the `<img>` from `opacity:0→1` over
    **200ms (`--lior-motion-micro`) `--lior-ease-silk`**. Image box is fixed by the
    tile's `aspect-ratio`, so **zero CLS**.
- **DailyQuestion / InsightWhisper:** if partner data is still resolving, show a
  `Skeleton type="text"` pair (one `h-4 w-3/4`, one `h-3 w-1/2`) sized to the real
  question's two-line layout, wrapped in `SkeletonReveal`. The reveal of the actual
  question is the *emotional* moment, so it gets `springGentle` on a `y:8→0` rise
  layered over the 240ms opacity crossfade.
- **Background harmony:** Home tiles are translucent over the ambient stage; the
  skeleton shells' rose aura is *quieter* (opacity 0.3–0.6) than the tiles' final
  state, so the loading state reads as "dimmer version of the real thing" sitting
  on the same living wash. The ambient layer keeps breathing underneath the entire
  time — load never freezes the world.

#### 8.2.2 Timeline (`views/MemoryTimeline.tsx`)

The richest loading surface — a grid of media cards.

- **Per-card placeholder:** when a card's media URL is still resolving
  (`mediaLoading`), it renders `Skeleton type="image"` *absolutely filling* the
  card (`MemoryTimeline.tsx:206`, `className="absolute inset-0 w-full h-full
  rounded-none"`). The card's own `aspectRatio` (`4/3` featured, `3/4` standard,
  `MemoryTimeline.tsx:200`) and `boxShadow` are set on the **outer** element, so
  the skeleton inherits the exact final box → **zero CLS** when the `<img>` swaps
  in.
- **Entrance stagger (first viewport only):** cards `index < 9` animate
  `opacity:0,y:10 → opacity:1,y:0` over **220ms** at
  `delay = min(index * 0.035, 0.32)` on `--lior-ease-silk`
  (`MemoryTimeline.tsx:179`, `:185`). Cards past the fold get `initial={false}` —
  **no entrance tween** — because driving hundreds of offscreen springs is a
  mount-jank burst. This is the canonical pattern: **stagger only what's visible.**
- **Below-the-fold:** offscreen cards are skipped for paint via
  `content-visibility:auto` (`MemoryTimeline.tsx:176` comment;
  `.perf-list-item`). Their skeletons never animate until scrolled near.
- **Image reveal:** `loading="lazy" decoding="async"` (`:226`) defers decode off
  the main thread; on decode-complete the `<img>` crossfades over the skeleton at
  **200ms `--lior-ease-silk`**. The skeleton does **not** unmount until the image's
  `onload` fires, so there is never a transparent gap.
- **Empty/error state:** falls to a centred `ImageIcon` at `opacity:0.30`
  (`MemoryTimeline.tsx:238`) — a calm placeholder, not an error spinner.

#### 8.2.3 Daily Questions / Daily Moments (`views/DailyMoments.tsx`, `components/DailyQuestion.tsx`)

- **Photo-of-the-day:** uses a full-bleed `Skeleton type="image"` at
  `absolute inset-0 rounded-none` (`DailyMoments.tsx:97`), and a dimmed
  `opacity-20` variant behind the compose preview (`:392`). Real image fades in
  `loading="lazy" decoding="async"` (`:107`).
- **The partner-response reveal is the hero loading moment.** When the partner's
  answer is still sealed, do **not** show a generic skeleton — show a *sealed*
  state (a soft card with a "waiting for [partner]" line) that, on resolve,
  **blooms** open: card `scale 0.96→1`, `opacity 0→1`, `y 6→0` on `springGentle`
  (`170/26/1`) over ~`--lior-motion-morph (400ms)`. This is anticipation-as-design:
  the "loading" is reframed as *emotional waiting*, and the reveal lands as a gift.
- **Compose preview blur backdrop:** `DailyMoments.tsx:835` uses a `blur-2xl scale-110`
  copy of the image as an ambient backdrop — note this `blur` is a **static**
  filter on a transient surface (acceptable), **not** an animated per-frame blur
  (forbidden on always-on chrome — see §8.3).

#### 8.2.4 Connection surfaces (Lior's *real* comms — no messenger)

Lior has no chat. The "connection loading" blueprint maps to the real surfaces:

- **DuetJournal (`views/DuetJournal.tsx`):** turn-based shared journaling. While
  the partner's turn loads, render `Skeleton type="text"` lines matched to the
  entry's typographic rhythm (one `h-5` title, three `h-3` body lines at
  decreasing width). The partner's entry **reveals top-down** with a 60ms
  `staggerChildren` (`staggerContainer`, `motion.ts:47`) so it reads like words
  *being placed*, not pasted.
- **AuraSignal / Pulse (`views/AuraSignal.tsx`):** presence + heartbeat ping. There
  is no "loading" — presence is a live state. While the ping is in flight, the
  heart pulses on the `heartbeat`/`doubleBeat` haptic ladder (`services/haptics.ts`)
  synced to a scale-only `1→1.06→1` loop ≥2000ms. Failure decays to a calm "couldn't
  reach" rest state, never an error toast mid-pulse.
- **VoiceNotes (`views/VoiceNotes.tsx`):** waveform placeholder = a row of
  `Skeleton`-rose bars at varied heights (the eventual waveform's box). On decode,
  bars settle to real amplitudes via `springSmooth`, **height animated only on the
  transient skeleton→real swap**, never per-frame.
- **OpenWhen letters (`views/OpenWhen.tsx`):** sealed-envelope state *is* the
  loading state; opening is a `modal`/`expand` reveal (covered in the route
  section), not a skeleton.

#### 8.2.5 Relationship Profile — "Us" (`views/Us.tsx`) + Profile (`views/Profile.tsx`)

- **Stat tiles / milestones:** `Skeleton type="card"` (`Skeleton.tsx:75` — a
  `h-24` media block + two text lines) per stat, in the exact grid the real stats
  use. Counters do **not** animate from a skeleton; they fade in settled, then (if
  desired) tick on a *separate*, post-load count-up so loading and celebration
  never blur together.
- **Couple photo (`Profile.tsx:586`):** `decoding="async"`, crossfades in over its
  fixed circular frame → zero CLS.
- **Growth (BonsaiBloom):** the plant's *current* growth state renders immediately
  from cached data; only the delta animates. Never skeleton a growth visual — it
  must feel persistent, like it was always there.

#### 8.2.6 Premium (`views/Premium.tsx`)

The one surface where load = *desire*. Tier cards use `Skeleton type="card"` in the
final 2-up/3-up grid, but the **price + CTA** fade in last with a 40ms-staggered
`revealVariants` so the eye lands on value → price → button in sequence. No
shimmer on the CTA button itself (it should feel solid/ready, never "loading").

#### 8.2.7 Heavy 3D surfaces (OurRoom, PartnerIntelligence)

These are `React.lazy` + `Suspense` with **bespoke fallbacks**, not skeletons:
`RoomSceneFallback` (`OurRoom.tsx:713`) and `VisualAnalyticsFallback`
(`PartnerIntelligenceView.tsx:810`). The fallback is a calm, on-brand still of the
scene's mood (warm gradient + soft heart), **never** a black canvas or spinner.
The item grid below uses `contentVisibility:'auto'` + `containIntrinsicSize:'0 600px'`
(`OurRoom.tsx:1011`) so offscreen rows cost nothing and reserve their box → zero
CLS on scroll.

---

### 8.3 Phase 12 — Performance Engineering

> **Target:** 60fps floor on mid-range Android Chromium WebView, 120fps on capable
> panels. The `AnimationEngine` budget is **8.33ms/frame** (`AnimationEngine.ts:67`).
> Every animation class below is rated by cost and given a concrete optimization
> strategy. The governing law: **animate `transform` and `opacity` only.** These are
> the only two properties the compositor can run off the main thread without layout
> or paint.

#### 8.3.1 The cardinal rules (enforced by code + tests)

1. **Compositor-only properties.** Never animate `width/height/top/left/margin/
   padding` (layout) or `filter/backdrop-filter` (paint) in any always-on or
   navigation animation. `tests/motionExperience.assert.mjs:81-87` **fails the
   build** if any `keep-alive*`, `lior-vt-*`, or `lior-motion-*` keyframe mentions
   `height|width|top|left|margin|padding|filter|backdrop-filter`. This guard is the
   teeth behind the rule.
2. **`will-change` discipline.** Declare `will-change` **only** on elements that are
   *about to* or *currently* animating, and only the exact properties. Shipped
   examples: `.skeleton-shimmer{will-change:transform}` (`index.css:1782`),
   `.tile-open-lifting{will-change:transform}` (`index.css:1744`),
   `.keep-alive-shell.is-active{will-change:opacity}` (`root-fixes.css:194`),
   `.bn-icon{will-change:transform}` (`root-fixes.css:291`). **Never** put a blanket
   `will-change` on a container — each promoted layer costs GPU memory; over-promotion
   on mid-range Android causes texture-upload jank worse than the thing it "fixes."
   Remove `will-change` when the animation ends (framer does this automatically;
   for CSS use `both` fill + scoped class as the shipped patterns do).
3. **Single RAF.** No component may call `requestAnimationFrame` directly. All
   continuous motion subscribes to `AnimationEngine` (`AnimationEngine.ts:155`), one
   loop, one paint boundary. CSS-var writes are **batched** into one
   `setProperty` burst per frame via the CSS Animation Bus (`AnimationEngine.ts:201-213`)
   — N subscribers writing vars = **one** style mutation, not N.
4. **`content-visibility:auto`** on every long list / offscreen section
   (`.cv-auto` utility `root-fixes.css:157`; Timeline, OurRoom grid) — skips layout
   *and* paint for offscreen subtrees. Pair with `contain-intrinsic-size` to reserve
   the box (zero CLS) and avoid scroll-anchor jumps.
5. **Reclaim the GPU budget during transitions.** `TransitionEngine` sets
   `html[data-transitioning="1"]` for the duration of a route change
   (`TransitionEngine.ts:245`). Heavy ambient layers (R3F canvases, blur washes)
   **pause** themselves on this flag (`AmbientVisuals` reads `effectivePaused`), so
   100% of the frame budget goes to the transition. The flag clears on
   `finished` (`TransitionEngine.ts:247`). **Any new heavy/continuous effect MUST
   subscribe to this and skip while transitioning.**
6. **Reduced motion is global, never blanket-killed.** `<MotionConfig
   reducedMotion="user">` wraps `<App/>` (index.tsx) so every framer animation
   degrades to opacity-only. CSS `@media (prefers-reduced-motion: reduce)` disables
   `skeleton-shimmer/aura` (`index.css:1792`) and `tile-lift` (`:1748`). **Never add
   `* { animation: none }`** — it deletes the keyframes the assert guard requires to
   *exist*, breaking the build.

#### 8.3.2 Animation-class cost ledger

| # | Animation class | Where | Property | Cost | Perf impact | Optimization strategy |
|---|---|---|---|---|---|---|
| C1 | **Ambient background** (wash + sheen + R3F hearts) | `AmbientVisuals.tsx` | transform/opacity + WebGL | **High (always-on)** | The single biggest persistent GPU cost; never remounts | Memo'd orchestrator; `effectivePaused` on `data-transitioning`; tiered by `AnimationEngine` minTier; loops ≥2000ms; **PRIME DIRECTIVE: do not touch** |
| C2 | **Route transitions** (push/pop/modal/expand/tab) | `root-fixes.css` `@keyframes lior-vt-*` | **transform+opacity only** | Medium, bursty | Heaviest *moment*, but budget reclaimed via C1 pause | Native View Transitions API; CSS keyframes (off-main-thread); assert-guarded to stay transform/opacity; ambient paused throughout |
| C3 | **Skeleton shimmer + aura** | `index.css:1773/1764` | transform / opacity | **Low** | 2 layers/shell × N shells — watch grids | Compositor-only; `will-change:transform` on shimmer only; killed under reduced-motion; lives only while `loading` |
| C4 | **SkeletonReveal crossfade** | `SkeletonReveal.tsx` | opacity + tiny scale | **Very low** | One-shot 240ms | Blur removed; `initial={false}`; `pointer-events:none` on faded layer (`:32`) |
| C5 | **List entrance stagger** | `MemoryTimeline.tsx:181` | opacity + `y` | **Low (capped)** | Unbounded staggers = mount-jank | **Cap to first 9** (`index<9`), `initial={false}` past fold; `content-visibility` skips offscreen paint |
| C6 | **Tile-open lift** (shared-element bloom origin) | `index.css:1738` + `hooks/useTileOpen.ts` | transform + `box-shadow` | **Low** | One tile, one-shot 300ms | `transform`+shadow only (shadow is cheap on one element); `will-change:transform`; sets `--lior-open-x/y` for the `expand` route |
| C7 | **Press feedback** (`.spring-press`, `data-pressing`) | index.tsx + CSS | transform (scale) | **Very low** | Global, fires constantly | Scale-only; **scroll-cancellation** in index.tsx prevents press-paint during scroll; 90ms `--lior-motion-press` |
| C8 | **BottomNav pill + icon** | `BottomNav.tsx` + `root-fixes.css:288` | transform | **Very low** | One WAAPI animation | WAAPI (off-main-thread); 240ms silk, no overshoot; `will-change:transform` on `.bn-icon` |
| C9 | **Image/media fade-in** | Timeline/Home/DailyMoments | opacity | **Very low** | Decode is the real cost, not the fade | `loading="lazy"` + `decoding="async"` keep decode off main thread; fade only on `onload` |
| C10 | **Confetti / touch-trail / celebrate** | `DeferredOverlays.tsx` | transform/opacity (canvas) | **Medium, transient** | Particle bursts on low-end | `React.lazy` (not in initial bundle); `Suspense fallback={null}`; subscribes to `AnimationEngine` tier (particle count scales down); auto-unmount after burst |
| C11 | **Static blur backdrops** (compose preview, glass) | `DailyMoments.tsx:835`, `liquid-glass` | filter (static) | **Medium (one-time)** | Blur is paint-heavy | **Static only** — never animate the blur; never on scrolling/always-on chrome; prefer pre-blurred or low-radius |

#### 8.3.3 React / Capacitor / Supabase-specific guidance

- **React render cost is a motion cost.** A re-render mid-animation drops frames.
  Keep-alive tab shells (`root-fixes.css:171`) avoid remount-on-switch entirely —
  switching tabs is a **CSS visibility flip**, not a React unmount + Suspense
  roundtrip (`App.tsx:991` comment). Heavy views (`our-room`,
  `partner-intelligence`) are in `HEAVY_PREFETCH_VIEWS` (`viewRegistry.tsx:66`).
- **Synchronous preload kills the fallback flash.** `viewRegistry.tsx:48` returns a
  synchronous thenable once a module is cached, so a navigated view mounts in the
  same render pass — no blank Suspense frame. **Anticipation:** `TransitionEngine`
  fires a `te:prefetch` signal early (`TransitionEngine.ts:394`), `App.tsx:289`
  preloads the hinted view's module *before the finger lifts*, so the route's JS is
  parsed during the gesture, not after. Tapping = the page is already warm.
- **Supabase latency ≠ animation latency.** Never block a reveal on a network round
  trip. Render the skeleton instantly from the *shape* you know, fetch in parallel,
  crossfade when data lands. Optimistic local state (cached couple data, BonsaiBloom
  growth) renders settled with no skeleton at all.
- **Capacitor WebView quirks:** Android Chromium WebView under-promotes layers and
  has a smaller GPU texture budget than desktop Chrome. Hence the strict
  `will-change` discipline (§8.3.1.2) and the tier system: at `medium`
  `backdrop-filter` is disabled, at `low` WebGL + blur are off
  (`AnimationEngine.ts:9-13`). The current build locks `ultra` for the visual
  Capacitor target (`AnimationEngine.ts:89`), so the *real* defense on low-end is
  the `data-transitioning` budget reclaim + compositor-only discipline, not
  adaptive downgrade.

#### 8.3.4 Measurement & guardrails

- **Frame history is free.** `AnimationEngine.frameTimes` is a 128-slot ring buffer
  (~1s at 120fps, `AnimationEngine.ts:102`); `.fps` getter (`:116`) reads it with no
  extra RAF. Per-subscriber cost tracking is **opt-in** (`costTrackingEnabled`,
  `:86`) so production doesn't pay two `performance.now()` calls per sub per frame.
- **Delta is clamped** to `[3ms, 50ms]` (`AnimationEngine.ts:165`) — a backgrounded
  tab resuming can't inject a 4-second delta that teleports every animation.
- **Engine pauses when hidden** (`AnimationEngine.ts:157`, visibilitychange) — zero
  battery drain in background.
- **The assert guard is CI-blocking.** `tests/motionExperience.assert.mjs` asserts
  the silk curve exists (`:12`), keep-alive uses opacity-only (`:18`), cached shells
  don't use `display:none` (`:36`), no bounce/elastic curves anywhere (`:66`), and
  **every navigation keyframe stays transform/opacity** (`:81`). Treat a failure here
  as a perf regression, not a style nit.

---

### 8.4 Phase 13 — The Motion Priority Matrix

Every animation in the system, scored on three axes and bucketed into four tiers.
**Score = (Emotional Impact × 2) + Dev Effort_inverse + Performance_safety**, where
each axis is 1–5. Emotional impact is double-weighted because this is a relationship
app — *feeling* is the product. "Dev effort" and "perf cost" are shown raw (lower is
better); the verdict column is the recommendation.

**Legend:** Emotion (E) 1–5 higher=more moving · Effort (D) 1–5 higher=more work ·
Perf cost (P) 1–5 higher=more expensive.

#### Tier 1 — Must-Have (ship-blocking; the app feels broken without these)

| Animation | E | D | P | Status | Verdict |
|---|---|---|---|---|---|
| Fixed ambient background (C1) | 5 | — | 4 | **Shipped, frozen** | PRIME DIRECTIVE — the stage; never touch |
| Route transitions push/pop/tab (C2) | 5 | 4 | 3 | Shipped | The spine of navigation; keep assert-guarded |
| SkeletonReveal 240ms crossfade (C4) | 4 | 1 | 1 | Shipped | Cheapest highest-leverage motion in the app |
| Skeleton shimmer + aura (C3) | 4 | 1 | 2 | Shipped | "Progression not waiting" depends on it |
| Press feedback + scroll-cancel (C7) | 4 | 2 | 1 | Shipped | Touch must feel alive; cancel-on-scroll is essential |
| BottomNav pill + icon (C8) | 4 | 2 | 1 | Shipped | Primary wayfinding; WAAPI keeps it free |
| Image fade-on-load, zero-CLS (C9) | 3 | 1 | 1 | Shipped | Non-negotiable: no layout shift, ever |
| RouteLoader cold-boot (C8/breathe) | 3 | 2 | 1 | Shipped | First impression; the only breathing element allowed |

#### Tier 2 — High-Impact (defines "premium"; strongly recommended)

| Animation | E | D | P | Status | Verdict |
|---|---|---|---|---|---|
| Tile-open expand bloom (C6 + `expand` route) | 5 | 3 | 2 | Shipped | The signature "this came from *that*" moment; keep wired to Home tiles |
| Partner-response reveal bloom (§8.2.3) | 5 | 3 | 1 | Partial | Highest emotional ROI — finish the sealed→bloom on DailyQuestion |
| List entrance stagger, capped (C5) | 4 | 2 | 2 | Shipped | Keep the `index<9` cap; never uncap |
| DuetJournal top-down word stagger | 4 | 2 | 1 | Spec | 60ms `staggerChildren`; reads like words being placed |
| AuraSignal/Pulse heartbeat loop | 5 | 3 | 2 | Partial | Presence as living motion; sync to haptic `heartbeat` ladder |
| Transition sheen veil (`lior-motion-veil`) | 3 | 2 | 1 | Shipped | Zero-idle-cost; only animates while transitioning |
| VoiceNotes waveform settle | 3 | 3 | 2 | Spec | Bars spring to real amplitude on decode |

#### Tier 3 — Nice-to-Have (delight; add after Tier 1–2 are flawless)

| Animation | E | D | P | Status | Verdict |
|---|---|---|---|---|---|
| Confetti / celebrate burst (C10) | 4 | 3 | 3 | Shipped | Keep lazy + tier-scaled; reserve for genuine milestones |
| Touch-trail canvas (C10) | 3 | 3 | 3 | Shipped | Lazy-loaded; gate to capable tiers |
| Premium price/CTA sequenced reveal | 3 | 2 | 1 | Spec | Value→price→CTA cadence; cheap, persuasive |
| Counter tick-up on Us stats | 3 | 2 | 1 | Spec | Run *after* load, never during skeleton |
| `lift-card` hover lift (`index.css:1797`) | 2 | 1 | 1 | Shipped | Pointer-only nicety; harmless on touch |
| BonsaiBloom growth-delta animation | 4 | 4 | 3 | Partial | Animate only the delta; never skeleton the plant |

#### Tier 4 — Future-Vision (aspirational; only if perf headroom proven on low-end Android)

| Animation | E | D | P | Status | Verdict |
|---|---|---|---|---|---|
| Cross-surface shared-element (memory → Timeline → fullscreen) | 5 | 5 | 3 | Future | Extend the `expand` origin system app-wide; high craft, high effort |
| WeeklyRecap cinematic auto-advance (Apple-Memories style) | 5 | 5 | 4 | Future | Ken-Burns + beat-synced captions; gate hard on tier |
| Ambient-reactive foreground (UI subtly responds to background phase) | 4 | 5 | 4 | Future | Read C1's `--breathe-phase` via CSS Animation Bus; risk: competing with the stage — must stay subliminal |
| Predictive skeleton (skeleton morphs toward likely content from cache) | 3 | 5 | 2 | Future | Cache-shape-aware placeholders; diminishing returns vs. effort |
| Physics-based drag for KeepsakeBox / OurRoom items | 4 | 4 | 4 | Future | Real momentum; needs careful tier gating on WebView |

#### Reading the matrix

- **Build order:** finish every Tier 1 to *flawless* (zero CLS, 60fps floor, assert
  green) before touching Tier 2. The two **Partial** Tier-2 items (partner-response
  bloom, AuraSignal heartbeat) are the highest emotional-ROI unfinished work in the
  whole motion system — they are where "feature museum" becomes "ritual."
- **Perf veto:** any item scoring **P ≥ 4** must prove it pauses on
  `data-transitioning` and degrades under reduced-motion *before* merge. C1 is the
  only always-on P4 and it's frozen and already budget-managed.
- **The cheapest wins are Tier 1.** C3/C4/C9 all score **D1/P1–2** — skeletons and
  zero-CLS image fades are almost free and carry the entire "progression, not
  waiting" promise. Spend effort here first; it has the best ratio in the document.

---

### 8.5 Section invariants (carry into every other section)

1. **No spinners. No CLS. Loading inherits the 240ms silk rhythm.**
2. **Transform + opacity only** for anything that animates more than once or lives
   on always-on chrome; static blur is fine, animated blur is forbidden there.
3. **The ambient stage is never frozen by a load** — skeletons sit *on* the living
   background; the background pauses only for transitions, never for data fetches.
4. **`will-change` is scoped and temporary**; over-promotion is the #1 self-inflicted
   WebView jank.
5. **`tests/motionExperience.assert.mjs` is the contract** — keyframes must exist and
   must stay compositor-only; a red assert is a perf regression.
## 9. Developer Implementation Specification

> **PHASE 15 — The hand-off.** This is the build sheet. Everything below is grounded in
> code that already ships in this worktree. The rule is **extend, never fork**: a new
> primitive must import its numbers from `utils/motion.ts` and its CSS from
> `styles/root-fixes.css` / `index.css` — never re-declare a stiffness, a duration, or a
> cubic-bezier inline. If you find yourself typing `0.16, 1, 0.3, 1` by hand, you are doing
> it wrong; import `EASE_SILK`.
>
> **Stack:** React 19 + framer-motion 12 + Capacitor (Android Chromium WebView primary).
> **Stage rule:** the fixed `AmbientVisuals` background is the stage. Every primitive here is
> compositor-only (`transform` + `opacity`) so it never forces a paint that competes with the
> background, and every primitive checks `data-transitioning` discipline indirectly via the
> engine that already pauses ambient layers.

---

### 9.1 The token module — `utils/motion.ts` (current shape + the extension)

The canonical vocabulary already exists. Here is the **shipped** surface (do not change these
values — they are mirrored by CSS and asserted by `tests/motionExperience.assert.mjs`):

```ts
// utils/motion.ts — ALREADY SHIPPED (lines 19–58). Reference, do not duplicate.
export const EASE_SILK = [0.16, 1, 0.3, 1] as const;   // premium deceleration
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;  // gentle standard / outgoing
export const EASE_EXIT = [0.4, 0, 0.2, 1] as const;    // accelerate-out

export const DUR_TAB = 0.24;  export const DUR_POP = 0.26;
export const DUR_PUSH = 0.36; export const DUR_MODAL = 0.38;

export const springSmooth = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };
export const springSnappy = { type: 'spring', stiffness: 460, damping: 34, mass: 0.7 };
export const springGentle = { type: 'spring', stiffness: 170, damping: 26, mass: 1 };

export const tweenSilk = (d = 0.5) => ({ duration: d, ease: EASE_SILK });
export const tweenSoft = (d = 0.4) => ({ duration: d, ease: EASE_SOFT });

export const revealVariants;       // { hidden:{opacity:0,y:16}, visible:{...springSmooth} }
export const staggerContainer;     // (stagger=0.06, delay=0.02) => Variants
export const staggerItem;          // { hidden:{opacity:0,y:18,scale:0.98}, visible:{...} }
export const inViewOnce;           // { once:true, margin:'0px 0px -40px 0px' }
export const prefersReducedMotion; // () => boolean
```

**The extension (append to `utils/motion.ts`).** Three gaps exist: a `press` and `feedback`
and `micro` duration are in CSS but not exported to JS; there is no `EASE_PRESS` const; there
is no `pressVariants`, `modalVariants`, or stagger-from-origin helper. Add exactly this — every
value mirrors a CSS custom prop that already exists in `styles/root-fixes.css :root` (lines
93–105), so nothing new enters the design system:

```ts
// ── APPEND to utils/motion.ts ────────────────────────────────────────────────

// Press-in curve — mirrors --lior-ease-press (root-fixes.css:95). The only ease
// the JS layer was missing; needed by <Pressable> for the down-stroke.
export const EASE_PRESS = [0.2, 0, 0, 1] as const;

// Short-end durations (seconds) — mirror --lior-motion-press/feedback/micro/morph.
export const DUR_PRESS    = 0.09;  // --lior-motion-press 90ms
export const DUR_FEEDBACK = 0.14;  // --lior-motion-feedback 140ms
export const DUR_MICRO    = 0.20;  // --lior-motion-micro 200ms
export const DUR_MORPH    = 0.40;  // --lior-motion-morph 400ms (shared-element)

// Press primitive variants. Down-stroke is sharp (EASE_PRESS, fast); release is
// springGentle so it settles with the same whisper-of-overshoot as the global
// .spring-press CSS (index.css:1689). Scale floor matches CSS (0.955).
export const pressVariants: Variants = {
  rest:    { scale: 1,     transition: springGentle },
  pressed: { scale: 0.955, transition: { duration: DUR_PRESS, ease: EASE_PRESS } },
};

// Modal/sheet — rises from the bottom edge to match lior-vt-modal-in
// (root-fixes.css:358). Used by <Sheet> for in-React surfaces that are NOT
// route-level (route-level sheets go through TransitionEngine 'modal').
export const sheetVariants: Variants = {
  hidden:  { y: '100%',                transition: { duration: DUR_MODAL, ease: EASE_SOFT } },
  visible: { y: 0,                     transition: { duration: DUR_MODAL, ease: EASE_SILK } },
  exit:    { y: '100%',                transition: { duration: DUR_POP,   ease: EASE_EXIT } },
};
export const scrimVariants: Variants = {
  hidden:  { opacity: 0, transition: { duration: DUR_POP } },
  visible: { opacity: 1, transition: { duration: DUR_MODAL } },
};

// Stagger that adapts step to count — long lists must not take 2s to fully
// reveal. Clamps total reveal window to ~480ms regardless of N.
export const staggerFor = (count: number): number =>
  count <= 0 ? 0.06 : Math.min(0.06, 0.48 / count);

// Heartbeat scale keyframes for romantic pulse surfaces (Aura/Pulse, hero
// heart). Loop duration ≥ 2000ms per the ambient-loop rule so it never
// competes with gesture feedback.
export const heartbeatPulse: Variants = {
  beat: {
    scale: [1, 1.06, 1, 1.04, 1],
    transition: { duration: 2.0, times: [0, 0.12, 0.24, 0.36, 1], ease: 'easeInOut', repeat: Infinity },
  },
};
```

> **New tokens flagged:** `EASE_PRESS`, `DUR_PRESS`, `DUR_FEEDBACK`, `DUR_MICRO`, `DUR_MORPH`,
> `pressVariants`, `sheetVariants`, `scrimVariants`, `staggerFor`, `heartbeatPulse`. None
> introduce a **new value** into the design system — each is a JS mirror of a CSS custom prop
> that already lives in `styles/root-fixes.css` (lines 93–105) or a composition of existing
> springs/eases. They are *exports*, not new design decisions.

### 9.2 The CSS custom-prop mirror (already shipped — the contract)

The JS consts above are the *typed mirror* of these `:root` props. The invariant a reviewer
enforces: **every duration/ease used in framer-motion has a CSS twin and vice-versa.**

```css
/* styles/root-fixes.css :root — SHIPPED (lines 93–105). Source of truth. */
--lior-ease-silk:  cubic-bezier(0.16, 1, 0.3, 1);
--lior-ease-soft:  cubic-bezier(0.22, 1, 0.36, 1);
--lior-ease-press: cubic-bezier(0.2, 0, 0, 1);
--lior-ease-exit:  cubic-bezier(0.4, 0, 0.2, 1);
--lior-motion-press: 90ms;  --lior-motion-feedback: 140ms; --lior-motion-micro: 200ms;
--lior-motion-tab: 240ms;   --lior-motion-pop: 260ms;      --lior-motion-push: 360ms;
--lior-motion-modal: 380ms; --lior-motion-morph: 400ms;
```

**Single source of truth check (recommended dev guard).** Add to
`tests/motionExperience.assert.mjs`: parse the four `--lior-ease-*` props out of
`root-fixes.css`, parse `EASE_SILK/SOFT/PRESS/EXIT` out of `motion.ts`, assert the four arrays
equal the four cubic-bezier tuples. This makes drift a failing test, not a code-review
eyeball. The assert file already proves keyframes *exist* and stay transform/opacity-only;
this closes the JS↔CSS loop.

---

### 9.3 Framer-motion specification patterns

#### 9.3.1 `MotionConfig` — already wired, do not touch

`index.tsx:3,116` wraps `<App/>` in `<MotionConfig reducedMotion="user">`. This is the global
reduced-motion switch: every framer animation degrades to opacity-only automatically.
**Consequence for every primitive below:** you do **not** branch on `prefersReducedMotion()`
inside a framer component for the *framer* animation — `MotionConfig` already handles it. You
*do* branch when you drive a CSS class or an imperative DOM write (e.g. `useTileOpen`, which
checks the media query itself, hooks/useTileOpen.ts:51), because those bypass framer.

#### 9.3.2 The four canonical variant patterns

| Pattern | Source const | Use |
|---|---|---|
| **Reveal** | `revealVariants` + `inViewOnce` | single element fades + rises into view |
| **Stagger** | `staggerContainer(staggerFor(n))` + `staggerItem` | lists / grids / bento |
| **Press** | `pressVariants` | tactile button/card down-stroke |
| **Modal/Sheet** | `sheetVariants` + `scrimVariants` | in-React bottom sheets (non-route) |

All four already settle with critically-damped springs (no overshoot) or silk tweens, so they
read as one family. The only allowed overshoot in the whole app is the ~0.3% release on
`.spring-press` (`index.css:1691`) — do not add bounce anywhere else.

---

### 9.4 Spring presets table (build reference)

| Preset | stiffness | damping | mass | Feel | Consumers |
|---|---|---|---|---|---|
| `springSmooth` | 260 | 30 | 0.9 | silky settle, default | `<Reveal>`, `<Stagger>` items, list reveals, `revealVariants` |
| `springSnappy` | 460 | 34 | 0.7 | quick, decisive | toggles, segmented controls, chip select, `BottomNav` pill sync |
| `springGentle` | 170 | 26 | 1.0 | slow, soft, large surfaces | `<Sheet>` settle, `<Pressable>` release, hero/large-card motion |

Tween fallbacks (when a spring would overshoot a layout-affecting value): `tweenSilk(d)` for
entrances, `tweenSoft(d)` for exits. Route-level motion never uses these — it uses
`TransitionEngine` + the CSS `lior-vt-*` keyframes.

**Rule of thumb for picking:** does the motion *travel* (position/size)? `springSmooth`. Is it
a *state flip* (on/off, selected)? `springSnappy`. Is it a *large soft surface* (sheet, hero
card, full-bleed)? `springGentle`. Is it a *press*? `pressVariants` (not a raw spring).

---

### 9.5 Reusable animation primitives to build

All primitives live in a new folder `components/motion/` (many small files, one component
each). Each imports from `utils/motion.ts` — zero inline numbers.

#### 9.5.1 `<Reveal>` — single-element scroll/mount reveal

`components/motion/Reveal.tsx`

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { revealVariants, inViewOnce } from '../../utils/motion';

interface RevealProps {
  children: ReactNode;
  /** ms delay before this element reveals (use sparingly; prefer <Stagger>). */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
  className?: string;
}

export function Reveal({ children, delay = 0, as = 'div', className }: RevealProps) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}                       // { once:true, margin:'0px 0px -40px 0px' }
      variants={revealVariants}                   // {opacity:0,y:16} -> springSmooth
      transition={delay ? { delay: delay / 1000 } : undefined}
    >
      {children}
    </Tag>
  );
}
```

**Perf notes:** `whileInView` + `once:true` means the IntersectionObserver detaches after first
reveal — no ongoing cost. `MotionConfig` collapses this to opacity-only under reduce-motion.
Never wrap a long scrolling list's *items* in `<Reveal>` (N observers); use `<Stagger>` which
uses ONE container observer.
**Consumers:** Home masthead blocks (`views/Home.tsx`), `views/Us.tsx` milestone/growth
cards, `views/Premium.tsx` feature rows, `views/MemoryTimeline.tsx` section headers,
`DailyMoments.tsx` prompt card.

#### 9.5.2 `<Stagger>` — list/grid orchestration (ONE observer)

`components/motion/Stagger.tsx`

```tsx
import { motion } from 'framer-motion';
import { Children, type ReactNode } from 'react';
import { staggerContainer, staggerItem, staggerFor, inViewOnce } from '../../utils/motion';

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** override auto step; default adapts to child count via staggerFor(). */
  step?: number;
}

export function Stagger({ children, className, step }: StaggerProps) {
  const count = Children.count(children);
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}
      variants={staggerContainer(step ?? staggerFor(count))}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={staggerItem}>{child}</motion.div>
      ))}
    </motion.div>
  );
}
```

**Perf notes:** the *container* holds the only observer; children inherit `visible` through
variant propagation — no per-child observer. `staggerFor(n)` caps the full-reveal window at
~480ms so a 30-item Timeline doesn't animate for 2 seconds. `staggerItem` is
transform+opacity only (`y:18, scale:0.98`), compositor-safe.
**Consumers:** Home **bento grid** (the tiles), `views/Us.tsx` stat tiles,
`views/MemoryTimeline.tsx` memory cards, `views/KeepsakeBox.tsx` grid,
`RecapCarousel` slide contents, `views/Countdowns.tsx` list, `views/OpenWhen.tsx` letter grid.

#### 9.5.3 `<Pressable>` — tactile down-stroke + correct haptic

`components/motion/Pressable.tsx`

The global `index.tsx` pointer handler already gives *every* tappable a CSS `data-pressing`
scale (with scroll-cancellation). `<Pressable>` is for surfaces that want a **framer-driven**
press (so press state can compose with other framer transforms) *and* a **semantically correct
haptic** on the actual product action. It must NOT double-fire visuals: opt the element out of
the global CSS press with `data-no-press` (honoured at index.tsx:39).

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { pressVariants } from '../../utils/motion';
import { Haptics } from '../../services/haptics';

type Weight = 'light' | 'medium' | 'heavy';
const HAPTIC: Record<Weight, () => void> = {
  light:  () => void Haptics.tap(),     // nav, row, chip
  medium: () => void Haptics.press(),   // standard button / card
  heavy:  () => void Haptics.heavy(),   // FAB / primary CTA / hard confirm
};

interface PressableProps {
  children: ReactNode;
  onPress: () => void;
  weight?: Weight;          // selects the haptic rung (services/haptics.ts ladder)
  className?: string;
  disabled?: boolean;
}

export function Pressable({ children, onPress, weight = 'medium', className, disabled }: PressableProps) {
  const reduce = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  return (
    <motion.button
      type="button"
      data-no-press                       // opt OUT of global CSS press; framer owns it
      className={className}
      disabled={disabled}
      variants={pressVariants}
      animate={pressed && !reduce ? 'pressed' : 'rest'}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => {
        if (disabled) return;
        HAPTIC[weight]();                  // haptic on EXPLICIT action (index.tsx rule)
        onPress();
      }}
    >
      {children}
    </motion.button>
  );
}
```

**Critical correctness note discovered in source:** `services/haptics.ts` currently maps
`press()` and `heavy()` to `ImpactStyle.Light`/`Medium` respectively (lines 228, 239) — the
Android impact ladder is compressed. `<Pressable weight>` is the *single* place call-sites
should select a rung, so when the native ladder is re-tuned, every button benefits without
touching call-sites. Do not call `CapHaptics` directly anywhere.
**Haptic-rule compliance:** haptic fires in `onClick` (an explicit product action), never in
`onPointerDown`, satisfying the documented index.tsx rule (no haptics on raw pointerdown).
**Consumers:** Home heartbeat button (`heavy`), `BottomNav` center FAB (`heavy`), every primary
CTA in `Premium.tsx` (`heavy`), standard card taps that aren't navigations (`medium`), ghost/
back buttons (`light` — prefer `Haptics.softTap()` via a `weight='light'` extension if you want
the softer rung).

#### 9.5.4 `<SharedHero name>` — shared-element via View Transitions

`components/motion/SharedHero.tsx`

The route layer already runs the **native View Transitions API**
(`utils/TransitionEngine.ts:177`). A shared element is achieved by giving the *same*
`view-transition-name` to the element on both the source and destination screen; the browser
tweens it across the route commit for free (no framer `layoutId`, no FLIP cost on the main
thread). This is the visionOS/Photos "the thumbnail *becomes* the detail" effect.

```tsx
import type { CSSProperties, ReactNode } from 'react';

interface SharedHeroProps {
  /** MUST be unique per logical element and identical on source + destination.
   *  Convention below. Sanitize ids — VT names can't contain spaces/slashes. */
  name: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SharedHero({ name, children, className, style }: SharedHeroProps) {
  // viewTransitionName is a real CSS prop in Chromium 111+ WebView (our target).
  return (
    <div className={className} style={{ ...style, viewTransitionName: vtName(name) }}>
      {children}
    </div>
  );
}

/** Namespacing convention — keeps names collision-free and debuggable. */
export const vtName = (raw: string) =>
  `lior-hero-${raw.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
```

**`view-transition-name` conventions (the contract):**
- `lior-hero-memory-<id>` — a Timeline thumbnail ↔ Memory detail image.
- `lior-hero-tile-<key>` — a Home bento tile ↔ its destination header (e.g. `tile-duet`,
  `tile-keepsake`). Pairs with the **expand** origin (§9.6).
- `lior-hero-avatar-<userId>` — partner avatar on Home ↔ Profile/Us header.
- `lior-hero-letter-<id>` — OpenWhen envelope ↔ opened letter.
- Only **one** element may hold a given name *per document at a time*. If two screens are both
  mounted (keep-alive shells!), the cached/hidden one must NOT carry the name. Gate it: apply
  the name only when the shell is `is-active`. Helper:

```tsx
// Apply VT name only on the active shell to avoid duplicate-name aborts.
export const heroNameIf = (active: boolean, raw: string) =>
  active ? vtName(raw) : undefined;
```

**Why not framer `layoutId`?** Because keep-alive shells keep both screens mounted; framer
shared-layout would try to FLIP between two live trees on the main thread (jank on mid Android),
and it fights the View Transitions snapshot the engine already takes. VT names ride the
compositor. **Never mix the two on the same element.**
**Consumers:** `MemoryTimeline.tsx` → memory detail; Home tile → destination header
(`views/DuetJournal.tsx`, `views/KeepsakeBox.tsx`, `views/TimeCapsule.tsx`); `OpenWhen.tsx`
envelope → letter; partner avatar Home ↔ `Profile.tsx`/`Us.tsx`.

#### 9.5.5 `<Sheet>` — in-React bottom sheet (non-route surfaces)

`components/motion/Sheet.tsx`

For surfaces that are **not** route-level (route sheets use `TransitionEngine.navigate('modal')`
and the `lior-vt-modal-*` keyframes). This is for an in-place sheet over the current screen
(e.g. a quick action picker, a mood entry). It mirrors the modal keyframes exactly via
`sheetVariants`/`scrimVariants` so the two systems feel identical.

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useEffect } from 'react';
import { sheetVariants, scrimVariants } from '../../utils/motion';
import { Haptics } from '../../services/haptics';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** aria-label for the dialog region */
  label: string;
}

export function Sheet({ open, onClose, children, label }: SheetProps) {
  useEffect(() => {
    if (open) void Haptics.heavy();        // modal-open = Heavy (haptics.ts mapping)
  }, [open]);

  return (
    <AnimatePresence onExitComplete={() => void Haptics.press() /* close = Medium */}>
      {open && (
        <>
          <motion.div
            className="sheet-scrim"
            variants={scrimVariants}
            initial="hidden" animate="visible" exit="hidden"
            onClick={onClose}
            data-no-press                    // backdrop must not visibly scale
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={label}
            className="sheet-panel kb-dock"  // kb-dock = keyboard system primitive
            variants={sheetVariants}
            initial="hidden" animate="visible" exit="exit"
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
          >
            <div className="sheet-grabber" aria-hidden />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Perf notes:** `drag="y"` with a 120px / 600px-velocity dismiss threshold mirrors the route
engine's `COMMIT_FRAC`/`COMMIT_VEL` feel (TransitionEngine.ts:32–33) so the gesture grammar is
consistent. The scrim is a single opacity layer (no `backdrop-filter` — that's a paint cost the
fixed background can't afford; use a flat `rgba` warm tint). `kb-dock` integrates the existing
keyboard overlay system. **Reduced motion:** `MotionConfig` collapses the y-translate to a fade.
**Consumers:** quick-action picker, `DinnerDecider.tsx`, mood entry in `MoodCalendar.tsx`,
share/export pickers — any over-current-screen surface that isn't a full route.

#### 9.5.6 `useTileOpen` — usage (already shipped; the call pattern)

`hooks/useTileOpen.ts` is done. The build pattern for any tile that navigates:

```tsx
// In a bento tile (views/Home.tsx pattern):
const open = useTileOpen();
// ...
<div
  className="bento-card spring-press"          // findLiftTarget walks to .bento-card
  onClick={(e) => open(e, () => setView('keepsake'))}
  style={{ viewTransitionName: heroNameIf(true, 'tile-keepsake') }}
>
```

`open(e, navigate)` sets `--lior-open-x/y` to the tapped tile's centre, flags
`data-lior-open-expand`, adds `.tile-open-lifting` (the `tile-lift` keyframe, index.css:1738),
then calls `navigate()` in parallel. `TransitionEngine.navigate()` consumes the flag and
upgrades the `push` to `expand`, so the destination **blooms from the tapped tile**
(root-fixes.css:437 `transform-origin: var(--lior-open-x) var(--lior-open-y)`). Reduced motion →
instant navigate (useTileOpen.ts:54). **You do not write any of this — you only wire `open()`
and optionally a matching `view-transition-name`.**
**Consumers:** all Home bento tiles, and any card that opens a sub-screen.

#### 9.5.7 `useCountUp` — consolidate the two copies into one primitive

`hooks/useCountUp.ts` (new home; **delete** the duplicates in `views/Home.tsx:246` and
`views/MoodCalendar.tsx:555`). There are currently two divergent implementations (one takes
`inView`, one doesn't; different default durations 1800 vs 1100). Unify:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AnimationEngine } from '../utils/AnimationEngine';

interface CountUpOptions {
  /** only run when this becomes true (pair with useInView). Default true. */
  active?: boolean;
  durationMs?: number;     // default 1800 (matches Home hero)
}

/**
 * Eased count-up. Subscribes to the SINGLE AnimationEngine RAF loop — never
 * calls requestAnimationFrame directly (AnimationEngine.ts is the only owner).
 * easeOutCubic, integer rounding, honours reduced-motion (snaps to target).
 */
export function useCountUp(target: number, { active = true, durationMs = 1800 }: CountUpOptions = {}) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    if (target <= 0) { fromRef.current = 0; setValue(0); return; }

    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { fromRef.current = target; setValue(target); return; }

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    const startTs = performance.now();
    const id = `countup-${Math.random().toString(36).slice(2)}`;
    AnimationEngine.register({
      id, budgetMs: 0.1, minTier: 'css-only', priority: 2,
      tick: (_d, ts) => {
        const p = Math.min((ts - startTs) / durationMs, 1);
        const eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic (matches Home)
        const next = Math.round(from + delta * eased);
        fromRef.current = next;
        setValue(next);
        if (p >= 1) AnimationEngine.unregister(id);
      },
    });
    return () => AnimationEngine.unregister(id);
  }, [target, active, durationMs]);

  return value;
}
```

**Why route through `AnimationEngine`:** the codebase rule (AnimationEngine.ts:5) is "No
component may call `requestAnimationFrame` directly." Both current copies violate it. Routing
the count through the single loop also means count-ups *pause when the tab is hidden* (engine
visibility handling, AnimationEngine.ts:157) and don't fight the ambient layers.
**Consumers:** Home hero "days together" (`views/Home.tsx:322`), `MoodCalendar.tsx` score
(`:582`), `views/Us.tsx` stat tiles (memory count, streak), `WeeklyRecap` numbers.

#### 9.5.8 `<Celebrate>` — milestone burst (wraps existing confetti + haptic)

`components/motion/Celebrate.tsx`

A `feedback.celebrate()` call already fires from ~18 sites (KeepsakeBox, DuetJournal, Premium,
DailyMoments, BonsaiBloom, etc.). There is also a deferred `PhysicsConfetti` / `useConfetti`
system (`components/DeferredOverlays.tsx`, `components/Layout.tsx`). `<Celebrate>` is the *one*
declarative trigger that fires **both** in lockstep so the visual and haptic land on the same
frame — today they're called separately and can desync.

```tsx
import { useEffect } from 'react';
import { useConfetti } from '../Layout';
import { Haptics } from '../../services/haptics';

interface CelebrateProps {
  /** flip to true on the moment (e.g. streak hit). Fires once per true-edge. */
  fire: boolean;
  /** 'milestone' = quiet triple, 'celebrate' = 5-beat escalate (haptics.ts). */
  intensity?: 'milestone' | 'celebrate';
}

export function Celebrate({ fire, intensity = 'celebrate' }: CelebrateProps) {
  const confetti = useConfetti();
  useEffect(() => {
    if (!fire) return;
    // Same frame: haptic + visual. celebrate() bypasses the global gate
    // internally (it's a sequence), so it won't be swallowed by scroll suppress.
    if (intensity === 'celebrate') void Haptics.celebrate(); else void Haptics.milestone();
    confetti?.trigger?.();        // no-op until the lazy PhysicsConfetti resolves
  }, [fire, intensity, confetti]);
  return null;
}
```

**Perf notes:** `PhysicsConfetti` is lazy and only mounts on demand (DeferredOverlays.tsx) — it
never costs anything until a celebration. The confetti canvas should set `data-no-press` and
must not run while `data-transitioning='1'` (it's decorative; skip it during a route change).
**Reduced motion:** the confetti system should early-return on reduce; the haptic still fires
(haptics are not motion). **Consumers:** replace the bare `feedback.celebrate()` calls in
`views/Premium.tsx:533`, `DuetJournal.tsx:527/534`, `KeepsakeBox.tsx:355`, `BonsaiBloom.tsx`,
`Surprises.tsx`, `TimeCapsule.tsx`, `SpecialDates.tsx`, `MemoryTimeline.tsx:1369` with a
mounted `<Celebrate fire={...}/>` so visual+haptic are coupled.

#### 9.5.9 `<HeartbeatPulse>` — the romantic ambient pulse (Aura/Pulse)

`components/motion/HeartbeatPulse.tsx` — wraps any element in the `heartbeatPulse` loop
(≥2000ms, §9.1) and optionally drives the synchronous RAF haptic
(`Haptics.heartbeatPulseSync()`, haptics.ts:328) on the peak.

```tsx
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { heartbeatPulse } from '../../utils/motion';

export function HeartbeatPulse({ children, active }: { children: ReactNode; active: boolean }) {
  return (
    <motion.div variants={heartbeatPulse} animate={active ? 'beat' : undefined}
      style={{ willChange: active ? 'transform' : 'auto' }}>
      {children}
    </motion.div>
  );
}
```

**Consumers:** `views/AuraSignal.tsx` (Pulse) presence orb, Home heartbeat button idle state,
`DailyQuestion.tsx` "waiting for partner" indicator. The ≥2s loop guarantees it never competes
with gesture feedback (the prime-directive ambient-loop rule).

---

### 9.6 Shared-element architecture — the `expand` origin contract

The premium "the tile *becomes* the page" effect is the spine of Lior navigation. It is a
**three-part handshake** already implemented across three files; a developer adding a new
expandable surface only wires the three touch-points:

```
┌─ 1. SOURCE TILE (views/Home.tsx) ────────────────────────────────────────────┐
│  useTileOpen(): on tap, sets                                                   │
│    --lior-open-x / --lior-open-y  = tapped tile centre (viewport px)           │
│    data-lior-open-expand = '1'                                                 │
│    .tile-open-lifting    (tile-lift keyframe, index.css:1738 — card picks up)  │
│  Optional: viewTransitionName = vtName('tile-<key>')                           │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           │ navigate() fires in parallel
┌──────────────────────────▼─ 2. ENGINE (utils/TransitionEngine.ts:147) ───────┐
│  navigate('push', commit): sees data-lior-open-expand → upgrades to 'expand'  │
│  sets html[data-vt-dir="expand"], runs native View Transition                 │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼─ 3. CSS (styles/root-fixes.css:437) ──────────────┐
│  html[data-vt-dir="expand"]::view-transition-new(root) {                      │
│    transform-origin: var(--lior-open-x,50%) var(--lior-open-y,50%);           │
│    animation: --lior-motion-push --lior-ease-silk lior-vt-expand-in;          │
│  }  → destination scales up FROM the tapped tile's exact centre               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Two coexisting shared-element modes — when to use which:**

1. **`expand` origin (whole-page bloom).** Use when the destination has *no single element*
   that maps to the tile — it just "opens" from there. This is the default for Home tiles.
   Wire: `useTileOpen` only.
2. **`view-transition-name` pair (true element morph).** Use when a specific element on the
   source (a thumbnail, an avatar, an envelope) persists into the destination as a header/hero.
   Wire: identical `vtName(id)` on both elements, gated to the active shell via `heroNameIf`.
   You can combine *both* — a tile bloom that also morphs its cover image — because VT names and
   the root expand animate independently (group `root` vs named groups).

**Keep-alive hazard (must-read):** tabs use keep-alive shells where every visited root tab
stays mounted and switching is a visibility flip (`.keep-alive-shell.is-cached/is-active`,
root-fixes.css:171–197). Two mounted screens must never both expose the same
`view-transition-name`, or the browser aborts the transition. **Always** gate names with
`heroNameIf(shell.isActive, id)`. The `expand` origin has no such hazard (it's a single root
group).

---

### 9.7 Performance-safe implementation notes (per primitive, consolidated)

| Primitive | GPU/CPU guard | Reduced-motion path | Background harmony |
|---|---|---|---|
| `<Reveal>` | one IO, detaches after `once` | `MotionConfig` → opacity-only | transform+opacity only; no paint |
| `<Stagger>` | ONE container IO; `staggerFor` caps window | `MotionConfig` → opacity-only | child `y/scale` only |
| `<Pressable>` | `data-no-press` avoids double visual; spring on release | `useReducedMotion` skips scale | tiny scale, no shadow churn |
| `<SharedHero>` | compositor VT snapshot, no main-thread FLIP | engine `_xfade` crossfade | rides VT group; engine pauses ambient via `data-transitioning` |
| `<Sheet>` | flat rgba scrim (NO `backdrop-filter`) | y→fade via `MotionConfig` | no blur over the fixed stage |
| `useTileOpen` | pure CSS keyframe, animationend cleanup | instant navigate (self-checks mq) | `data-transitioning` pauses ambient during push |
| `useCountUp` | single `AnimationEngine` RAF, auto-pauses hidden | snaps to target | budgetMs 0.1, runs at any tier |
| `<Celebrate>` | lazy `PhysicsConfetti`, on-demand mount | confetti early-returns; haptic still fires | skip while `data-transitioning` |
| `<HeartbeatPulse>` | ≥2000ms loop; `will-change` toggled off when idle | `MotionConfig` → static | ambient-loop rule: never competes |

**Universal guards (enforce in review):**
1. **No raw `requestAnimationFrame`** outside `AnimationEngine` (AnimationEngine.ts:5). Count-ups,
   progress rings, any per-frame work → `AnimationEngine.register`.
2. **No `backdrop-filter`** in any foreground motion layer — it forces a full-screen paint that
   collides with the fixed `AmbientVisuals` stage. Warm flat `rgba` only.
3. **Transform + opacity only** for anything that animates — asserted for the route keyframes by
   `tests/motionExperience.assert.mjs`; extend the same discipline to component motion.
4. **`will-change` is transient** — set it during the animation, clear it on settle (the engine
   and `tile-lift` already do this). A permanent `will-change: transform` on many elements
   exhausts GPU memory on mid Android.
5. **Haptics only on explicit product actions** (index.tsx documented rule) — `<Pressable>`
   fires in `onClick`, never `onPointerDown`; `<Celebrate>`/`<Sheet>` fire on the semantic
   moment. Never call `CapHaptics` directly; always go through `services/haptics.ts`.
6. **Respect `data-transitioning`** — decorative/heavy layers (confetti, R3F, pulse) must check
   it and skip work so the route transition owns the full GPU budget.

---

### 9.8 Primitive → screen consumption map (the wiring checklist)

| Screen / surface | Primitives consumed |
|---|---|
| **Home** (`views/Home.tsx`) | `<Stagger>` (bento), `useTileOpen` (every tile), `useCountUp` (hero days), `<Pressable>` (heartbeat = heavy), `<HeartbeatPulse>` (idle heart), `<SharedHero>` (avatar, tile covers) |
| **Timeline** (`views/MemoryTimeline.tsx`) | `<Stagger>` (cards), `<SharedHero>` (`memory-<id>` → detail), `<Reveal>` (section headers), `<Celebrate>` (`:1369`) |
| **Daily Questions** (`DailyQuestion.tsx`, `views/DailyMoments.tsx`) | `<Reveal>` (prompt), `<HeartbeatPulse>` (awaiting partner), `<Celebrate>` (`:716`), partner-response reveal uses `lior-vt-expand` if promoted, else `revealVariants` |
| **Us** (`views/Us.tsx`) + **Profile** | `useCountUp` (stats), `<Stagger>` (milestones/growth), `<Reveal>`, `<SharedHero>` (avatar) |
| **Premium** (`views/Premium.tsx`) | `<Reveal>` (feature rows), `<Pressable weight="heavy">` (CTA), `<Celebrate>` (`:533`) |
| **DuetJournal** (`views/DuetJournal.tsx`) | `<Stagger>` (entries), `<Pressable>` (turn submit), `<Celebrate>` (`:527/534`), `<SharedHero>` (tile → header) |
| **Aura/Pulse** (`views/AuraSignal.tsx`) | `<HeartbeatPulse>` (orb), `<Celebrate>` (`:165`), `doubleBeat` haptic on signal received |
| **VoiceNotes** (`views/VoiceNotes.tsx`) | `<Stagger>` (clips), `<Pressable>` (record = heavy), `<Celebrate>` (`:482`) |
| **OpenWhen** (`views/OpenWhen.tsx`) | `<Stagger>` (envelopes), `<SharedHero>` (`letter-<id>`), `<Celebrate>` (`:237`) |
| **KeepsakeBox / TimeCapsule / Countdowns / Surprises** | `<Stagger>`, `useTileOpen` from Home, `<Celebrate>` |
| **MoodCalendar** | `useCountUp` (score `:582`), `<Sheet>` (mood entry), `<Celebrate>` (`:1442`) |
| **RecapCarousel / WeeklyRecap** | `<Stagger>` (slide contents), `useCountUp` (numbers), `<Celebrate>` (finale) |
| **OurRoom / BonsaiBloom / CocoPet** | `Haptics.dragPickup/dragDrop` (drag), `<Celebrate>` (BonsaiBloom `:1044`), pulse on growth |
| **BottomNav** (`components/BottomNav.tsx`) | already WAAPI pill (240ms silk); `<Pressable weight="heavy">` for center FAB, `weight="light"` tabs |
| **Sheets/pickers** (`DinnerDecider`, share, quick-action) | `<Sheet>` + `<Pressable>` rows |

---

### 9.9 Build order (so it lands without churn)

1. **Extend `utils/motion.ts`** (§9.1) — exports only, no behavior change. Add the JS↔CSS
   assert (§9.2). *Risk: none — additive.*
2. **`hooks/useCountUp.ts`** — unify; replace the two copies; route through `AnimationEngine`.
   *Risk: low — same easing/output, removes a RAF-rule violation.*
3. **`components/motion/` primitives** — `Reveal`, `Stagger`, `Pressable`, `Sheet`, `SharedHero`,
   `Celebrate`, `HeartbeatPulse`. One file each, all importing motion.ts. *Risk: low — new files.*
4. **Wire by screen** per §9.8, starting with Home (highest-visibility, exercises the most
   primitives), then Timeline (shared-hero), then the comms surfaces.
5. **Verify:** run `tests/motionExperience.assert.mjs` (keyframes intact + transform/opacity
   only), confirm reduce-motion collapses everything to opacity, profile a Home→Timeline
   shared-hero push on a mid Android device (target: route lands ≥ the engine's intended frame
   budget with ambient paused via `data-transitioning`).

Everything above composes with the shipped fluid-motion redesign — it adds the *component-level*
vocabulary that the route/CSS/haptic layers were already built to host. No layer is replaced;
the four existing systems (`TransitionEngine`, `motion.ts`, `services/haptics.ts`,
`AnimationEngine`) remain the single sources of truth, and every new primitive is a thin,
typed, compositor-safe consumer of them.
