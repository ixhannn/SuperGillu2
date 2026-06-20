-- ============================================================================
-- In-app account deletion (Apple 5.1.1(v) + GDPR right-to-erasure)
-- ----------------------------------------------------------------------------
-- THE PROBLEM
--   Most of the user's data is reachable two different ways:
--     * AUTH-CASCADE tables — a real FK to auth.users(id) with ON DELETE
--       CASCADE (couple_memberships, user_profiles, daily_answers,
--       relationship_signals, device_push_tokens, client_error_logs,
--       pair_invites.user_id). These purge "for free" the instant the edge
--       function calls auth.admin.deleteUser(callerId); this RPC need NOT
--       touch them. (pair_invites.claimed_by + sync_deletions.user_id are
--       ON DELETE SET NULL — the tombstones DELIBERATELY survive so they keep
--       blocking resurrection for a surviving partner; only author attribution
--       is nulled.)
--     * NO-FK tables — the 21 app-data tables (memories, notes, …,
--       private_space_items) plus media_assets carry a PLAIN `user_id uuid` and
--       a PLAIN `couple_id uuid` with NO foreign key to auth.users / couples
--       (see 20260407 :145, 20260417010000). Deleting the auth user therefore
--       does NOT cascade them, and the membership-gated RLS would block a
--       client from cross-deleting them. They must be removed EXPLICITLY by a
--       SECURITY DEFINER function that runs as the owner and bypasses RLS.
--
-- THE CONTRACT (founder-approved default)
--   Delete the caller's per-user data + their couple membership. Then:
--     * PAIRED  (>=1 OTHER active member remains): RETAIN all shared couple
--       data (the partner's copy). Only caller-AUTHORED app-data rows
--       (user_id = caller) are removed; the partner's rows on the same
--       couple_id are NEVER touched. The couples row + media survive.
--     * SOLO    (caller is the sole remaining active member, or has no couple):
--       additionally purge ALL couple-scoped data across the 21 app-data
--       tables + media_assets, then DELETE the public.couples row, which
--       cascades the real couples(id) FKs (relationship_facts, sync_deletions,
--       pair_invites.couple_id). A dead couple's tombstone ledger is useless.
--
--   "Active" follows the 20260613 NULL-safe convention:
--   coalesce(status,'active') = 'active'.
--
-- ORDERING (enforced by the edge function, supabase/functions/delete-account):
--   1. This RPC (no-FK explicit deletes + paired/solo branch) runs FIRST,
--      while the membership-based RLS is still intact.
--   2. The edge function purges R2 media (SOLO branch only).
--   3. auth.admin.deleteUser(callerId) runs LAST, firing every auth.users
--      cascade and revoking the session.
--   Running deleteUser first would drop the caller's membership and the
--   membership-gated RLS / worker auth could no longer authorize cleanup,
--   orphaning app-data + R2.
--
-- SECURITY
--   delete_my_account() derives the user id from auth.uid() ONLY — never an
--   argument — so a caller can only ever delete THEMSELVES. It is SECURITY
--   DEFINER (runs as owner, bypasses RLS) exactly like ensure_user_couple /
--   claim_pair_invite. It is idempotent: every delete tolerates already-gone
--   rows, so a retry after a partial edge-function failure is safe.
--
-- This migration is ADDITIVE and IDEMPOTENT.
-- ============================================================================

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  caller_couple uuid;
  other_active_members int := 0;
  is_sole_member boolean := false;
  app_table text;
  has_user_id_column boolean;
  has_couple_id_column boolean;
  -- The 21 couple-scoped app-data tables (identical list to the RLS migrations
  -- 20260407 / 20260610 / 20260613). Each has a plain user_id + couple_id uuid
  -- with NO FK, so neither the auth.users delete nor the couples delete cascades
  -- them — this function removes them explicitly.
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

  -- ── Resolve the caller's couple (prefer an ACTIVE membership) ──────────────
  -- Defensive: re-derive every call so a retry after a partial failure still
  -- behaves correctly. A user may belong to at most one active couple
  -- (one_active_couple_per_user, 20260604), but order by linked-then-recent to
  -- be safe.
  select m.couple_id into caller_couple
  from public.couple_memberships m
  where m.user_id = current_uid
    and coalesce(m.status, 'active') = 'active'
  order by
    exists (
      select 1 from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> current_uid
        and coalesce(peer.status, 'active') = 'active'
    ) desc,
    m.created_at desc
  limit 1;

  -- ── Determine paired vs solo ───────────────────────────────────────────────
  if caller_couple is not null then
    select count(*) into other_active_members
    from public.couple_memberships m
    where m.couple_id = caller_couple
      and m.user_id <> current_uid
      and coalesce(m.status, 'active') = 'active';
  end if;

  -- SOLO when the caller has no couple at all, or is the only active member.
  is_sole_member := (caller_couple is null) or (other_active_members = 0);

  -- ── (A) Per-user app-data deletes — caller-authored rows ONLY ──────────────
  -- ALWAYS runs (paired AND solo). Scoped to user_id = caller so a surviving
  -- partner keeps their OWN copies on the same couple_id. In the solo branch
  -- the couple-wide sweep below removes whatever remains, but doing the
  -- per-user pass unconditionally keeps the function correct even if the
  -- couple_id could not be resolved.
  foreach app_table in array app_tables loop
    if to_regclass(format('public.%I', app_table)) is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = app_table
        and c.column_name = 'user_id'
    ) into has_user_id_column;

    if not has_user_id_column then
      continue;
    end if;

    execute format('delete from public.%I where user_id = $1', app_table)
      using current_uid;
  end loop;

  -- media_assets: the caller's OWN R2 index rows (owner_user_id). The actual R2
  -- objects are erased by the edge function (worker bulk-purge) in the solo
  -- branch; here we just drop the caller's index rows so the admin dashboard
  -- never shows phantom assets for a deleted user. (In the solo branch the
  -- couple-wide sweep below also clears any owner_user_id = null rows.)
  if to_regclass('public.media_assets') is not null then
    delete from public.media_assets where owner_user_id = current_uid;
  end if;

  -- ── (B) SOLO branch — purge the couple's shared data + the couples row ──────
  if is_sole_member and caller_couple is not null then
    -- (B1) Couple-scoped app-data sweep across all 21 tables. NO FK to couples,
    -- so the couples delete below would NOT cascade them — remove explicitly.
    foreach app_table in array app_tables loop
      if to_regclass(format('public.%I', app_table)) is null then
        continue;
      end if;

      select exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = app_table
          and c.column_name = 'couple_id'
      ) into has_couple_id_column;

      if not has_couple_id_column then
        continue;
      end if;

      execute format('delete from public.%I where couple_id = $1', app_table)
        using caller_couple;
    end loop;

    -- (B2) media_assets index rows for the whole couple (R2 objects handled by
    -- the edge function). media_assets.couple_id has no FK to couples.
    if to_regclass('public.media_assets') is not null then
      delete from public.media_assets where couple_id = caller_couple;
    end if;

    -- (B3) Defensive: drop the caller's own membership BEFORE the couples row so
    -- the couple is genuinely empty. (auth.admin.deleteUser would also cascade
    -- it, but the RPC runs first and must leave nothing that re-grants access.)
    delete from public.couple_memberships
    where couple_id = caller_couple
      and user_id = current_uid;

    -- (B4) Delete the couples row. This auto-cascades the REAL couples(id) FKs:
    --   relationship_facts.couple_id   (20260604 :40, on delete cascade)
    --   sync_deletions.couple_id       (20260610 :541, on delete cascade)
    --   pair_invites.couple_id         (20260509 :76, on delete cascade)
    -- Any couple_memberships rows also cascade (20260407 :48). client_error_logs
    -- .couple_id is ON DELETE SET NULL (20260611 :14) — but the caller's logs are
    -- already gone via the auth.users cascade and no partner remains in solo.
    delete from public.couples where id = caller_couple;
  else
    -- ── PAIRED branch — leave shared data intact; just remove the caller ──────
    -- Drop ONLY the caller's membership so the partner keeps the couple, its
    -- shared rows, media, and the sync_deletions tombstones (which still block
    -- resurrection). auth.admin.deleteUser would also cascade this membership;
    -- removing it here keeps the function self-contained and idempotent.
    if caller_couple is not null then
      delete from public.couple_memberships
      where couple_id = caller_couple
        and user_id = current_uid;
    end if;
  end if;

  -- Report what happened so the edge function knows whether to purge R2 media.
  return jsonb_build_object(
    'ok', true,
    'couple_id', caller_couple,
    'sole_member', is_sole_member,
    'other_active_members', other_active_members
  );
end
$$;

-- Restrict EXECUTE. The edge function calls this with a SERVICE-ROLE client
-- (service_role), but the function reads auth.uid() from the forwarded caller
-- JWT context. Grant to authenticated as well so it works whether invoked via
-- the user session or the service role on the user's behalf; either way it can
-- only ever delete auth.uid() === the caller.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated, service_role;
