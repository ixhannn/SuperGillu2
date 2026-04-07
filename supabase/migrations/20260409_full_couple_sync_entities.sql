-- Full couple sync entities for local-only features.
-- Adds table support for: our room, us bucket list, us wishlist, us milestones.

create extension if not exists pgcrypto;

do $$
declare
  table_name text;
  policy_name text;
  new_tables text[] := array[
    'our_room_state',
    'us_bucket_items',
    'us_wishlist_items',
    'us_milestones'
  ];
begin
  foreach table_name in array new_tables loop
    execute format(
      'create table if not exists public.%I (
        id text primary key,
        user_id uuid not null,
        couple_id uuid,
        data jsonb not null default ''{}''::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )',
      table_name
    );

    execute format('create index if not exists %I on public.%I (couple_id)', table_name || '_couple_id_idx', table_name);
    execute format('create index if not exists %I on public.%I (user_id)', table_name || '_user_id_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

    for policy_name in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (
         couple_id is not null
         and exists (
           select 1 from public.couple_memberships m
           where m.couple_id = %I.couple_id and m.user_id = auth.uid()
         )
       )',
      table_name || '_select_couple_member',
      table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
         user_id = auth.uid()
         and couple_id is not null
         and exists (
           select 1 from public.couple_memberships m
           where m.couple_id = %I.couple_id and m.user_id = auth.uid()
         )
       )',
      table_name || '_insert_couple_member',
      table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (
         couple_id is not null
         and exists (
           select 1 from public.couple_memberships m
           where m.couple_id = %I.couple_id and m.user_id = auth.uid()
         )
       ) with check (
         user_id = auth.uid()
         and couple_id is not null
         and exists (
           select 1 from public.couple_memberships m
           where m.couple_id = %I.couple_id and m.user_id = auth.uid()
         )
       )',
      table_name || '_update_couple_member',
      table_name,
      table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (
         couple_id is not null
         and exists (
           select 1 from public.couple_memberships m
           where m.couple_id = %I.couple_id and m.user_id = auth.uid()
         )
       )',
      table_name || '_delete_couple_member',
      table_name,
      table_name
    );
  end loop;
end
$$;

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
    'us_milestones'
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
