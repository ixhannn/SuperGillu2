-- Repair a permanent pair link from an already-claimed QR invite.
-- This is intentionally idempotent: it only uses invites involving auth.uid(),
-- preserves existing real paired couples, and removes stale solo memberships.

create or replace function public.restore_pair_from_claimed_invite()
returns table(couple_id uuid, partner_user_id uuid, partner_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  inv record;
  owner_uid uuid;
  claimer_uid uuid;
  target_couple uuid;
  partner_uid uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select code, user_id, user_name, claimed_by, claimed_at, created_at
    into inv
  from public.pair_invites
  where claimed_by is not null
    and (user_id = current_uid or claimed_by = current_uid)
  order by claimed_at desc nulls last, created_at desc
  limit 1;

  if not found then
    return;
  end if;

  owner_uid := inv.user_id;
  claimer_uid := inv.claimed_by;
  if owner_uid is null or claimer_uid is null or owner_uid = claimer_uid then
    return;
  end if;

  select owner_membership.couple_id
    into target_couple
  from public.couple_memberships owner_membership
  join public.couple_memberships claimer_membership
    on claimer_membership.couple_id = owner_membership.couple_id
   and claimer_membership.user_id = claimer_uid
  where owner_membership.user_id = owner_uid
  order by owner_membership.created_at desc
  limit 1;

  if target_couple is null then
    select m.couple_id
      into target_couple
    from public.couple_memberships m
    where m.user_id = owner_uid
    order by
      exists (
        select 1
        from public.couple_memberships peer
        where peer.couple_id = m.couple_id
          and peer.user_id <> owner_uid
      ) desc,
      m.created_at desc
    limit 1;
  end if;

  if target_couple is null then
    select m.couple_id
      into target_couple
    from public.couple_memberships m
    where m.user_id = claimer_uid
    order by
      exists (
        select 1
        from public.couple_memberships peer
        where peer.couple_id = m.couple_id
          and peer.user_id <> claimer_uid
      ) desc,
      m.created_at desc
    limit 1;
  end if;

  if target_couple is null then
    insert into public.couples default values returning id into target_couple;
  end if;

  if exists (
    select 1
    from public.couple_memberships m
    where m.user_id in (owner_uid, claimer_uid)
      and m.couple_id <> target_couple
      and exists (
        select 1
        from public.couple_memberships peer
        where peer.couple_id = m.couple_id
          and peer.user_id <> m.user_id
      )
  ) then
    return;
  end if;

  delete from public.couple_memberships stale
  where stale.user_id in (owner_uid, claimer_uid)
    and stale.couple_id <> target_couple
    and not exists (
      select 1
      from public.couple_memberships stale_peer
      where stale_peer.couple_id = stale.couple_id
        and stale_peer.user_id <> stale.user_id
    );

  insert into public.couple_memberships(couple_id, user_id, role)
  values
    (target_couple, owner_uid, 'partner'),
    (target_couple, claimer_uid, 'partner')
  on conflict do nothing;

  perform public.backfill_user_rows_to_couple(target_couple);

  partner_uid := case
    when current_uid = owner_uid then claimer_uid
    else owner_uid
  end;

  return query
  select target_couple,
         partner_uid,
         coalesce(partner_profile.display_name, case when partner_uid = owner_uid then inv.user_name else '' end, '')::text
  from (select 1) anchor
  left join public.user_profiles partner_profile
    on partner_profile.user_id = partner_uid;
end
$$;

revoke all on function public.restore_pair_from_claimed_invite() from public;
grant execute on function public.restore_pair_from_claimed_invite() to authenticated;
