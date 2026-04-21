create or replace function public.storage_repair_legacy_refs(max_rows integer default 100)
returns table (
  row_id text,
  user_id uuid,
  couple_id uuid,
  source_table text,
  logical_row_id text,
  feature text,
  field_name text,
  storage_path text,
  owner_user_id uuid,
  item_timestamp text,
  expires_at timestamptz,
  row_data jsonb
)
language sql
security definer
set search_path = public
as $$
  with refs as (
    select
      m.id::text as row_id,
      m.user_id,
      m.couple_id,
      'memories'::text as source_table,
      m.data->>'id' as logical_row_id,
      'memories'::text as feature,
      'storagePath'::text as field_name,
      m.data->>'storagePath' as storage_path,
      coalesce(
        case when nullif(m.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(m.data->>'ownerUserId', '')::uuid
          else null
        end,
        m.user_id
      ) as owner_user_id,
      coalesce(nullif(m.data->>'date', ''), nullif(m.data->>'createdAt', '')) as item_timestamp,
      null::timestamptz as expires_at,
      m.data as row_data
    from public.memories m

    union all

    select
      m.id::text,
      m.user_id,
      m.couple_id,
      'memories',
      m.data->>'id',
      'memories',
      'videoStoragePath',
      m.data->>'videoStoragePath',
      coalesce(
        case when nullif(m.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(m.data->>'ownerUserId', '')::uuid
          else null
        end,
        m.user_id
      ),
      coalesce(nullif(m.data->>'date', ''), nullif(m.data->>'createdAt', '')),
      null::timestamptz,
      m.data
    from public.memories m

    union all

    select
      d.id::text,
      d.user_id,
      d.couple_id,
      'daily_photos',
      d.data->>'id',
      'daily-moments',
      'storagePath',
      d.data->>'storagePath',
      coalesce(
        case when nullif(d.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(d.data->>'ownerUserId', '')::uuid
          else null
        end,
        d.user_id
      ),
      coalesce(nullif(d.data->>'createdAt', ''), nullif(d.data->>'date', '')),
      nullif(d.data->>'expiresAt', '')::timestamptz,
      d.data
    from public.daily_photos d

    union all

    select
      d.id::text,
      d.user_id,
      d.couple_id,
      'daily_photos',
      d.data->>'id',
      'daily-moments',
      'videoStoragePath',
      d.data->>'videoStoragePath',
      coalesce(
        case when nullif(d.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(d.data->>'ownerUserId', '')::uuid
          else null
        end,
        d.user_id
      ),
      coalesce(nullif(d.data->>'createdAt', ''), nullif(d.data->>'date', '')),
      nullif(d.data->>'expiresAt', '')::timestamptz,
      d.data
    from public.daily_photos d

    union all

    select
      k.id::text,
      k.user_id,
      k.couple_id,
      'keepsakes',
      k.data->>'id',
      'keepsakes',
      'storagePath',
      k.data->>'storagePath',
      coalesce(
        case when nullif(k.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(k.data->>'ownerUserId', '')::uuid
          else null
        end,
        k.user_id
      ),
      coalesce(nullif(k.data->>'date', ''), nullif(k.data->>'createdAt', '')),
      null::timestamptz,
      k.data
    from public.keepsakes k

    union all

    select
      k.id::text,
      k.user_id,
      k.couple_id,
      'keepsakes',
      k.data->>'id',
      'keepsakes',
      'videoStoragePath',
      k.data->>'videoStoragePath',
      coalesce(
        case when nullif(k.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(k.data->>'ownerUserId', '')::uuid
          else null
        end,
        k.user_id
      ),
      coalesce(nullif(k.data->>'date', ''), nullif(k.data->>'createdAt', '')),
      null::timestamptz,
      k.data
    from public.keepsakes k

    union all

    select
      t.id::text,
      t.user_id,
      t.couple_id,
      'time_capsules',
      t.data->>'id',
      'time-capsules',
      'storagePath',
      t.data->>'storagePath',
      coalesce(
        case when nullif(t.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(t.data->>'ownerUserId', '')::uuid
          else null
        end,
        t.user_id
      ),
      coalesce(nullif(t.data->>'createdAt', ''), nullif(t.data->>'unlockDate', '')),
      null::timestamptz,
      t.data
    from public.time_capsules t

    union all

    select
      s.id::text,
      s.user_id,
      s.couple_id,
      'surprises',
      s.data->>'id',
      'surprises',
      'storagePath',
      s.data->>'storagePath',
      coalesce(
        case when nullif(s.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(s.data->>'ownerUserId', '')::uuid
          else null
        end,
        s.user_id
      ),
      coalesce(nullif(s.data->>'createdAt', ''), nullif(s.data->>'date', '')),
      null::timestamptz,
      s.data
    from public.surprises s

    union all

    select
      v.id::text,
      v.user_id,
      v.couple_id,
      'voice_notes',
      v.data->>'id',
      'voice-notes',
      'audioStoragePath',
      v.data->>'audioStoragePath',
      coalesce(
        case when nullif(v.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(v.data->>'ownerUserId', '')::uuid
          else null
        end,
        v.user_id
      ),
      coalesce(nullif(v.data->>'createdAt', ''), nullif(v.data->>'date', '')),
      null::timestamptz,
      v.data
    from public.voice_notes v

    union all

    select
      tm.id::text,
      tm.user_id,
      tm.couple_id,
      'together_music',
      'singleton',
      'together-music',
      'music_url',
      tm.data->>'music_url',
      coalesce(
        case when nullif(tm.data->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(tm.data->>'ownerUserId', '')::uuid
          else null
        end,
        case when nullif(tm.data->'meta'->>'ownerUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(tm.data->'meta'->>'ownerUserId', '')::uuid
          else null
        end,
        tm.user_id
      ) as owner_user_id,
      coalesce(nullif(tm.data->'meta'->>'date', ''), nullif(tm.data->>'createdAt', '')),
      null::timestamptz,
      tm.data
    from public.together_music tm
  )
  select
    refs.row_id,
    refs.user_id,
    refs.couple_id,
    refs.source_table,
    refs.logical_row_id,
    refs.feature,
    refs.field_name,
    refs.storage_path,
    refs.owner_user_id,
    refs.item_timestamp,
    refs.expires_at,
    refs.row_data
  from refs
  where refs.storage_path is not null
    and refs.storage_path <> ''
    and refs.storage_path not like 'v2/couples/%'
    and refs.storage_path not like 'data:%'
  order by refs.couple_id, refs.source_table, refs.logical_row_id, refs.field_name
  limit greatest(max_rows, 1);
$$;

revoke all on function public.storage_repair_legacy_refs(integer) from public, anon, authenticated;
grant execute on function public.storage_repair_legacy_refs(integer) to service_role;
