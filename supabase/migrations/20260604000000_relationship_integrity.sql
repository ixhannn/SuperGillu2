-- ============================================================================
-- Relationship Integrity Foundation
-- ----------------------------------------------------------------------------
-- Purpose: make the couple relationship server-authoritative and impossible to
-- accidentally break. Fixes the root causes of:
--   * "onboarding repeats / anniversary asked again"  (device-local gate)
--   * "linked profiles unlink"                          (client heuristic couple pick)
--   * "duplicate relationships / orphaned users"        (no uniqueness invariant)
--   * "different devices show different states"          (no single authoritative read)
--
-- This migration is ADDITIVE and IDEMPOTENT. It does not drop or rewrite any
-- existing table. It is safe to run multiple times.
--
-- ⚠️ APPLY TO STAGING FIRST. Section 5 (uniqueness invariant) mutates data by
--    collapsing duplicate memberships. Verify the SELECT audit in Section 5a
--    returns the expected rows on staging BEFORE enabling Section 5c in prod.
-- ============================================================================

-- ── 1. Relationship lifecycle status (additive, defaulted) ──────────────────
alter table public.couples
  add column if not exists status text not null default 'active'
  check (status in ('pending','active','archived'));

alter table public.couples
  add column if not exists archived_at timestamptz;

alter table public.couple_memberships
  add column if not exists status text not null default 'active'
  check (status in ('active','left','suspended'));

create index if not exists couple_memberships_active_idx
  on public.couple_memberships(user_id)
  where status = 'active';

-- ── 2. relationship_facts: the AUTHORITATIVE shared singleton ───────────────
-- One row per couple. This is the real onboarding gate + the reconcilable
-- relationship-owned fields (anniversary, first-met, etc). Replaces the
-- device-local `lior_onboarded` flag as the source of truth.
create table if not exists public.relationship_facts (
  couple_id          uuid primary key references public.couples(id) on delete cascade,
  anniversary_date   date,
  first_met_date     date,
  status_label       text,
  onboarding_done    boolean not null default false,
  -- propose/confirm machinery for sensitive edits (Q1 / Q6):
  proposed           jsonb,        -- { field, value, proposed_by, proposed_at }
  set_by             uuid,
  confirmed_by_both  boolean not null default false,
  updated_at         timestamptz not null default now()
);

alter table public.relationship_facts enable row level security;
alter table public.relationship_facts force row level security;

drop policy if exists "relationship_facts_select_member" on public.relationship_facts;
create policy "relationship_facts_select_member"
  on public.relationship_facts for select to authenticated
  using (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

drop policy if exists "relationship_facts_upsert_member" on public.relationship_facts;
create policy "relationship_facts_upsert_member"
  on public.relationship_facts for insert to authenticated
  with check (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

drop policy if exists "relationship_facts_update_member" on public.relationship_facts;
create policy "relationship_facts_update_member"
  on public.relationship_facts for update to authenticated
  using (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

grant select, insert, update on public.relationship_facts to authenticated;

-- ── 3. Backfill: every existing couple gets a facts row ─────────────────────
-- A couple that already has data must NEVER be asked to onboard again, so we
-- seed onboarding_done = true wherever a couple_profile row already exists.
insert into public.relationship_facts (couple_id, onboarding_done)
select c.id, false
from public.couples c
on conflict (couple_id) do nothing;

do $$
begin
  if to_regclass('public.couple_profile') is not null then
    update public.relationship_facts rf
       set onboarding_done = true,
           updated_at = now()
     where exists (
       select 1 from public.couple_profile cp
       where cp.couple_id = rf.couple_id
     );
  end if;
end
$$;

-- ── 4. get_my_relationship(): THE authoritative read ────────────────────────
-- The client must call ONLY this to learn its couple. It must never run a
-- client-side membership heuristic or ensure_user_couple on the read path,
-- which is what let a device attach to the wrong (solo) couple.
create or replace function public.get_my_relationship()
returns table(
  couple_id uuid,
  status text,
  role text,
  partner_user_id uuid,
  partner_name text,
  onboarding_done boolean,
  member_count int
)
language plpgsql security definer set search_path = public as $$
declare
  current_uid uuid := auth.uid();
  chosen_couple uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Prefer an ACTIVE, LINKED couple (has a peer); fall back to most recent.
  select m.couple_id into chosen_couple
  from public.couple_memberships m
  where m.user_id = current_uid
    and m.status = 'active'
  order by
    exists (
      select 1 from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> current_uid
        and peer.status = 'active'
    ) desc,
    m.created_at desc
  limit 1;

  -- Only create a couple if the user has none at all (true first run).
  if chosen_couple is null then
    chosen_couple := public.ensure_user_couple();
    insert into public.relationship_facts (couple_id, onboarding_done)
    values (chosen_couple, false)
    on conflict (couple_id) do nothing;
  end if;

  return query
  with peer as (
    select m.user_id
    from public.couple_memberships m
    where m.couple_id = chosen_couple
      and m.user_id <> current_uid
      and m.status = 'active'
    limit 1
  )
  select
    chosen_couple,
    coalesce((select c.status from public.couples c where c.id = chosen_couple), 'active')::text,
    coalesce((select m.role from public.couple_memberships m
              where m.couple_id = chosen_couple and m.user_id = current_uid), 'partner')::text,
    (select peer.user_id from peer),
    coalesce((select up.display_name from public.user_profiles up
              where up.user_id = (select peer.user_id from peer)), '')::text,
    coalesce((select rf.onboarding_done from public.relationship_facts rf
              where rf.couple_id = chosen_couple), false),
    (select count(*)::int from public.couple_memberships m
      where m.couple_id = chosen_couple and m.status = 'active');
end
$$;

revoke all on function public.get_my_relationship() from public;
grant execute on function public.get_my_relationship() to authenticated;

-- ── 5. Uniqueness invariant — prevents duplicate / ghost relationships ──────
-- A user may belong to at most ONE active couple. This is the structural
-- guarantee behind "permanent linking". Creating the index will FAIL if the
-- current data already violates it (which is itself a symptom of the bug), so
-- we first audit, then collapse, then enforce.

-- 5a. AUDIT (run this SELECT on staging and review before enabling 5c):
--   select user_id, count(*) from public.couple_memberships
--   where status = 'active' group by user_id having count(*) > 1;

-- 5b. COLLAPSE: for any user in multiple active couples, keep the LINKED one
--     (a couple with a peer) and mark the rest 'left'. Reversible (no deletes).
update public.couple_memberships m
   set status = 'left'
 where m.status = 'active'
   and exists (
     -- there is another active membership for this user that is "more linked"
     select 1 from public.couple_memberships keep
     where keep.user_id = m.user_id
       and keep.couple_id <> m.couple_id
       and keep.status = 'active'
       and (
         -- keep wins if it has a peer and m does not
         exists (select 1 from public.couple_memberships p
                 where p.couple_id = keep.couple_id and p.user_id <> m.user_id and p.status='active')
         and not exists (select 1 from public.couple_memberships p
                 where p.couple_id = m.couple_id and p.user_id <> m.user_id and p.status='active')
       )
   );

-- 5c. ENFORCE: at most one active membership per user.
--     ⚠️ Only enable after 5a audit confirms 5b resolved all duplicates.
create unique index if not exists one_active_couple_per_user
  on public.couple_memberships(user_id)
  where status = 'active';

-- ============================================================================
-- ROLLBACK (if needed):
--   drop index if exists public.one_active_couple_per_user;
--   drop function if exists public.get_my_relationship();
--   drop table if exists public.relationship_facts;
--   alter table public.couples drop column if exists status, drop column if exists archived_at;
--   alter table public.couple_memberships drop column if exists status;
-- ============================================================================
