-- Keep a paired user anchored to the shared couple instead of an old solo couple.

-- Existing accounts may have both:
-- 1. a solo couple created at signup
-- 2. the real shared couple created/claimed by pairing
-- Remove only stale solo memberships when the same user also belongs to a
-- couple that has another member.
delete from public.couple_memberships stale
where exists (
  select 1
  from public.couple_memberships linked
  where linked.user_id = stale.user_id
    and linked.couple_id <> stale.couple_id
    and exists (
      select 1
      from public.couple_memberships peer
      where peer.couple_id = linked.couple_id
        and peer.user_id <> linked.user_id
    )
)
and not exists (
  select 1
  from public.couple_memberships stale_peer
  where stale_peer.couple_id = stale.couple_id
    and stale_peer.user_id <> stale.user_id
);

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
  order by
    exists (
      select 1
      from public.couple_memberships peer
      where peer.couple_id = m.couple_id
        and peer.user_id <> current_uid
    ) desc,
    m.created_at desc
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
  select target_couple, inv.user_id, coalesce(inv.user_name, '');
end
$$;

revoke all on function public.claim_pair_invite(text) from public;
grant execute on function public.claim_pair_invite(text) to authenticated;
