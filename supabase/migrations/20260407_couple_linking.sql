create extension if not exists pgcrypto;

create table if not exists public.pair_invites (
  code text primary key,
  user_id uuid not null,
  user_name text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  claimed_by uuid,
  claimed_at timestamptz
);
alter table public.pair_invites enable row level security;

-- ============================================================================
-- Phase 0: pair_invites policy hardening (claim must pass explicit WITH CHECK)
-- ============================================================================
drop policy if exists "pair_invites_insert" on public.pair_invites;
create policy "pair_invites_insert"
  on public.pair_invites for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "pair_invites_select" on public.pair_invites;
create policy "pair_invites_select"
  on public.pair_invites for select to authenticated
  using (auth.uid() = user_id or auth.uid() = claimed_by);

drop policy if exists "pair_invites_update" on public.pair_invites;
create policy "pair_invites_update"
  on public.pair_invites for update to authenticated
  using (claimed_by is null and expires_at > now())
  with check (claimed_by = auth.uid() and expires_at > now());

drop policy if exists "pair_invites_delete" on public.pair_invites;
create policy "pair_invites_delete"
  on public.pair_invites for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- Phase 1: couple schema + couple scoped columns
-- ============================================================================
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_memberships (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'partner',
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create index if not exists couple_memberships_user_id_idx on public.couple_memberships(user_id);

alter table public.couples enable row level security;
alter table public.couple_memberships enable row level security;
alter table public.couples force row level security;
alter table public.couple_memberships force row level security;

drop policy if exists "couples_select_member" on public.couples;
create policy "couples_select_member"
  on public.couples for select to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "couples_insert_authenticated" on public.couples;
create policy "couples_insert_authenticated"
  on public.couples for insert to authenticated
  with check (true);

drop policy if exists "couples_update_member" on public.couples;
create policy "couples_update_member"
  on public.couples for update to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "memberships_select_self" on public.couple_memberships;
create policy "memberships_select_self"
  on public.couple_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.couple_memberships me
      where me.couple_id = couple_memberships.couple_id and me.user_id = auth.uid()
    )
  );

drop policy if exists "memberships_insert_self" on public.couple_memberships;
create policy "memberships_insert_self"
  on public.couple_memberships for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "memberships_update_self" on public.couple_memberships;
create policy "memberships_update_self"
  on public.couple_memberships for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Add couple_id to all app data tables and switch RLS to couple-scoped access.
do $$
declare
  table_name text;
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
    'together_music'
  ];
begin
  foreach table_name in array app_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table if exists public.%I add column if not exists couple_id uuid', table_name);
    execute format('create index if not exists %I on public.%I (couple_id)', table_name || '_couple_id_idx', table_name);
    execute format('alter table if exists public.%I enable row level security', table_name);
    execute format('alter table if exists public.%I force row level security', table_name);

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

-- ============================================================================
-- Phase 2 + 4: helper RPCs for couple bootstrap, linking, and backfill
-- ============================================================================
create or replace function public.ensure_user_couple()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  existing_couple uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select m.couple_id into existing_couple
  from public.couple_memberships m
  where m.user_id = current_uid
  limit 1;

  if existing_couple is not null then
    return existing_couple;
  end if;

  insert into public.couples default values returning id into existing_couple;
  insert into public.couple_memberships (couple_id, user_id, role)
  values (existing_couple, current_uid, 'partner')
  on conflict do nothing;

  return existing_couple;
end
$$;

revoke all on function public.ensure_user_couple() from public;
grant execute on function public.ensure_user_couple() to authenticated;

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
    'together_music'
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

  select m.couple_id into target_couple
  from public.couple_memberships m
  where m.user_id = inv.user_id
  limit 1;

  if target_couple is null then
    insert into public.couples default values returning id into target_couple;
    insert into public.couple_memberships(couple_id, user_id, role)
    values (target_couple, inv.user_id, 'partner')
    on conflict do nothing;
  end if;

  insert into public.couple_memberships(couple_id, user_id, role)
  values (target_couple, current_uid, 'partner')
  on conflict do nothing;

  perform public.backfill_user_rows_to_couple(target_couple);

  return query
  select target_couple, inv.user_id, coalesce(inv.user_name, '');
end
$$;

revoke all on function public.claim_pair_invite(text) from public;
grant execute on function public.claim_pair_invite(text) to authenticated;

-- ============================================================================
-- Storage policies: allow media path prefix to be a couple_id
-- Path format moves from <user_id>/... to <couple_id>/...
-- ============================================================================
drop policy if exists "tulika_media_select_own" on storage.objects;
drop policy if exists "tulika_media_insert_own" on storage.objects;
drop policy if exists "tulika_media_update_own" on storage.objects;
drop policy if exists "tulika_media_delete_own" on storage.objects;

create policy "tulika_media_select_couple"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = auth.uid()
    )
  );

create policy "tulika_media_insert_couple"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = auth.uid()
    )
  );

create policy "tulika_media_update_couple"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = auth.uid()
    )
  );

create policy "tulika_media_delete_couple"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = auth.uid()
    )
  );
