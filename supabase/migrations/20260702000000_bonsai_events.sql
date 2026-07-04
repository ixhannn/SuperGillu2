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
