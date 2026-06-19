-- ============================================================================
-- Membership authorization hardening (2026-06-13)
--
-- Fixes a LIVE cross-tenant data breach with two reinforcing root causes:
--
--   ROOT CAUSE 1 — Unconstrained membership INSERT.
--     The `memberships_insert_self` policy (20260407 :108, reaffirmed
--     20260610 :168) only checked `user_id = auth.uid()`. The target
--     `couple_id` was completely unconstrained, so ANY authenticated user
--     could `insert into couple_memberships (couple_id, user_id) values
--     ('<victim couple uuid>', auth.uid())` and join an arbitrary couple.
--
--   ROOT CAUSE 2 — Status-blind membership checks.
--     Every app-table / storage / sync / signal / push policy gates on a
--     bare `exists (select 1 from couple_memberships m where m.couple_id=...
--     and m.user_id = auth.uid())` with NO status filter. The
--     20260604 `one_active_couple_per_user` partial unique index only
--     covers `status='active'` rows, so an attacker could insert a row with
--     status='left' (or 'suspended') that DODGES the unique index yet STILL
--     satisfies the status-blind EXISTS check — granting full read/write to
--     the victim couple's memories / notes / daily_answers / media / etc.
--
-- THE FIX (this migration is idempotent and safe to run once on the live DB):
--   1. Backfill NULL membership status -> 'active' (legacy rows predating the
--      20260604 status column), then make EVERY membership check NULL-safe
--      via `coalesce(m.status,'active') = 'active'`. Legacy NULL is treated
--      as active (current members keep access); an attacker's EXPLICIT
--      'left'/'suspended' is excluded.
--   2. Lock down INSERT: all real membership creation is server-side inside
--      SECURITY DEFINER RPCs (ensure_user_couple / claim_pair_invite /
--      claim_pair_invite_v2 / restore_pair_from_claimed_invite), which run
--      with the function owner's rights and therefore bypass RLS. There is
--      NO legitimate client-side INSERT path, so we DROP the open policy and
--      REVOKE insert from authenticated. The RPCs are unaffected.
--   3. Add the NULL-safe status filter to every membership-EXISTS check
--      (app tables, couples, memberships peer branch, user_profiles peer
--      join, sync_deletions, daily_answers + daily_answer_mine_exists,
--      relationship_facts, tulika-media storage, relationship_signals,
--      device_push_tokens).
--   4. FORCE row level security on relationship_signals + device_push_tokens
--      (only ENABLE'd before — a table-owning role could bypass) and bring
--      their policies onto the same NULL-safe status form.
--
-- NOTE on (select auth.uid()): policies recreated here use the
-- `(select auth.uid())` form per Supabase RLS performance guidance, matching
-- 20260610. relationship_signals / device_push_tokens were on bare
-- auth.uid(); they are upgraded too.
-- ============================================================================

-- ── 0. Defensive: ensure the status column exists (no-op if 20260604 ran) ───
alter table public.couple_memberships
  add column if not exists status text;

-- ── 1. NULL-SAFE BACKFILL (must run BEFORE the policies that depend on it) ──
-- Legitimately-active legacy members may have status = NULL (the column was
-- added in 20260604). Treat NULL as active so this migration never locks out
-- a current member.
update public.couple_memberships
   set status = 'active'
 where status is null;

-- ============================================================================
-- 2. LOCK DOWN couple_memberships INSERT
-- ----------------------------------------------------------------------------
-- Approach: DROP + REVOKE (not a tightened WITH CHECK).
-- Justification (confirmed by reading the RPCs):
--   * ensure_user_couple()              (20260422164500) — SECURITY DEFINER, inserts membership
--   * claim_pair_invite(text)           (20260507143000) — SECURITY DEFINER, inserts membership
--   * claim_pair_invite_v2(text,text)   (20260509090000) — SECURITY DEFINER, inserts membership
--   * restore_pair_from_claimed_invite()(20260507143000) — SECURITY DEFINER, inserts membership
-- All membership creation flows through these definer RPCs (they run as the
-- function owner and bypass RLS), so removing the client INSERT grant does
-- NOT break real pairing. The client never inserts memberships directly.
-- ============================================================================
drop policy if exists "memberships_insert_self" on public.couple_memberships;
revoke insert on public.couple_memberships from authenticated;
revoke insert on public.couple_memberships from anon;

-- ── 3a. couple_memberships SELECT — NULL-safe status on the peer branch ─────
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
        and coalesce(me.status, 'active') = 'active'
    )
  );

-- UPDATE policy stays self-only (a user may only touch their OWN membership
-- row, e.g. leaving). Re-affirm it with the (select auth.uid()) form.
drop policy if exists "memberships_update_self" on public.couple_memberships;
create policy "memberships_update_self"
  on public.couple_memberships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 3b. couples — NULL-safe status ──────────────────────────────────────────
drop policy if exists "couples_select_member" on public.couples;
create policy "couples_select_member"
  on public.couples for select to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "couples_update_member" on public.couples;
create policy "couples_update_member"
  on public.couples for update to authenticated
  using (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.couple_memberships m
      where m.couple_id = couples.id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

-- ── 3c. user_profiles — NULL-safe status on BOTH sides of the peer join ─────
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
        and coalesce(me.status, 'active') = 'active'
        and peer.user_id = user_profiles.user_id
        and coalesce(peer.status, 'active') = 'active'
    )
  );

-- ── 3d. sync_deletions — NULL-safe status ───────────────────────────────────
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
      and coalesce(m.status, 'active') = 'active'
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
      and coalesce(m.status, 'active') = 'active'
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
      and coalesce(m.status, 'active') = 'active'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
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
      and coalesce(m.status, 'active') = 'active'
  )
);

-- ── 3e. App data tables — regenerate dynamic policies with NULL-safe status ──
-- Same shape as 20260610 :3e, with `and coalesce(m.status,'active')='active'`
-- added to every membership-EXISTS sub-select.
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
            where m.couple_id = %I.couple_id
              and m.user_id = (select auth.uid())
              and coalesce(m.status, ''active'') = ''active''
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
            where m.couple_id = %I.couple_id
              and m.user_id = (select auth.uid())
              and coalesce(m.status, ''active'') = ''active''
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
            where m.couple_id = %I.couple_id
              and m.user_id = (select auth.uid())
              and coalesce(m.status, ''active'') = ''active''
          )
        )
      ) with check (
        user_id = (select auth.uid())
        and (
          couple_id is null
          or exists (
            select 1 from public.couple_memberships m
            where m.couple_id = %I.couple_id
              and m.user_id = (select auth.uid())
              and coalesce(m.status, ''active'') = ''active''
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
            where m.couple_id = %I.couple_id
              and m.user_id = (select auth.uid())
              and coalesce(m.status, ''active'') = ''active''
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

-- ── 3f. tulika-media storage policies — NULL-safe status ────────────────────
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
        and coalesce(m.status, 'active') = 'active'
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
        and coalesce(m.status, 'active') = 'active'
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
        and coalesce(m.status, 'active') = 'active'
    )
  )
  with check (
    bucket_id = 'tulika-media'
    and exists (
      select 1
      from public.couple_memberships m
      where m.couple_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
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
        and coalesce(m.status, 'active') = 'active'
    )
  );

-- ── 3g. daily_answers — NULL-safe status on the seal + helper ───────────────
-- The sealed-reveal helper checks ONLY the caller's own rows, but is the gate
-- that unlocks the partner's row, so keep it strict and correct. (No
-- membership check inside it — it self-looks-up daily_answers.) Re-create it
-- unchanged here only to keep the file self-describing of the seal contract;
-- the security-relevant change is the membership EXISTS in the SELECT policy.
create or replace function public.daily_answer_mine_exists(p_couple_id uuid, p_prompt_date date)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_answers
    where couple_id = p_couple_id
      and prompt_date = p_prompt_date
      and user_id = auth.uid()
  );
$$;

revoke all on function public.daily_answer_mine_exists(uuid, date) from public;
grant execute on function public.daily_answer_mine_exists(uuid, date) to authenticated;

drop policy if exists daily_answers_select_sealed on public.daily_answers;
create policy daily_answers_select_sealed
on public.daily_answers
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (
    exists (
      select 1 from public.couple_memberships m
      where m.couple_id = daily_answers.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
    and public.daily_answer_mine_exists(daily_answers.couple_id, daily_answers.prompt_date)
  )
);

drop policy if exists daily_answers_insert_self on public.daily_answers;
create policy daily_answers_insert_self
on public.daily_answers
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.couple_memberships m
    where m.couple_id = daily_answers.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

-- ── 3h. relationship_facts — make the existing status='active' NULL-safe ────
-- These already filtered status='active' (20260604), but a legacy NULL row
-- would have been (wrongly) excluded; coalesce keeps current members in.
drop policy if exists "relationship_facts_select_member" on public.relationship_facts;
create policy "relationship_facts_select_member"
  on public.relationship_facts for select to authenticated
  using (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  ));

drop policy if exists "relationship_facts_upsert_member" on public.relationship_facts;
create policy "relationship_facts_upsert_member"
  on public.relationship_facts for insert to authenticated
  with check (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  ));

drop policy if exists "relationship_facts_update_member" on public.relationship_facts;
create policy "relationship_facts_update_member"
  on public.relationship_facts for update to authenticated
  using (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  ))
  with check (exists (
    select 1 from public.couple_memberships m
    where m.couple_id = relationship_facts.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  ));

-- ============================================================================
-- 4. relationship_signals + device_push_tokens
-- ----------------------------------------------------------------------------
-- Both were only ENABLE'd (not FORCE'd) and used a status-blind
-- `couple_id IN (select couple_id from couple_memberships where user_id=...)`
-- subquery. FORCE RLS (so the table owner cannot bypass) and rewrite onto the
-- NULL-safe membership-EXISTS form.
-- ============================================================================

-- ── 4a. relationship_signals ────────────────────────────────────────────────
alter table public.relationship_signals force row level security;

drop policy if exists "couple members read signals" on public.relationship_signals;
create policy "couple members read signals"
  on public.relationship_signals for select to authenticated
  using (
    exists (
      select 1 from public.couple_memberships m
      where m.couple_id = relationship_signals.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users write own signals" on public.relationship_signals;
create policy "users write own signals"
  on public.relationship_signals for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.couple_memberships m
      where m.couple_id = relationship_signals.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users update own signals" on public.relationship_signals;
create policy "users update own signals"
  on public.relationship_signals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.couple_memberships m
      where m.couple_id = relationship_signals.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users delete own signals" on public.relationship_signals;
create policy "users delete own signals"
  on public.relationship_signals for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── 4b. device_push_tokens ──────────────────────────────────────────────────
alter table public.device_push_tokens force row level security;

drop policy if exists "couple members read tokens" on public.device_push_tokens;
create policy "couple members read tokens"
  on public.device_push_tokens for select to authenticated
  using (
    exists (
      select 1 from public.couple_memberships m
      where m.couple_id = device_push_tokens.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users write own tokens" on public.device_push_tokens;
create policy "users write own tokens"
  on public.device_push_tokens for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.couple_memberships m
      where m.couple_id = device_push_tokens.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users update own tokens" on public.device_push_tokens;
create policy "users update own tokens"
  on public.device_push_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.couple_memberships m
      where m.couple_id = device_push_tokens.couple_id
        and m.user_id = (select auth.uid())
        and coalesce(m.status, 'active') = 'active'
    )
  );

drop policy if exists "users delete own tokens" on public.device_push_tokens;
create policy "users delete own tokens"
  on public.device_push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- POST-CONDITIONS (manual verification on staging):
--   * select policyname, qual from pg_policies
--       where schemaname='public' and tablename='couple_memberships';
--     -> NO insert policy named memberships_insert_self.
--   * select has_table_privilege('authenticated','public.couple_memberships','INSERT');
--     -> false.
--   * Every membership EXISTS now contains coalesce(status,'active')='active'.
--   * relationship_signals + device_push_tokens are forced (relforcerowsecurity).
--   * Real pairing still works (RPCs are SECURITY DEFINER -> bypass RLS).
-- ============================================================================
