-- ============================================================================
-- Follow-up: authz hardening for SECURITY DEFINER functions (review findings)
-- ADDITIVE + IDEMPOTENT. CREATE OR REPLACE rebodies two functions and drops one
-- dead legacy RPC; safe to run on every environment.
-- ============================================================================

-- (1) delete_my_account: add a transaction-scoped advisory lock keyed on the
--     couple so two partners deleting their accounts concurrently are serialized.
--     Without it, both could read other_active_members = 1 and take the PAIRED
--     branch, leaving an orphaned couple row + couple-scoped data/media with no
--     active members (unreachable via membership-gated RLS — GDPR-relevant).
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
    -- Serialize concurrent deletions on the SAME couple: this advisory xact
    -- lock is held until commit, so two partners deleting at once cannot both
    -- observe other_active_members = 1 and both take the PAIRED branch, which
    -- would orphan the couple's shared data + media with zero active members.
    perform pg_advisory_xact_lock(hashtextextended(caller_couple::text, 0));
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

-- (2) prepare_media_asset_upload: stop trusting the client-supplied
--     p_owner_user_id. owner_user_id drives account-deletion accounting, so a
--     client could mis-attribute an asset to another couple member. Coerce the
--     owner to auth.uid() on both INSERT and the ON CONFLICT upsert. The
--     p_owner_user_id parameter is kept for call-site/signature compatibility but
--     is now ignored for the owner column.
create or replace function public.prepare_media_asset_upload(
  p_source_table text,
  p_logical_row_id text,
  p_item_id text,
  p_feature text,
  p_asset_role text,
  p_r2_key text,
  p_byte_size bigint,
  p_mime_type text,
  p_checksum_sha256 text,
  p_owner_user_id uuid default null,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.media_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_existing public.media_assets;
  v_total_quota bigint := 536870912;
  v_feature_quota bigint;
  v_total_bytes bigint := 0;
  v_feature_bytes bigint := 0;
  v_excluded_bytes bigint := 0;
  v_result public.media_assets;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_couple_id := public.ensure_user_couple();
  if v_couple_id is null then
    raise exception 'Couple context unavailable';
  end if;

  if p_feature not in ('memories', 'daily-moments', 'keepsakes', 'time-capsules', 'surprises', 'voice-notes', 'together-music') then
    raise exception 'Unsupported media feature: %', p_feature;
  end if;

  if p_asset_role not in ('image', 'video', 'audio', 'track') then
    raise exception 'Unsupported asset role: %', p_asset_role;
  end if;

  if p_byte_size <= 0 then
    raise exception 'Media byte size must be positive';
  end if;

  v_feature_quota := case p_feature
    when 'memories' then 201326592
    when 'daily-moments' then 100663296
    when 'keepsakes' then 167772160
    when 'time-capsules' then 134217728
    when 'surprises' then 100663296
    when 'voice-notes' then 100663296
    when 'together-music' then 12582912
    else v_total_quota
  end;

  select *
  into v_existing
  from public.media_assets
  where couple_id = v_couple_id
    and source_table = p_source_table
    and logical_row_id = p_logical_row_id
    and asset_role = p_asset_role
  limit 1;

  v_excluded_bytes := coalesce(v_existing.byte_size, 0);

  select coalesce(sum(byte_size), 0)
  into v_total_bytes
  from public.media_assets
  where couple_id = v_couple_id
    and status in ('pending', 'ready', 'missing');

  select coalesce(sum(byte_size), 0)
  into v_feature_bytes
  from public.media_assets
  where couple_id = v_couple_id
    and feature = p_feature
    and status in ('pending', 'ready', 'missing');

  if (v_total_bytes - v_excluded_bytes + p_byte_size) > v_total_quota then
    raise exception 'Shared media storage quota exceeded';
  end if;

  if (v_feature_bytes - v_excluded_bytes + p_byte_size) > v_feature_quota then
    raise exception 'Feature storage quota exceeded for %', p_feature;
  end if;

  insert into public.media_assets (
    couple_id,
    owner_user_id,
    source_table,
    logical_row_id,
    item_id,
    feature,
    asset_role,
    r2_key,
    byte_size,
    mime_type,
    checksum_sha256,
    status,
    expires_at,
    metadata,
    upload_started_at,
    ready_at,
    last_verified_at,
    updated_at
  )
  values (
    v_couple_id,
    auth.uid(), -- owner is ALWAYS the authenticated caller (was client-supplied p_owner_user_id)
    p_source_table,
    p_logical_row_id,
    p_item_id,
    p_feature,
    p_asset_role,
    p_r2_key,
    p_byte_size,
    p_mime_type,
    p_checksum_sha256,
    'pending',
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb),
    now(),
    null,
    null,
    now()
  )
  on conflict (couple_id, source_table, logical_row_id, asset_role)
  do update set
    owner_user_id = auth.uid(), -- never trust a client-supplied owner on upsert
    item_id = excluded.item_id,
    feature = excluded.feature,
    r2_key = excluded.r2_key,
    byte_size = excluded.byte_size,
    mime_type = excluded.mime_type,
    checksum_sha256 = excluded.checksum_sha256,
    status = 'pending',
    expires_at = excluded.expires_at,
    metadata = excluded.metadata,
    upload_started_at = now(),
    ready_at = null,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- (3) Drop the dead, over-broad legacy claim RPC. claim_tulika_legacy_rows is a
--     SECURITY DEFINER that re-homes ANY user_id IS NULL row to the caller across
--     all app tables — a latent cross-tenant data-theft vector. The live client
--     uses claim_lior_legacy_rows instead (services/supabase.ts), so this one is
--     unreferenced and safe to remove.
revoke all on function public.claim_tulika_legacy_rows() from authenticated;
revoke all on function public.claim_tulika_legacy_rows() from anon;
drop function if exists public.claim_tulika_legacy_rows();
