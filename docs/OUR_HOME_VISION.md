# OUR HOME — the vision

*One room. Two keys. Everything either of you touches stays warm.*

> Synthesized 2026-07-02 from a six-concept / three-judge design workflow
> (lenses: presence, placement-craft, memory-diary, growth-architecture,
> time-and-weather, heretic; judges: emotional truth, game feel, buildability).
> This document is the contract for `components/our-home/` + `views/OurRoom.tsx`.

---

## 1. The fantasy

You open the app at 11:40pm and you are not checking a feed — you are coming home.
The room is plum-dark, rain running down your window while your partner's window
holds a sky you don't have; their lamp across the room is not lit but not dark
either, a cooling amber ember that says *just missed them*. Their coffee cup is on
the table. The chair has moved — you tap it and watch it slide the path her hand
dragged it. A note in her actual finger-writing is stuck to your lamp: "sleep
well ❤". Coco is asleep exactly where she last sat. Nothing happened, yet
everything happened. Our Home is a single hand-drawn room that two people keep
alive across distance, where every object remembers the last hand on it, every
possession exists because of something the two of you actually lived, and the last
act of every night is leaving one lamp burning for the other person's morning. It
is not a game inside a couples app. It is where the relationship lives — and the
ache it manufactures, on purpose, is *I wonder what our home looks like right now.*

---

## 2. The scene

**Perspective.** Straight-on dollhouse elevation — one room seen dead-level, like a
theatre set or a New Yorker interior cross-section. Never isometric (isometry says
"game"; a flat elevation says "illustration of a life"). The back wall is parallel
to the screen; the floor is a shallow hand-drawn trapezoid giving exactly **three
depth lanes** (back-wall lane, mid lane, foreground lane) — enough for overlap and
shadow play, zero projection math. Portrait-native; the camera never cuts.

**Construction.** Four layered inline SVG groups, each object its own `<g>` with
its own shadow ellipse:

1. **Sky layer** — one gradient rect per window, clipped to the window arches.
2. **Architecture shell** — cream plaster walls, honey floorboards with woodgrain
   strokes, two arched windows, front door + doormat, the cupboard, the cold
   hearth grate, the bare doorframe.
3. **Furnishings** — every movable object, per-lane z-order.
4. **Light & air** — lamp pools, the daylight wedge, dust motes, steam.

**Line & fill.** Hand-inked vector: 1.5–2px outlines in warm sepia (never pure
black), deliberately imperfect ellipses, flat fills plus exactly one darker
sibling-shade per object. A storybook interior, not a game asset.

**Palette.** Cream plaster `#F6EFE4`, honey-oak and walnut woods, wine `#7A3B4A`
and dusty-rose `#C9909A` textiles, soft-gold `#DFAE66` and brass metals, sage
plant greens, deep-plum ink. Saturation low and warm. Candy pink does not exist.

**Lighting rules (non-negotiable).**
- **No blend modes, ever.** All light is plain alpha radial/linear gradients.
- **Two windows, two skies.** Left window renders *your* sky, right renders
  *theirs*: a 24-stop color track interpolated by each city's local hour — pure
  timezone math, no API.
- **One air-tint layer.** Pale-gold 6% at dawn → clear noon → amber dusk → plum
  20% at night. Lamps punch pools of gold *through* the plum. The scene may be
  midnight; UI chrome is always warm cream.

**Motion law.** Transform + opacity only. 120–600ms interactions, ≤900ms ambient.
Ease-out; things *come to rest*. Zero bounce, overshoot, elastic, animated blur.
Ambient budget: **max 3 concurrent loops**, enforced.

**Voice.** The home never narrates. ~A dozen written lines total, every one either
provenance or partner-authored.

---

## 3. The placement craft

One canonical grammar, all one-thumb:

- **LIFT** — 200ms hold: rise 6px, scale 1.03 (160ms ease-out); shadow spreads
  (scaleX 1.35) and fades (0.5→0.28); air deepens 5%; light haptic tick.
- **GUIDE** — no grid. Valid seats reveal as hairline warm-gold strokes drawn
  along the architecture (shelf edge, tabletop, picture rail, sill, floor lanes).
  Nearest seat breathes. Invalid zones never flash red — they offer no line.
- **CARRY** — strict 1:1 tracking, object floats **56px above the fingertip**;
  2° lean into motion; shadow reads altitude.
- **CATCH** — within 24px, the magnet eases the final distance (~100ms pull, never
  teleport); 1px gold tick at the alignment axis; crisp haptic click.
- **HYSTERESIS** — leaving a locked seam takes a 12px resistance band. Your
  partner's arrangement can never be destroyed by an accidental brush.
- **ROTATE** — no free rotation. While held, tap steps through 2–3 hand-drawn
  facings (120ms cross-dissolve + tick).
- **NUDGE** — tap a placed object: 4s window of 1:2-ratio fine drag.
- **STACK** — small objects seat *on* large ones via per-surface seat points.
  Mess is legal; releases glide to the nearest valid seat — never an error state.
- **SETTLE** — drop 6px over 160ms; shadow snaps sharp; three-fleck dust puff;
  medium "thock"; **warmth halo blooms gold from the contact point**. Light
  emitters bloom their pools on landing.
- **UNDO** — a pencil ghost of the previous spot lingers 60s; tap to drift back.
- **THE CUPBOARD** — no inventory screen. Hinged doors swing open to real shelves
  of miniatures; drag straight out into the room in one continuous gesture.
  A gap on a shelf is itself a trace.
- **SAVED YOU A SPOT** — plant a dotted outline + six-word note; your partner
  performs the real placement; the plaque forever reads *placed together*.
- **SYNC** — committed positions only, per-item merged; no live drag streaming.
- **HAPTICS** — lift: light · seam: click · facing: light · settle: medium thock.

---

## 4. Meaning system

- **The plaque.** Long-press a placed object: a paper tag unfurls — what it is,
  when it came home in **coarse warm time**, why it exists, a duotone photo slot.
- **Two inks.** Each partner owns an ink (wine / dusty gold) for handwriting and
  inscriptions. Ink is voice, never tally.
- **Name It.** A permanent hand-lettered nickname: *the arguing chair*.
- **The shoebox.** Peeled notes drop into a kraft shoebox in the cupboard —
  every note ever kept, in the writer's ink.
- **Nothing retires to a trash can.** Objects return to the cupboard with story
  intact. Redecorating curates history; it never deletes it.

---

## 5. Presence system

**Rule zero: every trace is strictly real or absent.** No simulated traces, ever.
**Rule one: coarse warm time only** — five phrases (*just now · a little while
ago · this morning/this evening · yesterday · a few days ago*). No minute-stamps,
no "online" indicators, anywhere.
**Rule two: trace budget** — at most three active traces plus the lamp.
**Rule three:** presence can be private (doorknob hold = quiet visit); deliberate
changes are never anonymous.

Traces: their lamp cooling gold→amber→out over ~2h (touch it: the room breathes
one shade warmer — *"Maya was here a little while ago"*) · the lamp left on for
your morning · warmth halos (~12h) · **Noticing** (rim-light → tap → the change
replays its committed path in 600ms → a soft glint returns to the mover) · ghost
outlines · the coffee cup steaming 30 real minutes then cold with a ring · raw
finger-stroke handwritten notes (peel → keep in shoebox or let flutter away) ·
the candle (thinking-of-you → flame in their view, gutters once seen) · Coco
asleep where the *other* partner last lingered · cupboard gap · cookie bites.

**Arrival:** door opens on your real local light; first read is their lamp; rim
lights breathe in staggered; nothing autoplays — you walk the room and find them.
Mornings: curtains closed until you draw them — one swipe floods daylight and
reveals every overnight halo at once.
**Quiet Hours:** both away 3+ days → light flattens grey-cream, dust motes, Coco
waits by the door; first touch wakes it with a 900ms warm radial wash. A held
breath, never a punishment.

---

## 6. Growth grammar

Nothing is bought. Nothing is numbered on screen. Nothing regresses. Every
arrival is a kraft parcel on the doormat — pull the twine, three calm unwrap
states; the *other* partner sweeps the torn paper, which is when the gift tag
reads to them. Parcels queue silently; nothing expires.

**Cardinal rule: rituals enrich warmth and living things — they never gate
structure.** Structure grows on calendar + memories alone.

| Signal | What appears |
|---|---|
| Day 1 | The room + the trousseau (~24 humble starters) + cold hearth |
| Day 2 | First parcel: the braided rug |
| Day 30 | The two-times clock |
| Day 100 | Mantel shelf + picture rail; first doorframe tick |
| Year 1+ | Heirloom parcels; a tick per year |
| Every saved memory | A clothbound spine for the small bookcase |
| Every 5th memory | A themed keepsake parcel |
| Daily question, both answered | An ember floats to the grate; **lifetime coals** (cold → kindling → steady → deep old coals — never ash); the sill pot advances (seed → bloom; blooms permanent) |
| Thinking of you | The candle in their window |

---

## 7. The return loop

**Morning (~60s):** draw the curtains — the day's light rakes the floorboards and
every overnight halo shows at once. Tap the coffee pot. Check the book — one
ribbon means they've answered and are waiting on you.
**Night (~90s):** a downward stroke dims the room; choose the one lamp to leave
burning; leave one thing behind. Closing the room **is** composing tomorrow's
morning for the other person.
**Zero guilt:** no streaks, counters, red dots, decay, or badges. Absence renders
as quiet, never as damage. The home never asks you to come back; it just keeps
being yours while you're gone.

---

## 8. Signature moments

1. **The Night Arrival** — plum room, two skies, a cooling lamp, her note on
   your lamp, Coco on her spot.
2. **The Window That Writes Back** *(fast-follow)* — fog re-condenses her
   finger-written words in original drawing order.
3. **The Waiting Handprint** *(fast-follow)* — the Two-Hand Door; one golden
   handprint waiting hours for its twin.

---

## 9. What we refuse

No coins/XP/levels/shop/rarity tiers · no streak chrome or decay · no
per-partner-colored contribution ledgers · no appointment mechanics or expiring
anything · no simultaneous-online requirements · no forensic presence
(timestamps, live status, dwell) · no fake traces · no notification-driven
presence · no isometric camera, avatars, confetti, badge modals · no bounce /
elastic / overshoot / animated blur / blend-mode lighting · no dark glass chrome ·
no free-angle rotation · no system voice · no social layer · no two-finger
load-bearing gestures · no procedural filler art.

---

## 10. MVP cut (this session)

**IN:** scene shell (4-layer SVG, two timezone skies, air tint, curtains, door,
cupboard, hearth) · full placement engine (lift/guide/carry/catch/hysteresis/
facings/nudge/stack/settle/halo/ghost/cupboard drag-out/saved-you-a-spot) ·
merge-safe sync on `our_room_state` · presence v1 (lamp warmth, lamp-left-on,
halos, Noticing replay + glint, ghost outlines, notes with raw stroke capture +
shoebox, cup steam/cold, Coco position, quiet-visit, Quiet Hours, budget 3) ·
meaning v1 (plaques, two inks, Name It, duotone photo) · growth v1 (parcel
pipeline, day 2/30/100, memory spines + every-5th keepsake, ember/coals ladder,
sill pot, candle) · rituals (curtain draw, coffee pot, night dim + choose lamp).

**OUT (fast-follows):** weather API rain/snow · fog-writing window · Two-Hand
Door + alcove · record player · mirror-light pairing · Worn Path patina · zoomed
shelf mode · wax pool states · lume anniversaries · any sound.

*Build the lamp first. Everything else is furniture; the lamp is the reason to
come home.*
