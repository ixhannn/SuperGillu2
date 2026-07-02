-- ============================================================================
-- HOTFIX: infinite recursion in couple_memberships SELECT policy (SQLSTATE 42P17)
-- ----------------------------------------------------------------------------
-- The `memberships_select_self` policy (defined in 20260610 and re-affirmed in
-- 20260613) checks peer visibility with a bare:
--
--     exists (select 1 from public.couple_memberships me
--             where me.couple_id = couple_memberships.couple_id
--               and me.user_id = auth.uid() ...)
--
-- Because that sub-select reads couple_memberships from WITHIN the table's own
-- SELECT policy, Postgres re-applies the same policy to the inner read and
-- raises "infinite recursion detected in policy for relation couple_memberships".
-- Every couple-scoped read chains through this (memories/keepsakes/daily_photos/
-- couples/user_profiles/sync_deletions all do `exists(select 1 from
-- couple_memberships ...)`), so the entire app fails to read data and renders a
-- blank screen.
--
-- FIX: move the peer-visibility check into a SECURITY DEFINER function. A
-- definer function owned by the migration role (postgres, BYPASSRLS) reads
-- couple_memberships WITHOUT re-applying RLS, which breaks the recursion while
-- preserving identical semantics (you can see membership rows for any couple you
-- are an ACTIVE member of). auth.uid() still resolves the CALLER's JWT inside a
-- SECURITY DEFINER function, so this is not a privilege escalation — it only
-- answers "is the current user an active member of this couple?".
--
-- ADDITIVE + IDEMPOTENT. Safe to run on every environment.
-- ============================================================================

-- Non-recursive membership probe. STABLE: same result within a statement.
create or replace function public.current_user_in_couple(p_couple_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = p_couple_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$$;

revoke all on function public.current_user_in_couple(uuid) from public;
revoke all on function public.current_user_in_couple(uuid) from anon;
grant execute on function public.current_user_in_couple(uuid) to authenticated;

-- Recreate the SELECT policy using the helper instead of a recursive sub-select.
-- Semantics unchanged: own row OR active membership in the row's couple.
drop policy if exists "memberships_select_self" on public.couple_memberships;
create policy "memberships_select_self"
  on public.couple_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.current_user_in_couple(couple_id)
  );
