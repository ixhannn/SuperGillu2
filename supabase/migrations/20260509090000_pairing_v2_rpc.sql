-- Pairing V2: server-owned invite creation, atomic claim, and durable status.

create extension if not exists pgcrypto;

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

alter table if exists public.pair_invites
  add column if not exists couple_id uuid references public.couples(id) on delete cascade;

alter table if exists public.pair_invites
  add column if not exists revoked_at timestamptz;

alter table if exists public.pair_invites
  add column if not exists updated_at timestamptz not null default now();

create index if not exists pair_invites_user_active_idx
  on public.pair_invites(user_id, claimed_by, expires_at, revoked_at);

create index if not exists pair_invites_couple_id_idx
  on public.pair_invites(couple_id);

create or replace function public.generate_pair_code_v2()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  output text := '';
  idx int;
begin
  for idx in 0..7 loop
    output := output || substr(alphabet, (get_byte(bytes, idx) % length(alphabet)) + 1, 1);
  end loop;
  return output;
end
$$;

revoke all on function public.generate_pair_code_v2() from public;

create or replace function public.backfill_user_rows_to_couple_for_user(target_couple_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if target_couple_id is null or target_user_id is null then
    return;
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
    using target_couple_id, target_user_id;
  end loop;
end
$$;

revoke all on function public.backfill_user_rows_to_couple_for_user(uuid, uuid) from public;

create or replace function public.create_pair_invite_v2(force_rotate boolean default false, display_name text default null)
returns table(code text, expires_at timestamptz, couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  clean_name text := nullif(trim(coalesce(display_name, '')), '');
  target_couple uuid;
  candidate_code text;
  inserted_code text;
  inserted_expires_at timestamptz;
  attempts int := 0;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if clean_name is not null then
    perform public.upsert_user_profile(current_uid, clean_name);
  end if;

  target_couple := public.ensure_user_couple();

  if force_rotate then
    update public.pair_invites
       set revoked_at = now(),
           updated_at = now()
     where user_id = current_uid
       and claimed_by is null
       and revoked_at is null;
  else
    select i.code, i.expires_at, coalesce(i.couple_id, target_couple)
      into code, expires_at, couple_id
    from public.pair_invites i
    where i.user_id = current_uid
      and i.claimed_by is null
      and i.revoked_at is null
      and i.expires_at > now()
    order by i.expires_at desc
    limit 1;

    if code is not null then
      return next;
      return;
    end if;
  end if;

  loop
    attempts := attempts + 1;
    candidate_code := public.generate_pair_code_v2();

    begin
      insert into public.pair_invites(code, user_id, user_name, couple_id, expires_at)
      values (
        candidate_code,
        current_uid,
        coalesce(clean_name, ''),
        target_couple,
        now() + interval '15 minutes'
      )
      returning pair_invites.code, pair_invites.expires_at
      into inserted_code, inserted_expires_at;

      code := inserted_code;
      expires_at := inserted_expires_at;
      couple_id := target_couple;
      return next;
      return;
    exception when unique_violation then
      if attempts >= 5 then
        raise exception 'code_collision';
      end if;
    end;
  end loop;
end
$$;

revoke all on function public.create_pair_invite_v2(boolean, text) from public;
grant execute on function public.create_pair_invite_v2(boolean, text) to authenticated;

create or replace function public.get_pairing_status_v2()
returns table(is_linked boolean, couple_id uuid, partner_user_id uuid, partner_name text, member_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  selected_couple uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select m.couple_id into selected_couple
  from public.couple_memberships m
  where m.user_id = current_uid
  order by
    exists (
      select 1
      from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> current_uid
    ) desc,
    m.created_at desc
  limit 1;

  if selected_couple is null then
    selected_couple := public.ensure_user_couple();
  end if;

  return query
  with members as (
    select m.user_id
    from public.couple_memberships m
    where m.couple_id = selected_couple
  ),
  partner as (
    select members.user_id
    from members
    where members.user_id <> current_uid
    limit 1
  )
  select
    exists(select 1 from partner) as is_linked,
    selected_couple as couple_id,
    (select partner.user_id from partner) as partner_user_id,
    coalesce((select up.display_name from public.user_profiles up where up.user_id = (select partner.user_id from partner)), '')::text as partner_name,
    (select count(*)::int from members) as member_count;
end
$$;

revoke all on function public.get_pairing_status_v2() from public;
grant execute on function public.get_pairing_status_v2() to authenticated;

create or replace function public.claim_pair_invite_v2(invite_code text, display_name text default null)
returns table(ok boolean, error text, couple_id uuid, partner_user_id uuid, partner_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  clean_name text := nullif(trim(coalesce(display_name, '')), '');
  normalized_code text := upper(regexp_replace(regexp_replace(coalesce(invite_code, ''), '^LIOR:', '', 'i'), '[^A-Za-z0-9]', '', 'g'));
  inv record;
  target_couple uuid;
  existing_linked_couple uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if clean_name is not null then
    perform public.upsert_user_profile(current_uid, clean_name);
  end if;

  select i.*
    into inv
  from public.pair_invites i
  where i.code = normalized_code
  for update;

  if not found then
    return query select false, 'invalid'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  if inv.revoked_at is not null then
    return query select false, 'invalid'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  if inv.user_id = current_uid then
    return query select false, 'self'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  if inv.claimed_by is not null then
    return query select false, 'used'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  if inv.expires_at <= now() then
    return query select false, 'expired'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  target_couple := inv.couple_id;
  if target_couple is null then
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
  end if;

  if target_couple is null then
    insert into public.couples default values returning id into target_couple;
  end if;

  select m.couple_id into existing_linked_couple
  from public.couple_memberships m
  where m.user_id = current_uid
    and m.couple_id <> target_couple
    and exists (
      select 1
      from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> current_uid
    )
  limit 1;

  if existing_linked_couple is not null then
    return query
    select false, 'already_linked'::text, s.couple_id, s.partner_user_id, s.partner_name
    from public.get_pairing_status_v2() s
    limit 1;
    return;
  end if;

  update public.pair_invites
     set claimed_by = current_uid,
         claimed_at = now(),
         updated_at = now()
   where code = normalized_code
     and claimed_by is null;

  if not found then
    return query select false, 'used'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  delete from public.couple_memberships stale
  where stale.user_id in (current_uid, inv.user_id)
    and stale.couple_id <> target_couple
    and not exists (
      select 1
      from public.couple_memberships stale_peer
      where stale_peer.couple_id = stale.couple_id
        and stale_peer.user_id <> stale.user_id
    );

  insert into public.couple_memberships(couple_id, user_id, role)
  values
    (target_couple, inv.user_id, 'partner'),
    (target_couple, current_uid, 'partner')
  on conflict do nothing;

  perform public.backfill_user_rows_to_couple_for_user(target_couple, inv.user_id);
  perform public.backfill_user_rows_to_couple_for_user(target_couple, current_uid);

  return query
  select
    true,
    null::text,
    target_couple,
    inv.user_id,
    coalesce(partner_profile.display_name, inv.user_name, '')::text
  from (select 1) anchor
  left join public.user_profiles partner_profile
    on partner_profile.user_id = inv.user_id;
end
$$;

revoke all on function public.claim_pair_invite_v2(text, text) from public;
grant execute on function public.claim_pair_invite_v2(text, text) to authenticated;
