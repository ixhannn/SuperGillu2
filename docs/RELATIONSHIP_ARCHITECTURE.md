# Lior Relationship Architecture — Audit & Permanent Design

**Date:** 2026-06-10 · **Author:** architecture audit session
**Scope:** account linking, relationship lifecycle, onboarding, sync, media ownership, security, migration.

> ⚠️ **Read this first:** the repo currently has TWO divergent lines.
> The main checkout (`C:\Users\Sameer\Downloads\Lior`) contains the June-4 relationship-integrity
> work (`relationship_facts`, `get_my_relationship()`, pairing-v2 RPCs, per-couple realtime channel,
> field-level profile merge). The worktree `exciting-haibt-0e74b8` contains the June-10 security
> hardening (worker auth, CORS, RLS perf, FKs, crash-proofing) but is 7 migrations behind.
> **Merging these two lines is Phase 0 of the migration plan.** Nothing below works reliably
> until both sets of fixes live in one branch.

---

## 1. Relationship model verdict

**Decision: Relationship as a first-class entity. `User A → Relationship ← User B`. Keep the current model; the model was never the problem.**

The current schema (`couples` + `couple_memberships` + `relationship_facts`) is already the
correct shape:

```
auth.users ──< couple_memberships >── couples ──1:1── relationship_facts
                                        │
                                        └──< all content tables (couple_id)
                                        └──< media_assets (couple_id)
```

Why relationship-as-entity is strictly safer than `A <-> B` direct linking:

1. **Lifecycle independence** — the relationship can be `pending` (solo), `active`, `archived`
   without touching either user row. Account deletion / ban / unlink are membership-status
   transitions, never destructive edits to a peer pointer.
2. **One FK target for everything** — every memory, photo, note hangs off `couple_id`. With
   `A<->B` pointers, every content row would need fragile dual ownership or pair-key logic.
3. **Enforceable invariants** — "one active relationship per user" is a single partial unique
   index. With direct pointers you cannot express this without triggers.
4. **Merge-able** — pre-link solo data lives in a solo couple and is re-homed by changing one
   column. With direct pointers there is nothing to re-home into.

**The actual root causes of the historical breakage were:** (a) the client *deriving* which
couple it belongs to with heuristics, (b) device-local flags treated as truth (onboarding),
(c) JSON-blob singletons synced last-write-wins, (d) one global realtime room, (e) row IDs
that embed the couple id. Each is addressed below.

---

## 2. Invariants (the "impossible to break" contract)

These are the structural guarantees. Every one is enforced **in the database**, not the client:

| # | Invariant | Enforcement |
|---|-----------|-------------|
| I1 | A user has **at most one ACTIVE couple** | `one_active_couple_per_user` partial unique index (migration 20260604 §5c — **verify it is enabled in prod** after the §5a audit) |
| I2 | A couple has **at most two active members** | New CHECK via trigger (see §7 SQL) — currently unenforced |
| I3 | Couples are **never hard-deleted** | No DELETE policy + `REVOKE DELETE`; lifecycle is `pending → active → archived` only |
| I4 | Memberships are **never client-deleted** | No DELETE policy for `authenticated`; only SECURITY DEFINER RPCs may remove (claim-v2 stale-solo cleanup, unlink) |
| I5 | The client **never chooses its couple** | All reads resolve via `get_my_relationship()`; the legacy client heuristic is deleted (Phase 6) |
| I6 | Relationship facts change only via **propose/confirm** once both partners exist | `set_relationship_fact()` RPC (§4 Q1/Q6) — columns already exist |
| I7 | Onboarding completion is **server state** | `relationship_facts.onboarding_done` (live since 20260604) |
| I8 | Deletes are **tombstoned, never inferred** | `sync_deletions` ledger (live) — an empty cloud table is *never* interpreted as "delete local" |
| I9 | A user can never read another couple's rows | FORCE RLS on every table, membership-EXISTS policies with `status='active'` (live + June-10 `(select auth.uid())` hardening) |
| I10 | Media ownership follows the couple | `media_assets.couple_id` + R2 worker membership check on writes + re-home job on link (§5) |

---

## 3. Current-state assessment

**Already correct in production (keep, do not redesign):**
- `get_my_relationship()` as the single authoritative read; prefers a *linked* couple, only
  creates a solo couple when the user truly has none.
- `relationship_facts` with `onboarding_done`, `anniversary_date`, `proposed`, `set_by`,
  `confirmed_by_both` — the propose/confirm columns exist but **no RPC or UI uses them yet**.
- Pairing v2: server-generated 8-char codes (32^8 space, 15-min expiry), `FOR UPDATE` atomic
  claim, `already_linked` guard, stale-solo-couple cleanup, two-sided backfill.
- Client `RelationshipService` + `applyLockedPairLink` (local pair-lock that refuses silent
  partner changes) + server-first onboarding gate in App.tsx.
- Per-couple realtime room `lior_room:<coupleId>` (replaced the global room).
- Field-level "meaningful merge" for `couple_profile` (empty values can no longer clobber).
- Tombstone deletion ledger; media authority table (`media_assets`) + repair/audit worker.

**Still broken / missing (the redesign targets):**

| Gap | Consequence |
|-----|-------------|
| G1. Tenant row IDs embed coupleId (`${coupleId}:${logicalId}`, supabase.ts:12) and `fetchSingle` matches the exact id, but `backfill_user_rows_to_couple_for_user` updates only the `couple_id` **column**, not the id prefix | After linking, singletons (`couple_profile`, `pet_stats`, `our_room_state`, `together_music`) exist under the OLD id while new writes create a SECOND row under the new id → duplicate singletons, "anniversary asked again", nondeterministic profile state |
| G2. Propose/confirm machinery unused | Both partners' onboarding answers still race (last writer wins per field) |
| G3. `relationship_facts` not merged on claim | Inviter's facts survive, joiner's facts silently lost |
| G4. Full-table reconcile (`fetchAll`) with PostgREST's silent 1 000-row cap, no pagination, no delta cursor | Large couples silently lose tail rows on new devices; reconcile cost grows linearly forever |
| G5. CLOUD-EMPTY-PROTECTION pushes local→cloud whenever a cloud table is empty | On a *linked* couple this can resurrect data the partner deleted (if a tombstone write failed) and can push one device's stale snapshot as truth |
| G6. `user_status` rows keyed by **display name** (storage.ts:1779) | Rename breaks partner status; names are not identities |
| G7. R2 objects live under the solo couple's path after linking; only DB rows are re-homed | Partner's worker writes 409 (`media_assets couple mismatch`), old-couple paths linger, "media not appearing / appearing from wrong account" |
| G8. No unlink / account-deletion / ban lifecycle RPCs | Account deletion currently leaves whatever cascade FKs decide; nothing archives the couple |
| G9. Legacy fallback couple resolution still in the client (pre-`get_my_relationship` heuristic) | Any RPC hiccup silently re-enters the bug-prone path |
| G10. Two divergent code lines (June-4 vs June-10) | Each line is missing the other's fixes |

---

## 4. The ten questions — explicit decisions

### Q1 — Conflicting anniversary at onboarding (A: Feb 14, B: Feb 20)

**Decision: first-write-wins-immediately, divergent-second-write-becomes-a-proposal.**

- A submits first → `anniversary_date = 2024-02-14`, `set_by = A`, `confirmed_by_both = false`.
  A proceeds; onboarding is never blocked.
- B submits the **same** value → `confirmed_by_both = true`. Done.
- B submits a **different** value → the stored value does NOT change. Instead
  `proposed = {field:'anniversary_date', value:'2024-02-20', proposed_by:B, proposed_at:…}`
  and A gets an in-app prompt: *"B says your anniversary is Feb 20 — keep Feb 14 or switch?"*
  Accept → value swaps, `confirmed_by_both = true`. Reject → proposal cleared, B notified.

Why not the alternatives: **last-write-wins** is the current bug (data loss, ping-pong
between devices). **Require both up front** blocks onboarding on partner availability — fatal
for the solo-start flow (Q3). **Pending-approval-before-any-value** means the home screen has
no anniversary for days. First-write + proposal converges, loses nothing, blocks nobody.

Server enforcement (one RPC, transactional):

```sql
create or replace function public.set_relationship_fact(fact_key text, fact_value text)
returns table(applied boolean, pending boolean, current_value text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cid uuid;  cur text;  setter uuid;  members int;
begin
  if uid is null then raise exception 'auth required'; end if;
  if fact_key not in ('anniversary_date','first_met_date','status_label') then
    raise exception 'unknown fact %', fact_key;
  end if;

  select m.couple_id into cid from couple_memberships m
   where m.user_id = uid and m.status = 'active' limit 1;
  if cid is null then raise exception 'no active couple'; end if;

  select count(*) into members from couple_memberships
   where couple_id = cid and status = 'active';

  execute format('select %I::text, set_by from relationship_facts where couple_id = $1', fact_key)
    into cur, setter using cid;

  if cur is null or cur = '' or members = 1 or setter = uid then
    -- unset, solo, or my own value → write directly
    execute format(
      'update relationship_facts set %I = $1, set_by = $2,
              confirmed_by_both = (case when $3 = $1::text then true else false end),
              proposed = null, updated_at = now()
        where couple_id = $4', fact_key)
      using fact_value, uid, cur, cid;
    return query select true, false, fact_value;
  elsif cur = fact_value then
    update relationship_facts
       set confirmed_by_both = true, proposed = null, updated_at = now()
     where couple_id = cid;
    return query select true, false, fact_value;
  else
    -- divergent second writer → proposal, never clobber
    update relationship_facts
       set proposed = jsonb_build_object('field', fact_key, 'value', fact_value,
                                         'proposed_by', uid, 'proposed_at', now()),
           updated_at = now()
     where couple_id = cid;
    return query select false, true, cur;
  end if;
end $$;

create or replace function public.respond_to_fact_proposal(accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();  cid uuid;  p jsonb;
begin
  select m.couple_id into cid from couple_memberships m
   where m.user_id = uid and m.status='active' limit 1;
  select proposed into p from relationship_facts where couple_id = cid for update;
  if p is null then return; end if;
  if (p->>'proposed_by')::uuid = uid then raise exception 'cannot accept own proposal'; end if;
  if accept then
    execute format(
      'update relationship_facts set %I = $1, set_by = $2,
              confirmed_by_both = true, proposed = null, updated_at = now()
        where couple_id = $3', p->>'field')
      using p->>'value', (p->>'proposed_by')::uuid, cid;
  else
    update relationship_facts set proposed = null, updated_at = now() where couple_id = cid;
  end if;
end $$;
```

### Q2 — Field ownership map

| Field | Owner | Where | Why |
|---|---|---|---|
| Anniversary date | **Relationship** | `relationship_facts.anniversary_date` | One truth per couple; propose/confirm |
| First-met date | **Relationship** | `relationship_facts.first_met_date` | Same |
| Relationship status label | **Relationship** | `relationship_facts.status_label` | Same |
| Onboarding done | **Relationship** | `relationship_facts.onboarding_done` | The couple onboards once, not each device |
| Couple/room display name, shared theme | **Relationship** | `relationship_facts` (add columns) or `couple_profile` | Shared aesthetic |
| My display name | **User** | `user_profiles.display_name` | Identity is personal; partner sees it read-only |
| Nickname I call my partner | **User** (per member) | `couple_memberships.nickname_for_partner` (new column) | Two nicknames exist — A's name for B and B's name for A. Making this "shared" guarantees overwrite fights |
| Avatar, notification prefs, theme override | **User** | `user_profiles` / local | Personal |
| Presence / sleep status | **User** | `user_status` keyed by **user_id** (fix G6) | Personal, ephemeral |
| Favorite-flag on a memory | **User** (per member) | `memory_favorites(user_id, memory_id)` or jsonb keyed by user_id | Each partner favorites independently |
| Memories, notes, photos, gifts, journal | **Relationship + author attribution** | content tables: `couple_id` (owner) + `user_id` (author) | See §5 |
| Private space items | **User** | `private_space_items` user-scoped RLS | Explicitly not shared, never merged |

Rule of thumb: **facts about the relationship → relationship-owned with propose/confirm;
facts about one person → user-owned; content → relationship-owned with an author column.**

### Q3 — User A onboards first, B hasn't joined

**Decision: the relationship object exists immediately; it is the same object B later joins.**

- First authenticated run: `get_my_relationship()` → no membership → `ensure_user_couple()`
  creates the couple **with `status='pending'`** (change: today it defaults `'active'`) +
  `relationship_facts(onboarding_done=false)`.
- A completes onboarding *into that couple*: facts written via `set_relationship_fact`
  (solo ⇒ applied directly), content created under `couple_id`.
- Invite is a **separate object** (`pair_invites`), already pointing at A's couple via its
  `couple_id` column (pairing-v2). Codes expire in 15 min; the *relationship intent* never
  expires because A can mint codes forever (`create_pair_invite_v2` reuses or rotates).
- When B claims: B **joins A's couple** (claim-v2 already does this), couple flips
  `pending → active`. There is no "merge two couples into a third" — the inviter's couple is
  always the target; the joiner's solo couple is drained (backfill) and the stale solo
  membership removed. One canonical couple id from day one of the link.

### Q4 — B accepts after 30 days

The 15-minute code has long expired — **B asks A for a fresh code; nothing else changes.**
Short expiry is a security property (8-char codes), not a relationship property.

**Merge policy at claim time (server-side, inside `claim_pair_invite_v2`, one transaction):**

1. **Content (memories, photos, notes, …):** UNION. B's 30 days of solo rows are re-homed via
   `backfill_user_rows_to_couple_for_user` (exists). Authorship (`user_id`) is preserved, so
   the timeline shows who created what. Nothing is dropped.
2. **Relationship facts:** inviter's couple's facts are the base. Each of B's solo facts that
   is non-null and **different** becomes a `proposed` entry (Q1 machinery); equal values mark
   `confirmed_by_both`. **(Gap G3 — add this step to the claim RPC.)**
3. **Singletons (pet, room, music):** inviter's couple wins as base state; B's solo singleton
   rows are deleted after the facts extraction — NOT left to race (fixes the duplicate-singleton
   hazard amplified by G1).
4. **Media:** re-home job queued (§5).
5. **Tombstones:** B's solo-couple `sync_deletions` rows are re-keyed to the target couple so
   B's pre-link deletions stay deleted.

### Q5 — Both upload photos before linking

**Decision: hybrid — storage ownership transfers to the relationship; authorship never changes.**

- Pre-link, each user's photos live under their **solo couple** (`couple_id` = solo couple,
  `user_id` = them, R2 key `v2/couples/<soloCoupleId>/…`).
- On link, photos **merge into the shared timeline** (this is a couples app; the shared
  features are shared by design). Authorship stays visible.
- **Exception:** `private_space_items` are user-owned, RLS user-scoped, and are *never*
  surfaced to the partner by the merge.
- Mechanics (fixes G7): DB rows re-home instantly (backfill). R2 objects are re-homed by an
  **async worker job**: copy object to `v2/couples/<sharedCoupleId>/…` → update
  `media_assets.r2_key` + `couple_id` → rewrite `storagePath` references (the
  `repair.legacy_ref_rewritten` machinery already exists for exactly this) → delete the old
  object only after a verified read of the new one. Until the job completes, old paths remain
  readable, so nothing flickers or 404s.

### Q6 — Changing the anniversary later

**Decision: unilateral edits are allowed only while the value is unconfirmed and was set by
you; once `confirmed_by_both = true`, every change is propose → partner-approve.**
Same `set_relationship_fact` RPC handles both (the `setter = uid` branch). The pending
proposal is visible to both, the proposer can cancel, and it auto-expires after 7 days
(cron clears `proposed` older than 7 days). No silent change of a confirmed fact, ever.

### Q7 — One user deletes their account

**Decision: the relationship ARCHIVES; shared data survives for the partner. Never cascade-delete.**

`delete_my_account()` RPC (new), in one transaction **before** `auth.users` deletion:
1. `couple_memberships.status = 'left'` for the leaver.
2. `couples.status = 'archived'`, `archived_at = now()` (if the couple was active).
3. `user_profiles` PII removed; a display-name snapshot `"former partner"` label is kept on
   the membership row for rendering history.
4. Content rows keep `couple_id`; author `user_id` FKs are `ON DELETE SET NULL`
   (June-10 FK work establishes this pattern — extend it to all content tables).
5. The survivor retains **read** access to the archived couple (RLS: members of archived
   couples can SELECT, not INSERT). Their history is theirs too.
6. The survivor may later link a new partner → a **new** couple (I1 allows it because the
   archived membership is `left`). Old couple stays archived and readable.
7. GDPR erasure: a separate explicit flow (`erase_my_content()`) hard-deletes the leaver's
   authored media/rows if they demand it. Default is survive, because the partner co-owns
   the relationship record.

### Q8 — One user is banned

**Decision: ban is an auth-layer event; the relationship is untouched.**
- Supabase ban blocks login (and the June-10 FK + RLS work means no ghost access).
- `couple_memberships.status = 'suspended'` for the banned user (column exists).
- Partner keeps full read/write on the couple. RLS write-policies require `status='active'`,
  so the banned user's sessions (if any survive) cannot write; the partner's access never
  references the partner's status — only their own membership.
- Unban → membership back to `active`. No data ever moved or deleted, so integrity is trivial.

### Q9 — One user on 5 devices

- **Identity:** Supabase multi-session; every device resolves the couple **only** via
  `get_my_relationship()` (I5). No device-local couple choice, ever.
- **Realtime:** all devices join `lior_room:<coupleId>` (already live) — presence keyed by
  **user_id + device_id**, not display name (fix G6). Postgres-changes subscriptions are
  RLS-filtered server-side; add explicit `filter: couple_id=eq.<id>` for efficiency.
- **Cache invalidation:** every table gets a per-device **delta cursor**: pull
  `where couple_id = ? and updated_at > :cursor order by updated_at limit 500` pages until
  empty, then store the new cursor (fixes G4 — the 1 000-row silent cap and O(all-data)
  reconciles). Tombstone ledger handles deletes (exists). Full reconcile remains as a weekly
  / on-corruption fallback only.
- **Write path:** optimistic local write → push (row carries `updated_at` from server on
  ack) → realtime fan-out to the other 4 devices + partner's devices. Conflicts: per-row
  server `updated_at` LWW for content rows (two-writer domain; acceptable), propose/confirm
  for relationship facts (never LWW).
- **Stale device protection:** a device returning from a month offline pulls deltas first and
  only then pushes queued writes; queued writes to rows whose server `updated_at` is newer
  than the device's snapshot are dropped for singletons / merged for collections.

### Q10 — Guaranteeing zero cross-couple reads

Defense in depth, every layer already partially live:

1. **RLS, FORCE, on every table** — membership-EXISTS with `status='active'` and
   `(select auth.uid())` (June-10). `FORCE` means even definer-owned access is policy-checked
   unless explicitly granted.
2. **No client-supplied couple_id is ever trusted** — `fetchAll` filters by couple_id but RLS
   is the actual guard; all privileged transitions (claim, backfill, unlink, delete-account)
   are SECURITY DEFINER RPCs that *derive* couple from `auth.uid()` and verify membership
   (the June-10 `backfill_user_rows_to_couple` membership guard closed the one hole here).
3. **Storage:** R2 worker verifies Supabase session + couple membership on every write
   (June-10 removed the UPLOAD_KEY bypass). Reads: keys are unguessable (uuid+uuid+ts), but
   for production-grade add **signed GET URLs** (worker-issued, 1h TTL, membership-checked at
   issue time) — see §10.
4. **Realtime:** per-couple channel names include the couple id, and Supabase realtime
   authorization (RLS on `realtime.messages` / private channels) must be enabled so a user
   cannot subscribe to another couple's room by guessing its id. **(Add — today the channel
   name is the only barrier.)**
5. **Tests:** a standing RLS test suite — two seeded users in different couples; for every
   table assert cross-couple SELECT/INSERT/UPDATE/DELETE each return 0 rows / error. Runs in CI.
6. **Monitors:** nightly invariant cron (§11) alerts on any row whose `couple_id` has no
   active membership pair, users with >1 active couple, couples with >2 active members.

---

## 5. Media ownership model

| Category | Owner | Author visible | Merge on link | Survives partner deletion |
|---|---|---|---|---|
| Photos / videos (memories, daily moments, keepsakes, time capsules, surprises) | Relationship | yes (`user_id`) | yes (union) | yes |
| Voice notes | Relationship | yes | yes | yes |
| Memories / journal entries | Relationship | yes | yes | yes |
| Notes / gifts (room) | Relationship | yes | yes | yes |
| Together-music track | Relationship (uploader attributed via `ownerUserId`) | yes | inviter's wins, joiner's proposed | yes |
| Private space items | **User** | n/a | **never** | deleted with the user |
| Avatar | User | n/a | n/a | deleted with user |

Storage rules:
- R2 key = `v2/couples/<couple_id>/<feature>/<ownerUserId>/<bucket>/<itemId>/<role>` —
  couple-rooted (already the v2 scheme).
- `media_assets` is the authority: every object has exactly one row (status `reserved → ready`),
  byte-size/MIME/checksum verified at upload (live). The audit/repair worker reconciles
  R2 ↔ `media_assets` ↔ content-row references (live).
- **Re-home job** (new, fixes G7): triggered by claim; copies solo-couple objects to the
  shared couple path, updates `media_assets`, rewrites `storagePath` refs, verifies, then
  deletes old objects. Idempotent, resumable (it's keyed off `media_assets.couple_id <>
  membership-resolved couple`).

---

## 6. Sync strategy decision

**Decision: server-authoritative state + per-row versions + delta cursors + tombstones +
propose/confirm for facts. NOT event sourcing.**

- Event sourcing is the wrong tool here: a 2-writer (≤ ~12-device) domain with simple
  entities doesn't need replayable logs, and retrofitting it onto 21 live tables is a
  rewrite with migration risk far exceeding its payoff. Keep an *audit log* (the
  `storage_events` pattern already used for media) for forensics — that's the useful 10%.
- **Server authority:** the database row is the truth. Client caches (localStorage/IndexedDB)
  are disposable accelerators — after this redesign, deleting them must reproduce identical
  state from the server (the device-migration test, §9).
- **Optimistic updates:** keep them (instant UX) but every ack returns the server
  `updated_at`; a device only applies a realtime/poll update if it's newer than what it holds.
- **Conflict resolution:** content rows → per-row LWW on server `updated_at` (sufficient for
  two writers; collections are mostly insert-only). Relationship facts → propose/confirm
  (never LWW). Singletons (`pet_stats`, `our_room_state`) → LWW *with* `updated_at`
  comparison (today the merge ignores timestamps — add the check).
- **Reconciliation:** delta-cursor pull (G4 fix) as the normal path; the existing
  tombstone-checked full reconcile becomes the recovery path. **CLOUD-EMPTY-PROTECTION is
  restricted (G5 fix):** push-local-up only when the couple is solo or onboarding just
  completed this session. For a *linked* couple, an empty cloud table is treated as
  suspicious — re-verify via a second read before any push, and never push singletons that
  carry no local `rowMeta` provenance.

Causes of each failure class, mapped:
- **Missing data** → PostgREST 1 000-row cap (G4), R2 not re-homed (G7), tombstone misfire.
- **Stale data** → no delta cursor; timestampless singleton merges; `cachedCoupleId` per-tab.
- **Duplicate data** → tenant-id prefix mismatch creating twin singletons (G1); re-upserts
  without stable logical ids.
- **Relationship corruption** → client couple heuristics (closed), local onboarding flag
  (closed), facts LWW (G2).
- **Conflicting updates** → blob-spread profile merge (closed June-4), facts race (G2).

---

## 7. Target database schema (complete)

Existing-and-kept tables are listed without DDL; new/changed items have DDL.

```
auth.users                          (Supabase)
user_profiles                       user_id PK → auth.users ON DELETE CASCADE,
                                    display_name, created/updated_at        [live]
couples                             id PK, status pending|active|archived,  [live]
                                    archived_at, created/updated_at
couple_memberships                  (couple_id, user_id) PK,
                                    couple_id → couples ON DELETE CASCADE,
                                    user_id → auth.users ON DELETE CASCADE, [June-10 FK]
                                    role, status active|left|suspended,
                                    nickname_for_partner text,              [NEW column]
                                    partner_label_snapshot text,            [NEW column, Q7]
                                    UNIQUE(user_id) WHERE status='active'   [verify enabled]
relationship_facts                  couple_id PK → couples CASCADE,
                                    anniversary_date, first_met_date, status_label,
                                    onboarding_done, proposed jsonb, set_by,
                                    confirmed_by_both, updated_at           [live]
pair_invites                        code PK, user_id → users CASCADE, couple_id → couples,
                                    expires_at, claimed_by → users SET NULL,
                                    revoked_at, claimed_at                  [live + June-10 FKs]
sync_deletions                      tombstones; user_id SET NULL (survives author),
                                    couple_id → couples CASCADE             [live + June-10 FKs]
media_assets                        r2_key unique, couple_id, owner_user_id, source_table,
                                    logical_row_id, status, checksum, sizes [live]
device_push_tokens                  user-scoped                             [live]
relationship_signals                couple-scoped signals/pulse             [live]
notifications                       NEW: id, couple_id, recipient_user_id, kind,
                                    payload jsonb, created_at, read_at — needed for
                                    proposal prompts & lifecycle notices
21 content tables                   id TEXT PK (→ becomes logical_id, see below),
                                    user_id (author, ON DELETE SET NULL),
                                    couple_id → couples, data jsonb,
                                    created/updated_at, RLS couple-scoped   [live]
```

**Change 1 — kill embedded-couple row ids (G1):**

```sql
-- For each content table: logical identity = (couple_id, logical_id), not a prefixed string.
alter table public.couple_profile add column if not exists logical_id text;
update public.couple_profile
   set logical_id = coalesce(nullif(split_part(id, ':', 2), ''), id)
 where logical_id is null;
create unique index if not exists couple_profile_couple_logical_uidx
  on public.couple_profile (couple_id, logical_id);
-- Dedupe twin singletons (keep newest):
delete from public.couple_profile a
 using public.couple_profile b
 where a.couple_id = b.couple_id and a.logical_id = b.logical_id
   and a.updated_at < b.updated_at;
-- Client then upserts ON CONFLICT (couple_id, logical_id) and stops computing id prefixes.
```
(Apply the same pattern to all 21 tables; the `id` column stays for backward compat until
Phase 5 completes, then becomes a plain uuid default.)

**Change 2 — two-member cap (I2):**

```sql
create or replace function public.enforce_couple_capacity()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and (
       select count(*) from public.couple_memberships
       where couple_id = new.couple_id and status = 'active'
         and (user_id <> new.user_id)
     ) >= 2 then
    raise exception 'couple_full';
  end if;
  return new;
end $$;
create trigger couple_capacity_guard
  before insert or update on public.couple_memberships
  for each row execute function public.enforce_couple_capacity();
```

**Change 3 — lifecycle RPCs:** `set_relationship_fact`, `respond_to_fact_proposal` (§4 Q1),
plus:

```sql
-- Explicit, two-step unlink. Step 1 records intent; step 2 (same user after cooling-off,
-- or the partner any time) finalizes. No client DELETE path exists at all.
create or replace function public.request_unlink() returns timestamptz …;   -- sets couples.unlink_requested_by/at
create or replace function public.confirm_unlink() returns void …;          -- after 48h OR partner confirms:
                                                                             -- memberships → 'left', couple → 'archived'
create or replace function public.delete_my_account() returns void …;       -- Q7 sequence, then auth deletion
```

**Indexes** (beyond PKs): `couple_memberships(user_id) WHERE status='active'` [live],
`*_couple_id_idx` on all content tables [live], `(couple_id, updated_at)` on all content
tables [NEW — required by delta-cursor pulls], `media_assets(couple_id, status)`,
`notifications(recipient_user_id, read_at)`.

---

## 8. Lifecycle & flows

**Relationship lifecycle:**

```
                      create_pair_invite_v2 ──> pair_invites(code, couple_id)
                                                      │ claim_pair_invite_v2 (atomic)
 first login                                          ▼
 ──> get_my_relationship() ──> [no couple] ──> couples(status=pending, 1 member)
                                                      │ partner claims
                                                      ▼
                                              couples(status=active, 2 members)
                                                      │
                ┌──────────────────────┬──────────────┴────────────┐
                ▼                      ▼                           ▼
        request_unlink()        delete_my_account()           ban (auth)
        + confirm_unlink()      membership→left               membership→suspended
                ▼                      ▼                           │ unban
        couples → archived      couples → archived                ▼
        (both → 'left')         (survivor keeps read)        back to active
                └────────── survivor may form a NEW couple ───────┘
```

**Onboarding flow (per couple, not per device):**
1. Login → `get_my_relationship()` → `{coupleId, onboardingDone, memberCount}`.
2. `onboardingDone=true` → straight to home. The local flag is only a paint accelerator.
3. Else show onboarding; every answer goes through `set_relationship_fact` (solo ⇒ direct
   write). Finish → `onboarding_done=true` server-side, then mirror locally.
4. Partner joining later sees onboarding **only if** `onboarding_done=false`; their divergent
   answers become proposals, never overwrites (Q1).

**Invite flow:** create v2 (reuse-or-rotate, server code) → share code/QR →
claim v2 (atomic `FOR UPDATE`; rejects self/used/expired/revoked; `already_linked` guard;
joins inviter's couple; cleans stale solo memberships; backfills both; **add:** facts merge
+ singleton dedupe + tombstone re-key + media re-home enqueue) → both clients receive a
`relationship-updated` broadcast → `RelationshipService.refresh()`.

---

## 9. Device migration (delete app / new phone / web login)

Bootstrap order after auth (all server-derived, no manual recovery):

1. `get_my_relationship()` → couple id, partner, onboarding state. *(Nothing else may decide these.)*
2. `relationship_facts` → anniversary, facts → render hero instantly.
3. `user_profiles` (mine + partner via RLS pair policy) → names.
4. Per-table delta pull from cursor 0 (paged) → content; tombstone ledger applied.
5. `media_assets`-backed `storagePath` refs hydrate lazily from R2/worker with local cache;
   `recoverImagesFromCloud` remains the bulk-warm path.
6. Join `lior_room:<coupleId>`; register device push token.

Acceptance test (add to CI/E2E): seed a linked couple with content on device A; wipe device B
profile entirely; login on B; assert relationship, names, anniversary, onboarding-skip,
memory count, and a sampled photo all match A — with zero user input. This test IS the
"permanent linking" promise, executable.

---

## 10. Security model (delta on top of June-10 hardening)

Already closed (June-10): worker client-`apikey` trust; `UPLOAD_KEY` write bypass; wildcard
CORS on worker + edge functions; client-side admin override/DEV bypass; auth-proxy
fail-open rate limiter; unauthenticated `pet-dialogue`; admin token in localStorage; CSP
`unsafe-inline`/esm.sh; Supabase-URL hijack via localStorage; `backfill` membership guard;
missing FKs; per-row `auth.uid()`.

Remaining, in priority order:
1. **Realtime channel authorization** — enable Supabase private channels / RLS on
   `realtime.messages` so `lior_room:<coupleId>` cannot be joined by non-members (channel
   name secrecy is not auth).
2. **Signed media GETs** — worker-issued signed URLs (1h TTL) for object reads; today
   unguessable keys are the only read barrier.
3. **Claim-attempt rate limiting** — extend the `auth_rate_limits` pattern to
   `claim_pair_invite_v2` (5 tries / 10 min per user+IP) to keep the 32^8/15-min code space
   unbruteforceable even at scale.
4. **Race conditions** — claim is `FOR UPDATE`-safe (live); add the couple-capacity trigger
   (I2) so even a future buggy RPC cannot create a 3-member couple; keep `ON CONFLICT DO
   NOTHING` semantics in membership inserts.
5. **Invalid states** — nightly invariant monitor (cron SQL → alert): users with >1 active
   couple; couples with >2 active members; content rows whose couple has zero active members
   and status≠archived; `media_assets.couple_id` ≠ its content row's couple; twin singletons.
6. **API abuse** — all RPCs derive identity from `auth.uid()`; never accept user_id/couple_id
   params for self-referential operations (audit: `backfill_user_rows_to_couple(uuid)` is now
   guarded; `…_for_user` variant is definer-internal only — `REVOKE` is already in place).

---

## 11. Likely causes of the existing bugs (symptom → mechanism)

| Symptom | Mechanism (file refs) | Status |
|---|---|---|
| Linked profiles unlink | Pre-June-4 client heuristic picked solo couple; `ensure_user_couple` ran on read paths; `cachedCoupleId` staleness (services/supabase.ts) | Largely closed by `get_my_relationship` + pair lock; **delete the legacy fallback** (G9) and verify index I1 is enabled |
| Couple data disappears / anniversary asked again | Twin singletons from coupleId-prefixed row ids after linking (G1, supabase.ts:12 + backfill not rewriting ids); pre-June-4 blind `{...local, ...cloud}` spread letting `''` clobber dates (storage.ts:1756 comment documents it); device-local onboarding flag | Spread fixed; flag fixed; **G1 fix outstanding** |
| Media not appearing / from wrong account | R2 objects left under solo-couple path after link (G7) → partner worker writes 409, refs point at paths the repair job doesn't re-home; pre-hardening UPLOAD_KEY path wrote into arbitrary couples | UPLOAD_KEY closed; **re-home job outstanding** |
| Onboarding repeats | `lior_onboarded` was device-local; offline first-paint falls back to local flag before RPC answers (App.tsx:514 resolveOnboarded) | Server gate live; tighten: never *show* onboarding until the RPC resolves or times out |
| Different devices show different states | Old global room (`lior_global_room`) presence/signals cross-couple; no delta cursors; full reconcile order-dependent; PostgREST 1 000-row truncation (G4) | Per-couple room live in main; **cursors outstanding** |
| Linkage breaks after login/logout | `activateAccount` localStorage backup/restore swapping stale profiles back in (storage.ts); pair-lock now blocks the worst case | Mostly closed; root fix = server-first bootstrap (§9) |
| Shared memories don't sync | Empty-cloud push-up racing partner deletes when a tombstone write failed (G5); name-keyed `user_status` misrouting (G6) | **Both outstanding** |
| Relationship state corrupted | Facts LWW with no propose/confirm (G2); claim not merging joiner facts (G3) | **Both outstanding** |

---

## 12. Migration plan (ordered, each phase shippable)

| Phase | Work | Risk |
|---|---|---|
| **0** | **Merge the two code lines** (June-4 relationship work in main + June-10 security work in worktree). Run full verify suite | low |
| **1** | Run §5a audit in prod; confirm/enable `one_active_couple_per_user`; set `couples.status='pending'` default for solo creation; add capacity trigger (I2) | low |
| **2** | Ship `set_relationship_fact` / `respond_to_fact_proposal` + notifications table + proposal UI; route onboarding writes through it; extend claim-v2 with facts-merge, singleton dedupe, tombstone re-key | medium |
| **3** | Status keyed by user_id (G6); realtime private-channel auth; claim rate-limit | low |
| **4** | Delta cursors + `(couple_id, updated_at)` indexes + pagination; restrict CLOUD-EMPTY push-up to solo/just-onboarded; add `updated_at` check to singleton merges | medium |
| **5** | Tenant-id de-embedding (G1): add `logical_id`, dedupe, switch client upserts to `(couple_id, logical_id)`; media re-home job (G7) | **high — staging first, the dedupe mutates data** |
| **6** | Lifecycle RPCs: `request_unlink`/`confirm_unlink`/`delete_my_account`; archived-couple read-only RLS; delete the legacy client couple-resolution fallback (G9) and claim-v1 RPCs | medium |
| **7** | CI: RLS cross-couple test suite + device-migration E2E (§9); nightly invariant monitor + alerting | low |

Rollback posture: phases 1–4 are additive (new columns/RPCs/indexes); phase 5 keeps the old
`id` column intact until verified; phase 6 only removes code paths that phases 1–5 made dead.

---

## 13. Production-grade recommendations (millions of couples)

1. **Invariant monitoring is the product.** The nightly cron (§10.5) plus a dashboard of
   "couples in invalid states = 0" is the only honest definition of "impossible to break".
2. **Scale unit = couple.** Every query is couple-sharded by design; at large scale,
   partition the biggest content tables by `hash(couple_id)` and keep the
   `(couple_id, updated_at)` index as the universal access path. No cross-couple query
   exists in the product, so this scales linearly.
3. **Keep Postgres + RLS as the trust boundary**; resist moving authorization into app
   servers. Add read replicas for the delta-pull path before sharding.
4. **PITR + daily logical backups** of `couples`, `couple_memberships`,
   `relationship_facts`, `sync_deletions`, `media_assets` (the relationship skeleton is tiny;
   back it up aggressively and separately from bulk content).
5. **Soft-delete everywhere** (status columns + tombstones, already the pattern); hard
   deletes only via the GDPR erasure flow.
6. **Idempotency**: all lifecycle RPCs already are (ON CONFLICT / FOR UPDATE); keep that bar
   for every new RPC — retried mobile requests are the common case.
7. **Observability**: log every membership/status transition into an append-only
   `relationship_events` audit table (who, what, when, via which RPC) — cheap now,
   invaluable for support tickets ("why did my link break?") forever.
8. **Staging discipline**: phases marked high-risk gate on a staging run against a prod
   snapshot; the §5a-style audit-before-enforce pattern from the June-4 migration is the
   template.
