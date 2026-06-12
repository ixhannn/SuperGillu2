-- ============================================================================
-- Security hardening (2026-06-10 codebase audit)
--
-- 1. backfill_user_rows_to_couple: verify the caller is a member of the
--    target couple. Without this, any authenticated user who learned another
--    couple's UUID could re-home their rows into that couple, making the rows
--    readable by strangers.
-- 2. couples: drop the open INSERT policy (WITH CHECK (true)). All couple
--    creation goes through the SECURITY DEFINER RPCs (ensure_user_couple,
--    claim_pair_invite); the open policy only allowed junk-row flooding.
-- 3. Rewrite all RLS policies to use (select auth.uid()) instead of bare
--    auth.uid() so the value is computed once per query instead of once per
--    row scanned (standard Supabase RLS performance guidance).
-- 4. Referential integrity: FKs from couple_memberships / pair_invites /
--    sync_deletions to auth.users and couples, with orphan cleanup first.
--    sync_deletions.user_id uses ON DELETE SET NULL because tombstones must
--    outlive their author (they permanently block item resurrection).
-- 5. Drop the unused user_profiles_display_name_idx (no query filters on
--    display_name; it only added write overhead).
--
-- NOTE: policies recreated here intentionally keep the exact semantics of
-- their previous definitions (20260407 / 20260418 / 20260423) — only the
-- auth.uid() call form changes. If a later migration refined any of these
-- policies, fold that refinement in here before applying.
-- ============================================================================

-- ── 1. Membership guard on backfill_user_rows_to_couple ─────────────────────
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

  -- SECURITY: the caller may only re-home rows into a couple they belong to.
  if not exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = target_couple_id
      and m.user_id = current_uid
  ) then
    raise exception 'not_a_member_of_target_couple';
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

-- ── 2. Close the open couples INSERT policy ─────────────────────────────────
drop policy if exists "couples_insert_authenticated" on public.couples;
revoke insert on public.couples from authenticated;
revoke insert on public.couples from anon;

-- ── 3a. couples / couple_memberships policies with (select auth.uid()) ──────
drop policy if exists "couples_select_member" on public.couples;
create policy "couples_select_member"
  on public.couples for select to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "couples_update_member" on public.couples;
create policy "couples_update_member"
  on public.couples for update to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "memberships_select_self" on public.couple_memberships;
create policy "memberships_select_self"
  on public.couple_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.couple_memberships me
      where me.couple_id = couple_memberships.couple_id
        and me.user_id = (select auth.uid())
    )
  );

drop policy if exists "memberships_insert_self" on public.couple_memberships;
create policy "memberships_insert_self"
  on public.couple_memberships for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "memberships_update_self" on public.couple_memberships;
create policy "memberships_update_self"
  on public.couple_memberships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 3b. pair_invites policies ────────────────────────────────────────────────
drop policy if exists "pair_invites_insert" on public.pair_invites;
create policy "pair_invites_insert"
  on public.pair_invites for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pair_invites_select" on public.pair_invites;
create policy "pair_invites_select"
  on public.pair_invites for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = claimed_by);

drop policy if exists "pair_invites_update" on public.pair_invites;
create policy "pair_invites_update"
  on public.pair_invites for update to authenticated
  using (claimed_by is null and expires_at > now())
  with check (claimed_by = (select auth.uid()) and expires_at > now());

drop policy if exists "pair_invites_delete" on public.pair_invites;
create policy "pair_invites_delete"
  on public.pair_invites for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ── 3c. user_profiles policies ───────────────────────────────────────────────
drop policy if exists "user_profiles_select_pair" on public.user_profiles;
create policy "user_profiles_select_pair"
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.couple_memberships me
      join public.couple_memberships peer
        on peer.couple_id = me.couple_id
      where me.user_id = (select auth.uid())
        and peer.user_id = user_profiles.user_id
    )
  );

drop policy if exists "user_profiles_insert_self" on public.user_profiles;
create policy "user_profiles_insert_self"
  on public.user_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 3d. sync_deletions policies ──────────────────────────────────────────────
drop policy if exists sync_deletions_select_couple_member on public.sync_deletions;
create policy sync_deletions_select_couple_member
on public.sync_deletions
for select
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists sync_deletions_insert_couple_member on public.sync_deletions;
create policy sync_deletions_insert_couple_member
on public.sync_deletions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists sync_deletions_update_couple_member on public.sync_deletions;
create policy sync_deletions_update_couple_member
on public.sync_deletions
for update
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists sync_deletions_delete_couple_member on public.sync_deletions;
create policy sync_deletions_delete_couple_member
on public.sync_deletions
for delete
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
  )
);

-- ── 3e. App data tables: regenerate the dynamic policies ────────────────────
-- Same shape as 20260423170000_permanent_pairing_profiles.sql, with
-- (select auth.uid()) substituted throughout.
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
        user_id = (select auth.uid())
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = (select auth.uid())
          )
        )
      )',
      app_table || '_select_couple_member',
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        user_id = (select auth.uid())
        and (
          couple_id is null
          or exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = (select auth.uid())
          )
        )
      )',
      app_table || '_insert_couple_member',
      app_table,
      app_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (
        user_id = (select auth.uid())
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = (select auth.uid())
          )
        )
      ) with check (
        user_id = (select auth.uid())
        and (
          couple_id is null
          or exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = (select auth.uid())
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
        user_id = (select auth.uid())
        or (
          couple_id is not null
          and exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id and m.user_id = (select auth.uid())
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

-- ── 3f. Storage policies on tulika-media ────────────────────────────────────
-- Keep the text comparison on couple_id (casting the path segment to uuid
-- would throw on legacy non-uuid prefixes); only the auth.uid() form changes.
drop policy if exists "tulika_media_select_couple" on storage.objects;
create policy "tulika_media_select_couple"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "tulika_media_insert_couple" on storage.objects;
create policy "tulika_media_insert_couple"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "tulika_media_update_couple" on storage.objects;
create policy "tulika_media_update_couple"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "tulika_media_delete_couple" on storage.objects;
create policy "tulika_media_delete_couple"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
    )
  );

-- ── 4. Referential integrity ─────────────────────────────────────────────────
-- couple_memberships.user_id -> auth.users (cascade: a deleted account's
-- membership must not keep granting shape to its former couple).
delete from public.couple_memberships m
where not exists (select 1 from auth.users u where u.id = m.user_id);

alter table public.couple_memberships
  drop constraint if exists couple_memberships_user_id_fkey;
alter table public.couple_memberships
  add constraint couple_memberships_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- pair_invites: creator cascades, claimer detaches.
delete from public.pair_invites p
where not exists (select 1 from auth.users u where u.id = p.user_id);

update public.pair_invites p
   set claimed_by = null
 where p.claimed_by is not null
   and not exists (select 1 from auth.users u where u.id = p.claimed_by);

alter table public.pair_invites
  drop constraint if exists pair_invites_user_id_fkey;
alter table public.pair_invites
  add constraint pair_invites_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.pair_invites
  drop constraint if exists pair_invites_claimed_by_fkey;
alter table public.pair_invites
  add constraint pair_invites_claimed_by_fkey
  foreign key (claimed_by) references auth.users(id) on delete set null;

-- sync_deletions: tombstones must survive author deletion (they permanently
-- block resurrection for the surviving partner), so user_id detaches instead
-- of cascading. couple_id cascades — a dead couple's ledger is useless.
alter table public.sync_deletions
  alter column user_id drop not null;

update public.sync_deletions s
   set user_id = null
 where s.user_id is not null
   and not exists (select 1 from auth.users u where u.id = s.user_id);

delete from public.sync_deletions s
where not exists (select 1 from public.couples c where c.id = s.couple_id);

alter table public.sync_deletions
  drop constraint if exists sync_deletions_user_id_fkey;
alter table public.sync_deletions
  add constraint sync_deletions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.sync_deletions
  drop constraint if exists sync_deletions_couple_id_fkey;
alter table public.sync_deletions
  add constraint sync_deletions_couple_id_fkey
  foreign key (couple_id) references public.couples(id) on delete cascade;

-- user_profiles.user_id -> auth.users
delete from public.user_profiles p
where not exists (select 1 from auth.users u where u.id = p.user_id);

alter table public.user_profiles
  drop constraint if exists user_profiles_user_id_fkey;
alter table public.user_profiles
  add constraint user_profiles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- ── 5. Drop the unused display_name index ────────────────────────────────────
drop index if exists public.user_profiles_display_name_idx;
