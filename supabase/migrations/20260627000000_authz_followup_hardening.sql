-- ============================================================================
-- Follow-up authz hardening (closes two cross-tenant holes found in review)
-- ============================================================================
-- 1) couple_memberships UPDATE: the 20260613 "memberships_update_self" policy
--    only checked user_id = auth.uid() in USING and WITH CHECK. couple_id is a
--    mutable column, so an authenticated user could
--        update couple_memberships set couple_id = '<victim couple>' where user_id = auth.uid()
--    and forge active membership in another couple — re-opening the exact
--    cross-tenant breach that 20260613 closed for INSERT. Every membership-gated
--    policy (memories, media, daily_*, relationship_*, etc.) would then grant
--    that user full read/write to the victim couple's private data.
--
--    The client NEVER updates couple_memberships directly (it only SELECTs;
--    grep: services/supabase.ts, cloudflare/worker.js). All legitimate
--    membership changes run inside SECURITY DEFINER RPCs that bypass RLS
--    (ensure_user_couple, claim_pair_invite, pairing_v2 RPCs,
--    restore_pair_from_claimed_invite). So revoking client UPDATE — mirroring
--    the INSERT lockdown in 20260613 — breaks nothing while closing the hole.
-- ----------------------------------------------------------------------------
drop policy if exists "memberships_update_self" on public.couple_memberships;
revoke update on public.couple_memberships from authenticated;
revoke update on public.couple_memberships from anon;

-- ----------------------------------------------------------------------------
-- 2) daily_drops policies were added (20260618) AFTER the 20260613 NULL-safe
--    membership hardening and were never given the
--        coalesce(m.status, 'active') = 'active'
--    filter that every other couple-scoped table got. A non-active membership
--    row (status='left'/'suspended') dodges the one_active_couple_per_user
--    unique index yet still satisfies a status-blind EXISTS — so it must not be
--    allowed to read/write a couple's sealed daily ritual. Recreate all four
--    policies with the status filter and the (select auth.uid()) form, matching
--    the 20260613 house style.
-- ----------------------------------------------------------------------------
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
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

create policy daily_drops_insert_couple_member
on public.daily_drops
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

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
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
)
with check (
  user_id = (select auth.uid())
  and couple_id is not null
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = daily_drops.couple_id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
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
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);
