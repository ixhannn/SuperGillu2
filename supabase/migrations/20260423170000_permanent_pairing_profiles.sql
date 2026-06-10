-- Persist account display names so a couple link survives invite expiry,
-- device changes, and relogin without asking users to pair again.

do $$
begin
  if to_regclass('public.voice_notes') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'voice_notes'
      and column_name = 'couple_id'
      and data_type <> 'uuid'
  ) then
    alter table public.voice_notes
      alter column couple_id type uuid
      using case
        when nullif(couple_id::text, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then nullif(couple_id::text, '')::uuid
        else null
      end;
  end if;
end
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

create index if not exists user_profiles_display_name_idx
  on public.user_profiles(display_name);

drop policy if exists "user_profiles_select_pair" on public.user_profiles;
create policy "user_profiles_select_pair"
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.couple_memberships me
      join public.couple_memberships peer
        on peer.couple_id = me.couple_id
      where me.user_id = auth.uid()
        and peer.user_id = user_profiles.user_id
    )
  );

drop policy if exists "user_profiles_insert_self" on public.user_profiles;
create policy "user_profiles_insert_self"
  on public.user_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_profiles to authenticated;

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
    execute format(
      'create table if not exists public.%I (
        id text primary key,
        user_id uuid default auth.uid(),
        couple_id uuid,
        data jsonb not null default ''{}''::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )',
      app_table
    );

    execute format('alter table public.%I add column if not exists user_id uuid', app_table);
    execute format('alter table public.%I alter column user_id set default auth.uid()', app_table);
    execute format('alter table public.%I add column if not exists couple_id uuid', app_table);
    execute format('alter table public.%I add column if not exists data jsonb not null default ''{}''::jsonb', app_table);
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', app_table);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', app_table);
    execute format('create index if not exists %I on public.%I (user_id)', app_table || '_user_id_idx', app_table);
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
        user_id = auth.uid()
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = auth.uid()
          )
        )
      )',
      app_table || '_select_couple_member',
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        user_id = auth.uid()
        and (
          couple_id is null
          or exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = auth.uid()
          )
        )
      )',
      app_table || '_insert_couple_member',
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (
        user_id = auth.uid()
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = auth.uid()
          )
        )
      ) with check (
        user_id = auth.uid()
        and (
          couple_id is null
          or exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = auth.uid()
          )
        )
      )',
      app_table || '_update_couple_member',
      app_table,
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (
        user_id = auth.uid()
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = auth.uid()
          )
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

    if not has_user_id_column then
      continue;
    end if;

    if has_text_id_column then
      execute format(
        'update public.%I
            set user_id = $1,
                id = case
                       when id like ($2 || '':%%'') then id
                       else $2 || '':'' || id
                     end
          where user_id is null',
        app_table
      )
      using current_uid, current_uid::text;
    else
      execute format(
        'update public.%I
            set user_id = $1
          where user_id is null',
        app_table
      )
      using current_uid;
    end if;
  end loop;
end
$$;

revoke all on function public.claim_lior_legacy_rows() from public;
grant execute on function public.claim_lior_legacy_rows() to authenticated;

create or replace function public.backfill_user_rows_to_couple(target_couple_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  app_table text;
  has_user_id_column boolean;
  has_couple_id_column boolean;
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
        and c.column_name = 'couple_id'
    ) into has_couple_id_column;

    if not has_user_id_column or not has_couple_id_column then
      continue;
    end if;

    execute format(
      'update public.%I
          set couple_id = $1
        where user_id = $2
          and (couple_id is null or couple_id <> $1)',
      app_table
    )
    using target_couple_id, current_uid;
  end loop;
end
$$;

revoke all on function public.backfill_user_rows_to_couple(uuid) from public;
grant execute on function public.backfill_user_rows_to_couple(uuid) to authenticated;

create or replace function public.upsert_user_profile(profile_user_id uuid, profile_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_display_name text := nullif(trim(coalesce(profile_display_name, '')), '');
begin
  if profile_user_id is null or clean_display_name is null then
    return;
  end if;

  insert into public.user_profiles(user_id, display_name)
  values (profile_user_id, clean_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
end
$$;

revoke all on function public.upsert_user_profile(uuid, text) from public;

create or replace function public.claim_pair_invite(invite_code text)
returns table(couple_id uuid, partner_user_id uuid, partner_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  normalized_code text := upper(trim(invite_code));
  inv record;
  target_couple uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select code, user_id, user_name, expires_at, claimed_by
    into inv
  from public.pair_invites
  where code = normalized_code;

  if not found then
    raise exception 'invalid';
  end if;
  if inv.user_id = current_uid then
    raise exception 'self';
  end if;
  if inv.claimed_by is not null then
    raise exception 'used';
  end if;
  if inv.expires_at < now() then
    raise exception 'expired';
  end if;

  update public.pair_invites
     set claimed_by = current_uid,
         claimed_at = now()
   where code = normalized_code
     and claimed_by is null
     and expires_at > now();

  if not found then
    raise exception 'used';
  end if;

  perform public.upsert_user_profile(inv.user_id, coalesce(inv.user_name, ''));

  select m.couple_id into target_couple
  from public.couple_memberships m
  where m.user_id = inv.user_id
  order by
    exists (
      select 1
      from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> inv.user_id
    ) desc,
    m.created_at desc
  limit 1;

  if target_couple is null then
    insert into public.couples default values returning id into target_couple;
    insert into public.couple_memberships(couple_id, user_id, role)
    values (target_couple, inv.user_id, 'partner')
    on conflict do nothing;
  end if;

  if exists (
    select 1
    from public.couple_memberships m
    where m.user_id = current_uid
      and m.couple_id <> target_couple
      and exists (
        select 1
        from public.couple_memberships peer
        where peer.couple_id = m.couple_id
          and peer.user_id <> current_uid
      )
  ) then
    raise exception 'already_linked';
  end if;

  delete from public.couple_memberships stale
  where stale.user_id = current_uid
    and stale.couple_id <> target_couple
    and not exists (
      select 1
      from public.couple_memberships stale_peer
      where stale_peer.couple_id = stale.couple_id
        and stale_peer.user_id <> current_uid
    );

  insert into public.couple_memberships(couple_id, user_id, role)
  values (target_couple, current_uid, 'partner')
  on conflict do nothing;

  perform public.backfill_user_rows_to_couple(target_couple);

  return query
  select target_couple,
         inv.user_id,
         coalesce(partner_profile.display_name, inv.user_name, '')::text
  from (select 1) anchor
  left join public.user_profiles partner_profile
    on partner_profile.user_id = inv.user_id;
end
$$;

revoke all on function public.claim_pair_invite(text) from public;
grant execute on function public.claim_pair_invite(text) to authenticated;
