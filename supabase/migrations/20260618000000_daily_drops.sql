-- Daily Drop: one sealed, reciprocal, expiring drop per couple per day.
-- Item payload (type, prompt, responses{}, revealedAt, expiresAt) lives in `data`
-- jsonb, matching the generic synced-collection envelope. PK is `${coupleId}_${date}`
-- so there is exactly one row per couple per day; both partners upsert it and the
-- client unions `responses` by userKey (see services/storage.ts handleCloudUpdate).

create extension if not exists pgcrypto;

create table if not exists public.daily_drops (
  id text primary key,
  user_id uuid not null,
  couple_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_drops_couple_id_idx
  on public.daily_drops (couple_id);

create index if not exists daily_drops_user_id_idx
  on public.daily_drops (user_id);

alter table public.daily_drops enable row level security;
alter table public.daily_drops force row level security;

drop policy if exists daily_drops_select_couple_member on public.daily_drops;
drop policy if exists daily_drops_insert_couple_member on public.daily_drops;
drop policy if exists daily_drops_update_couple_member on public.daily_drops;
drop policy if exists daily_drops_delete_couple_member on public.daily_drops;

create policy daily_drops_select_couple_member
on public.daily_drops
for select
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = auth.uid()
  )
);

create policy daily_drops_insert_couple_member
on public.daily_drops
for insert
to authenticated
with check (
  user_id = auth.uid()
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = auth.uid()
  )
);

-- Update allows EITHER partner to upsert the shared daily row (both are couple
-- members). The updater stamps user_id to themselves; response merging is done
-- client-side so neither partner's answer is lost.
create policy daily_drops_update_couple_member
on public.daily_drops
for update
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = auth.uid()
  )
);

create policy daily_drops_delete_couple_member
on public.daily_drops
for delete
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = auth.uid()
  )
);

-- Realtime delivery (idempotent — ignore if already published).
do $$
begin
  alter publication supabase_realtime add table public.daily_drops;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- Keep the couple backfill aware of daily_drops so any user-owned rows are
-- adopted into the couple tenant on pairing.
create or replace function public.backfill_user_rows_to_couple(target_couple_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  table_name text;
  app_tables text[] := array[
    'memories',
    'notes',
    'dates',
    'envelopes',
    'daily_photos',
    'keepsakes',
    'dinner_options',
    'comments',
    'mood_entries',
    'couple_profile',
    'pet_stats',
    'user_status',
    'together_music',
    'our_room_state',
    'us_bucket_items',
    'us_wishlist_items',
    'us_milestones',
    'time_capsules',
    'surprises',
    'voice_notes',
    'private_space_items',
    'daily_drops'
  ];
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;
  if target_couple_id is null then
    raise exception 'target_couple_id required';
  end if;

  foreach table_name in array app_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'update public.%I
          set couple_id = $1
        where user_id = $2
          and (couple_id is null or couple_id <> $1)',
      table_name
    )
    using target_couple_id, current_uid;
  end loop;
end
$$;

revoke all on function public.backfill_user_rows_to_couple(uuid) from public;
grant execute on function public.backfill_user_rows_to_couple(uuid) to authenticated;
