-- ==============================================================
-- Lior — pending migrations, ordered for dashboard SQL-editor apply
-- Generated 2026-07-03. Every block below is idempotent; safe to re-run.
-- Run TOP-TO-BOTTOM in the Supabase SQL editor (Run once).
-- NOTE: do NOT 'supabase db push' these — 20260611000000 already exists
--       in prod history (client_error_logs), which would skip/duplicate.
-- ==============================================================

-- >>> [1/5] partner_lifecycle (orphan-membership cleanup + ON DELETE CASCADE FKs)
-- ============================================================================
-- Partner lifecycle hardening
--
-- Problem: couple_memberships.user_id had no foreign key to auth.users, so a
-- deleted account left an orphaned membership row behind. The surviving
-- partner's app kept reporting "Connected to X" and kept syncing into a
-- couple whose other member no longer existed, with no signal anywhere.
--
-- This migration:
--   1. removes membership rows that already point at deleted auth users
--   2. adds ON DELETE CASCADE foreign keys so future account deletions
--      clean up memberships, profiles, and invites automatically
--
-- The client detects the missing membership on its next sync and releases
-- the local pair lock (SyncService zombie-link guard).
-- ============================================================================

-- 1. Clean up rows orphaned before the FK existed.
delete from public.couple_memberships m
where not exists (select 1 from auth.users u where u.id = m.user_id);

-- 2. couple_memberships.user_id → auth.users(id) ON DELETE CASCADE
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'couple_memberships_user_id_fkey'
      and conrelid = 'public.couple_memberships'::regclass
  ) then
    alter table public.couple_memberships
      add constraint couple_memberships_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- 3. user_profiles.user_id → auth.users(id) ON DELETE CASCADE (if table exists)
do $$
begin
  if to_regclass('public.user_profiles') is not null
    and not exists (
      select 1 from pg_constraint
      where conname = 'user_profiles_user_id_fkey'
        and conrelid = 'public.user_profiles'::regclass
    ) then
    delete from public.user_profiles p
    where not exists (select 1 from auth.users u where u.id = p.user_id);

    alter table public.user_profiles
      add constraint user_profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- 4. pair_invites: issuer deletion removes their open invites; a deleted
--    claimer just nulls out (the invite is then visibly unclaimed/expired).
do $$
begin
  if to_regclass('public.pair_invites') is not null then
    delete from public.pair_invites i
    where not exists (select 1 from auth.users u where u.id = i.user_id);

    if not exists (
      select 1 from pg_constraint
      where conname = 'pair_invites_user_id_fkey'
        and conrelid = 'public.pair_invites'::regclass
    ) then
      alter table public.pair_invites
        add constraint pair_invites_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;
    end if;

    update public.pair_invites i
       set claimed_by = null
     where claimed_by is not null
       and not exists (select 1 from auth.users u where u.id = i.claimed_by);

    if not exists (
      select 1 from pg_constraint
      where conname = 'pair_invites_claimed_by_fkey'
        and conrelid = 'public.pair_invites'::regclass
    ) then
      alter table public.pair_invites
        add constraint pair_invites_claimed_by_fkey
        foreign key (claimed_by) references auth.users(id) on delete set null;
    end if;
  end if;
end
$$;

-- >>> [2/5] client_error_logs_ensure (recreate table missing from prod)
-- ============================================================================
-- client_error_logs — ENSURE the table actually exists in prod.
--
-- 20260611000000_client_error_logs.sql was recorded as applied in the remote
-- migration history, but the table was missing from the database (PostgREST
-- returned PGRST205 "Could not find the table 'public.client_error_logs'").
-- This migration re-applies the exact same definition idempotently, so a
-- straight `supabase db push` reconciles prod without history surgery, and
-- reloads the PostgREST schema cache.
--
-- Fully additive and idempotent. Safe to run whether or not the table exists.
-- ============================================================================

create table if not exists public.client_error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  couple_id   uuid references public.couples(id) on delete set null,
  kind        text not null default 'error',
  source      text,
  message     text,
  meta        jsonb,
  app_version text,
  user_agent  text,
  occurred_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists client_error_logs_created_at_idx
  on public.client_error_logs (created_at desc);
create index if not exists client_error_logs_user_idx
  on public.client_error_logs (user_id, created_at desc);

alter table public.client_error_logs enable row level security;
alter table public.client_error_logs force row level security;

-- Authenticated users may INSERT their own error rows only; no SELECT policy
-- (logs are read out-of-band via the service role / admin dashboard).
drop policy if exists "client_error_logs_insert_self" on public.client_error_logs;
create policy "client_error_logs_insert_self"
  on public.client_error_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert on public.client_error_logs to authenticated;

-- Make sure PostgREST picks up the (possibly newly-created) table immediately.
notify pgrst, 'reload schema';

-- >>> [3/5] fix_membership_select_recursion (42P17 blank-app fix)
-- ============================================================================
-- HOTFIX: infinite recursion in couple_memberships SELECT policy (SQLSTATE 42P17)
-- ----------------------------------------------------------------------------
-- The `memberships_select_self` policy (defined in 20260610 and re-affirmed in
-- 20260613) checks peer visibility with a bare:
--
--     exists (select 1 from public.couple_memberships me
--             where me.couple_id = couple_memberships.couple_id
--               and me.user_id = auth.uid() ...)
--
-- Because that sub-select reads couple_memberships from WITHIN the table's own
-- SELECT policy, Postgres re-applies the same policy to the inner read and
-- raises "infinite recursion detected in policy for relation couple_memberships".
-- Every couple-scoped read chains through this (memories/keepsakes/daily_photos/
-- couples/user_profiles/sync_deletions all do `exists(select 1 from
-- couple_memberships ...)`), so the entire app fails to read data and renders a
-- blank screen.
--
-- FIX: move the peer-visibility check into a SECURITY DEFINER function. A
-- definer function owned by the migration role (postgres, BYPASSRLS) reads
-- couple_memberships WITHOUT re-applying RLS, which breaks the recursion while
-- preserving identical semantics (you can see membership rows for any couple you
-- are an ACTIVE member of). auth.uid() still resolves the CALLER's JWT inside a
-- SECURITY DEFINER function, so this is not a privilege escalation — it only
-- answers "is the current user an active member of this couple?".
--
-- ADDITIVE + IDEMPOTENT. Safe to run on every environment.
-- ============================================================================

-- Non-recursive membership probe. STABLE: same result within a statement.
create or replace function public.current_user_in_couple(p_couple_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = p_couple_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$$;

revoke all on function public.current_user_in_couple(uuid) from public;
revoke all on function public.current_user_in_couple(uuid) from anon;
grant execute on function public.current_user_in_couple(uuid) to authenticated;

-- Recreate the SELECT policy using the helper instead of a recursive sub-select.
-- Semantics unchanged: own row OR active membership in the row's couple.
drop policy if exists "memberships_select_self" on public.couple_memberships;
create policy "memberships_select_self"
  on public.couple_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.current_user_in_couple(couple_id)
  );

-- >>> [4/5] bonsai_events (must precede plant_events)
-- Our Bonsai: append-only watering/note event log for the shared voxel tree.
-- One row per event with a DETERMINISTIC text id (`${coupleId}_${day}_${userId}_w`)
-- so writes are idempotent (offline replays / double taps can never duplicate a
-- day) and partners can never clobber each other — the tree state is derived
-- client-side from the full log (see utils/bonsai/growth.ts).

create extension if not exists pgcrypto;

create table if not exists public.bonsai_events (
  id text primary key,
  couple_id uuid not null,
  user_id uuid not null,
  event_type text not null default 'water' check (event_type in ('water', 'note_open')),
  day text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- The id is client-built but must be namespaced under the row's own couple:
  -- without this, a member of couple A could pre-insert an id shaped like
  -- couple B's future write and block/hijack it (id-squatting).
  constraint bonsai_events_id_prefix_matches_couple
    check (id like couple_id::text || '\_%' escape '\'),
  -- Client caps notes at 240 chars; enforce server-side so a raw API call
  -- can't bloat the couple's log with megabyte payloads.
  constraint bonsai_events_note_len
    check (payload->>'note' is null or length(payload->>'note') <= 240)
);

create index if not exists bonsai_events_couple_day_idx
  on public.bonsai_events (couple_id, day);

alter table public.bonsai_events enable row level security;
alter table public.bonsai_events force row level security;

drop policy if exists bonsai_events_select_couple_member on public.bonsai_events;
drop policy if exists bonsai_events_insert_couple_member on public.bonsai_events;
drop policy if exists bonsai_events_update_own on public.bonsai_events;
drop policy if exists bonsai_events_delete_couple_member on public.bonsai_events;

create policy bonsai_events_select_couple_member
on public.bonsai_events
for select
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = bonsai_events.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

create policy bonsai_events_insert_couple_member
on public.bonsai_events
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = bonsai_events.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

-- Authors may amend ONLY their own event (used to tuck a note into today's
-- blossom after watering). The log stays append-only for everyone else.
create policy bonsai_events_update_own
on public.bonsai_events
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = bonsai_events.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

-- Cleanup path (account deletion tooling); day-to-day flow never deletes.
create policy bonsai_events_delete_couple_member
on public.bonsai_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = bonsai_events.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

-- Enforce the append-only intent server-side: an UPDATE may only amend the
-- payload (the tucked-in note). Everything else on the row is immutable.
create or replace function public.bonsai_events_forbid_core_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.couple_id is distinct from old.couple_id
     or new.user_id is distinct from old.user_id
     or new.day is distinct from old.day
     or new.event_type is distinct from old.event_type then
    raise exception 'bonsai_events: only payload may be amended';
  end if;
  return new;
end;
$$;

drop trigger if exists bonsai_events_forbid_core_mutation on public.bonsai_events;
create trigger bonsai_events_forbid_core_mutation
before update on public.bonsai_events
for each row execute function public.bonsai_events_forbid_core_mutation();

-- Realtime delivery so a partner's watering appears live (idempotent).
do $$
begin
  alter publication supabase_realtime add table public.bonsai_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- >>> [5/5] bonsai_plant_events (alters bonsai_events)
-- The grove: completing an Ancient tree plants the next one (new species,
-- new DNA). A 'plant' event marks the boundary; both partners derive the
-- same garden from the shared log. Id shape: `${coupleId}_plant_${index}` —
-- deterministic across partners, so whoever plants first wins the race and
-- the other client's replay is an idempotent no-op.

alter table public.bonsai_events
  drop constraint if exists bonsai_events_event_type_check;

alter table public.bonsai_events
  add constraint bonsai_events_event_type_check
  check (event_type in ('water', 'note_open', 'plant'));

-- === END. If a new table doesn't appear via the API: notify pgrst, 'reload schema'; ===
