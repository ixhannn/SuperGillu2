-- Pair-invite claim throttle.
--
-- claim_pair_invite_v2() previously accepted unlimited guesses. Invite codes are
-- single-use and expire in 15 minutes, but with no per-caller throttle an
-- authenticated attacker could still spray guesses at a live code. This adds a
-- lightweight attempt ledger and caps each user at 10 claim attempts / 10 minutes.
--
-- The table has NO RLS and is not reachable by anon/authenticated directly; only
-- claim_pair_invite_v2() (SECURITY DEFINER) reads and writes it, so a client can
-- neither inspect nor forge the ledger.

create table if not exists public.pair_claim_attempts (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_pair_claim_attempts_lookup
  on public.pair_claim_attempts (user_id, attempted_at);

alter table public.pair_claim_attempts disable row level security;
revoke all on public.pair_claim_attempts from anon, authenticated;

-- Recreate the claim RPC with the throttle guard inserted immediately after the
-- auth check. Everything below the guard is unchanged from 20260509090000.
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
  recent_attempts int;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Brute-force throttle: opportunistically purge old rows, then cap this user at
  -- 10 attempts in a rolling 10-minute window. Every call (success or failure)
  -- counts, so a guesser burns their budget fast. Fails CLOSED with 'rate_limited'.
  delete from public.pair_claim_attempts
    where attempted_at < now() - interval '1 hour';

  select count(*) into recent_attempts
  from public.pair_claim_attempts
  where user_id = current_uid
    and attempted_at > now() - interval '10 minutes';

  if recent_attempts >= 10 then
    return query select false, 'rate_limited'::text, null::uuid, null::uuid, ''::text;
    return;
  end if;

  insert into public.pair_claim_attempts(user_id) values (current_uid);

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
