-- Private Space: shared couple-only vault items.
-- Media uses the managed R2 key namespace `private-space`; item metadata lives here.

create extension if not exists pgcrypto;

create table if not exists public.private_space_items (
  id text primary key,
  user_id uuid not null,
  couple_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_space_items_couple_id_idx
  on public.private_space_items (couple_id);

create index if not exists private_space_items_user_id_idx
  on public.private_space_items (user_id);

alter table public.private_space_items enable row level security;
alter table public.private_space_items force row level security;

drop policy if exists private_space_items_select_couple_member on public.private_space_items;
drop policy if exists private_space_items_insert_couple_member on public.private_space_items;
drop policy if exists private_space_items_update_couple_member on public.private_space_items;
drop policy if exists private_space_items_delete_couple_member on public.private_space_items;

create policy private_space_items_select_couple_member
on public.private_space_items
for select
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = private_space_items.couple_id
      and m.user_id = auth.uid()
  )
);

create policy private_space_items_insert_couple_member
on public.private_space_items
for insert
to authenticated
with check (
  user_id = auth.uid()
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = private_space_items.couple_id
      and m.user_id = auth.uid()
  )
);

create policy private_space_items_update_couple_member
on public.private_space_items
for update
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = private_space_items.couple_id
      and m.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = private_space_items.couple_id
      and m.user_id = auth.uid()
  )
);

create policy private_space_items_delete_couple_member
on public.private_space_items
for delete
to authenticated
using (
  couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = private_space_items.couple_id
      and m.user_id = auth.uid()
  )
);

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
    'private_space_items'
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
