# Daily Drop — Design & Build Spec

> Replaces **Aura Board** (`MoodCalendar.tsx`) as the daily-return mechanic.
> One sealed, reciprocal, expiring "drop" per couple per day. The pull is the *state*,
> not the content: there is always a thing on Home that is either **waiting on you** or
> **waiting on them**, and it dies at midnight.

## 1. Product loop

```
 (midnight) ── new drop generated ──▶  YOUR TURN  ──tap──▶  respond
        ▲                                                       │
        │                                                  (submit)
        │                                                       ▼
   EXPIRED (gentle)                                      SEALED · waiting on partner
        ▲                                                       │
        │                                          partner submits (or you, if 2nd)
        │                                                       ▼
        └────────── seen ◀── REVEALED (the payoff) ◀── REVEAL READY (unseal animation)
```

Healthy-addiction levers, stacked: **curiosity gap** (sealed until both answer) +
**obligation** (a turn parked on someone) + **scarcity** (midnight expiry) +
**anticipation** (the reveal) + **variety** (rotating type so it never staletns).
No streaks-that-punish, no point economy. Missing a day is always gentle.

## 2. Per-viewer state machine

Derived from `responses` (keyed by stable user key) + `revealedAt` + `expiresAt` + now.

| State | Condition | Screen |
|---|---|---|
| `your_turn` | I have no response, not expired | Sealed drop, breathing; CTA "Open today's drop" |
| `waiting` | I responded, partner hasn't, not expired | Sealed; "Sealed · waiting on {partner}" + Nudge button |
| `reveal_ready` | both responded, I haven't seen reveal | Auto-play unseal animation → revealed |
| `revealed` | both responded, reveal seen | Both responses + match result + afterglow |
| `expired_missed` | expired, I never responded | Gentle "this one drifted by"; show partner's if any; "tomorrow →" |
| `expired_partial` | expired, only I responded | "You showed up 💛 {partner} missed today"; show mine |
| `expired_both_missed` | expired, neither responded | Soft "you both let this one rest"; "fresh one tomorrow" |

**No bad ends:** every state above renders a defined, warm screen. `pulse` type collapses
to `not_pulsed → pulsed_waiting → both_pulsed(bloom)`.

`reveal_ready` is detected by the view; it plays the reveal once, stamps a local
`seenReveal` marker (per drop id, localStorage) so it isn't replayed, then shows `revealed`.

## 3. Drop types (MVP roster — all text/tap, screenshot-safe, no media dependency)

Each is **symmetric** (both partners do the same action) and **reveal-gated**.

| id | interaction | sealed UI | revealed UI |
|---|---|---|---|
| `this_or_that` | tap 1 of 2 | two option cards | both picks + "matched!" if equal |
| `guess_my_mood` | pick my mood + guess partner's | mood palette ×2 | both moods + "you read them right" if guess hits |
| `did_they_know` | answer for me + guess partner's | options + guess | both answers + guess correctness |
| `finish_my_sentence` | complete a stem | stem + textarea | both completions side by side |
| `on_this_day` | react to a resurfaced memory | memory + textarea | both notes under the memory |
| `secret_window` | write "something I haven't told you" | intimate prompt + textarea | both reveals (lower frequency) |
| `the_dare` | confirm a tiny real action done (+optional note) | dare card + "Done" | both confirmations |
| `pulse` | one tap "thinking of you" | glowing orb, hold-to-send | shared bloom when both pulsed |

**Deferred to phase 2 (documented, not in rotation):** `blur` (photo that unblurs when both
send) — needs the media-capture flow; kept out of v1 so every shipped state is rock-solid.

`on_this_day` requires a real past memory; if none exists for today, the engine falls back
to the next type in rotation.

## 4. Deterministic selection (no server needed)

Both partners must independently compute the **same** type + content for a given date.

```
seed   = hash(coupleId + '|' + date)          // 32-bit
type   = weightedPick(ROTATION_WEIGHTS, seed)  // seeded, deterministic
if type == yesterdayType(coupleId, dateMinus1) -> reroll with seed+1   // never 2 days running
if type == 'on_this_day' and no throwback memory -> next eligible type
content = bank[type][ hash(seed + type) % bank[type].length ]
```

`ROTATION_WEIGHTS` (easy frequent, heavy occasional):
`pulse 5, this_or_that 5, guess_my_mood 4, did_they_know 4, on_this_day 4,
finish_my_sentence 3, the_dare 3, secret_window 2`.

Content is **denormalized into the saved row** (`prompt`) on first generation, so a later
bank edit never changes an in-flight drop.

## 5. Data model (`types.ts`)

```ts
export type DropType =
  | 'this_or_that' | 'guess_my_mood' | 'did_they_know' | 'finish_my_sentence'
  | 'on_this_day' | 'secret_window' | 'the_dare' | 'pulse';

export interface DropPrompt {
  type: DropType;
  title: string;
  subtitle?: string;
  options?: { id: string; label: string; emoji?: string }[]; // this_or_that, guess_my_mood, did_they_know
  sentenceStem?: string;                                      // finish_my_sentence
  dare?: string;                                              // the_dare
  memoryId?: string;                                          // on_this_day (resolved at render)
}

export interface DropResponse {
  userKey: string;     // stable per-partner key (partnerUserId || myName)
  name: string;        // display name at answer time
  value: string;       // option id / mood id / text / 'pulsed'
  guess?: string;      // guess_my_mood / did_they_know: my guess of partner's value
  createdAt: string;   // ISO
}

export interface DailyDrop {
  id: string;          // `${coupleId}_${date}`
  coupleId: string;
  date: string;        // YYYY-MM-DD device-local (getLocalDateString)
  type: DropType;
  prompt: DropPrompt;
  responses: Record<string, DropResponse>;  // keyed by userKey — MERGE, never overwrite
  revealedAt?: string; // ISO when both present
  createdAt: string;
  expiresAt: string;   // ISO = next local midnight
}
```

`ViewState`: **add** `'daily-drop'`. (Leave `'mood-calendar'` in the union to avoid a
removal cascade through `MoodCalendar.tsx`/`AuraRewind.tsx`; the tile is what's removed.)

## 6. Storage (`services/storage.ts`) — clobber-safe collection

Follow the `dailyPhotos` pattern exactly (no media prefix):
- `CACHE_KEYS.DAILY_DROPS = 'lior_daily_drops'`
- `DATA_CACHE.dailyDrops: DailyDrop[]`
- register in `CONTENT_COLLECTION_STORES` + `init()` load + account-scoped restore
- `handleCloudUpdate` / `handleCloudDelete` routing for table `daily_drops`

**Critical merge rule (prevents the audit's clobber bug):** `responses` is a per-userKey
map. On every write — local save AND cloud-in — **union** responses by `userKey`, keeping the
newer `createdAt` on collision. Never blind-replace the row's `responses`. Set `revealedAt`
the moment both partners' keys are present.

Service API:
```ts
getTodayDrop(profile): DailyDrop            // generate-if-absent via dropEngine, persist
submitDropResponse(value: string, guess?: string): void   // read→merge my response→save→push
deleteDailyDrop(id): void
// internal: mergeDropResponses(local, incoming): DailyDrop
```

Local-first: works with no `.env` (queues locally; cloud push when `SupabaseService.init()`).

## 7. Cloud (Supabase migration — additive, user applies later)

`daily_drops(id text pk, couple_id text, date text, type text, prompt jsonb,
responses jsonb, revealed_at timestamptz, created_at timestamptz, updated_at timestamptz)`
+ index on `(couple_id, date)` + RLS: couple members read/write their own rows
(reuse the `couple_memberships` pattern from existing migrations). Realtime publication so
`sync.ts` delivers `handleCloudUpdate('daily_drops', row)`.

## 8. Notifications (`services/notifications.ts` + edge fn)

- **Local morning reminder**: new `'daily-drop'` kind in prefs + `applySchedule()`; copy
  "Today's drop is waiting 🎁"; `extra.view='daily-drop'`.
- **Partner push** (`send-partner-nudge` new `type:'daily_drop'`, `subtype`):
  - on my submit (partner hasn't): "{me} dropped something for you 💌"
  - on nudge tap: "{partner} is waiting on you 👀"
  - on the submit that completes the pair: "{partner} answered — your drop unsealed ✨"
  - all carry `data.view='daily-drop'`.
- **Expiry warning** (local, last ~2h, optional): "Your drop disappears soon ⏳".
- Add `'daily-drop'` to `App.tsx` `NOTIFICATION_VIEWS` + `KIND_VIEWS`.
- Push is best-effort / device-only (no offline queue today); local-first UI never depends on it.

## 9. Surfaces & navigation

- **Home hero** `DailyDropCard` — replaces the inline `DailyQuestion` at `Home.tsx:930`.
  Compact, state-reactive, tappable → `setView('daily-drop')`. Live micro-state:
  breathing seal / your-turn glow / waiting shimmer / reveal-ready shimmer / revealed
  afterglow / expiring countdown ring.
- **Remove** the Aura Board tile (`Home.tsx:1030–1050`); grid reflows.
- **`daily-drop` view** (`views/DailyDrop.tsx`) — full immersive experience: `ViewHeader`,
  hosts the active drop-type component, the sealed/waiting/expired states, and the reveal.
  Registered in `viewRegistry.tsx`. Deep-link target for notifications.

## 10. Motion / micro-interactions (within `motionExperience.assert.mjs` rules)

transform + opacity only in keyframes; `springSmooth`/`springSnappy`/`springGentle`,
`EASE_SILK`/`EASE_SOFT`; honor `prefersReducedMotion()`; haptics via `feedback.*`.

- **Breathing seal**: scale 1↔1.015, ~4s gentle loop.
- **Your-turn**: soft outer glow ring pulsing (opacity).
- **Open**: `feedback.tap()` + press 0.97 → card expands into view (shared element / view-transition).
- **Respond**: type-specific delight (options stagger in; pick springs forward + `feedback.interact()`).
- **Seal**: fold/wax-seal close + `feedback.confirm()`; copy "Sealed. {partner}'s turn."
- **Waiting**: quiet shimmer; Nudge button with a little send-off animation.
- **Reveal (payoff)**: seal cracks → staggered reveal of both responses; `match` →
  `feedback.milestone()` + AuraSignal-style `FluidBackground` afterglow bloom.
- **Expiring**: countdown ring in last hours; "disappears at midnight".

## 11. Component contract (frozen — the fleet builds to this)

```ts
export interface DropTypeProps {
  prompt: DropPrompt;
  profile: { myName: string; partnerName: string };
  myResponse?: DropResponse;          // present once I've answered
  partnerResponse?: DropResponse;     // ONLY passed when revealed; undefined while sealed
  revealed: boolean;                  // false = collect my input; true = show both + match
  onSubmit: (value: string, guess?: string) => void;
  // optional helpers injected by the view:
  resolveMemory?: (id: string) => { title: string; imageId?: string; date: string } | null;
}
```

Sealed (`revealed=false`, no `myResponse`): render input UI, call `onSubmit` on commit.
Sealed (`revealed=false`, has `myResponse`): render "your answer locked" recap (read-only).
Revealed (`revealed=true`): render both responses + the type's "match" verdict.

## 12. File plan

**Foundation (single-owner, sequential — shared/coupled):**
`types.ts`, `services/storage.ts`, `utils/dropEngine.ts`, `data/dropContent.ts`,
`hooks/useDailyDrop.ts`, `views/Home.tsx`, `views/viewRegistry.tsx`, `views/AuraRewind.tsx`,
`App.tsx`, `services/notifications.ts`, `supabase/functions/send-partner-nudge/index.ts`,
`supabase/migrations/<ts>_daily_drops.sql`, `tests/mobilePerformanceBudget.assert.mjs`,
`views/DailyDrop.tsx`.

**Fleet (parallel, disjoint NEW files, built to §11):**
`components/daily-drop/DailyDropCard.tsx`, `components/daily-drop/DailyDropReveal.tsx`,
`components/daily-drop/drops/{ThisOrThat,GuessMyMood,DidTheyKnow,FinishMySentence,OnThisDay,SecretWindow,TheDare,Pulse}.tsx`.

**Verify:** `tsc` (strict-safe code regardless of tsconfig), run `*.assert.mjs`,
`code-review` + `critique` (design) adversarial pass, fix.
