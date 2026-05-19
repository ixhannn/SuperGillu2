-- P0 privacy lockdown: shared app content must be visible only to members of
-- the row's couple. User-owned solo visibility is not enough for couple data:
-- a fresh account with stale local or legacy rows must never inherit another
-- couple's memories, media, countdowns, room state, or private content.

do $$
declare
  app_table text;
  policy_name text;
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
  foreach app_table in array app_tables loop
    if to_regclass(format('public.%I', app_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I add column if not exists user_id uuid default auth.uid()', app_table);
    execute format('alter table public.%I add column if not exists couple_id uuid', app_table);
    execute format('create index if not exists %I on public.%I (couple_id)', app_table || '_couple_id_idx', app_table);
    execute format('alter table public.%I enable row level security', app_table);
    execute format('alter table public.%I force row level security', app_table);

    for policy_name in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = app_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, app_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (
        couple_id is not null
        and exists (
          select 1 from public.couple_memberships m
          where m.couple_id = %I.couple_id and m.user_id = auth.uid()
        )
      )',
      app_table || '_select_couple_member',
      app_table,
      app_table
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
      app_table || '_insert_couple_member',
      app_table,
      app_table
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
      app_table || '_update_couple_member',
      app_table,
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (
        couple_id is not null
        and exists (
          select 1 from public.couple_memberships m
          where m.couple_id = %I.couple_id and m.user_id = auth.uid()
        )
      )',
      app_table || '_delete_couple_member',
      app_table,
      app_table
    );
  end loop;
end
$$;

create or replace function public.claim_lior_legacy_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  app_table text;
  has_user_id_column boolean;
  has_text_id_column boolean;
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

  foreach app_table in array app_tables loop
    if to_regclass(format('public.%I', app_table)) is null then
      continue;
    end if;

    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = app_table
        and c.column_name = 'user_id'
    ) into has_user_id_column;

    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = app_table
        and c.column_name = 'id'
        and c.data_type in ('text', 'character varying')
    ) into has_text_id_column;

    if not has_user_id_column or not has_text_id_column then
      continue;
    end if;

    -- Never claim anonymous legacy rows for the current user. Those rows are
    -- ambiguous and must stay invisible until an explicit migration assigns a
    -- known owner/couple. This prevents a new account from becoming the owner
    -- of someone else's pre-couple data.
    execute format(
      'update public.%I
          set id = case
                     when id like ($1 || '':%%'') then id
                     else $1 || '':'' || id
                   end
        where user_id = $2
          and id not like ($1 || '':%%'')',
      app_table
    )
    using current_uid::text, current_uid;
  end loop;
end
$$;

revoke all on function public.claim_lior_legacy_rows() from public;
grant execute on function public.claim_lior_legacy_rows() to authenticated;
