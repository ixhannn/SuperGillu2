create or replace function public.safe_timestamptz(value text)
returns timestamptz
language plpgsql
stable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  return value::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function public.enqueue_expired_daily_photo_cleanup(batch_size integer default 100)
returns table (
  queued_count integer,
  deleted_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    select
      dp.id as source_row_id,
      dp.couple_id,
      coalesce(dp.data->>'id', dp.id::text) as logical_item_id,
      array_remove(
        array[
          nullif(dp.data->>'storagePath', ''),
          nullif(dp.data->>'videoStoragePath', ''),
          case
            when coalesce(dp.data->>'image', '') <> ''
              and dp.data->>'image' not like 'data:%'
            then dp.data->>'image'
            else null
          end,
          case
            when coalesce(dp.data->>'video', '') <> ''
              and dp.data->>'video' not like 'data:%'
            then dp.data->>'video'
            else null
          end
        ],
        null
      ) as storage_paths,
      expiry.effective_expires_at
    from public.daily_photos dp
    cross join lateral (
      select coalesce(
        public.safe_timestamptz(dp.data->>'expiresAt'),
        public.safe_timestamptz(dp.data->>'createdAt') + interval '24 hours',
        case
          when coalesce(dp.data->>'id', dp.id::text) ~ '^[0-9]{12,}$'
          then to_timestamp((coalesce(dp.data->>'id', dp.id::text))::double precision / 1000) + interval '24 hours'
          else null
        end
      ) as effective_expires_at
    ) expiry
    where dp.couple_id is not null
      and expiry.effective_expires_at <= now()
    order by effective_expires_at asc
    limit greatest(coalesce(batch_size, 100), 1)
    for update skip locked
  ),
  inserted as (
    insert into public.media_cleanup_tasks (
      source_table,
      source_row_id,
      logical_item_id,
      couple_id,
      feature,
      storage_paths,
      run_after,
      status
    )
    select
      'daily_photos',
      expired.source_row_id,
      expired.logical_item_id,
      expired.couple_id,
      'daily-moments',
      expired.storage_paths,
      now(),
      'pending'
    from expired
    on conflict (source_table, source_row_id) do nothing
    returning source_row_id
  ),
  deleted_rows as (
    delete from public.daily_photos dp
    using inserted i
    where dp.id = i.source_row_id
    returning dp.id
  )
  select
    (select count(*)::integer from inserted),
    (select count(*)::integer from deleted_rows);
end;
$$;

revoke all on function public.safe_timestamptz(text) from public, anon, authenticated;
grant execute on function public.safe_timestamptz(text) to service_role;

revoke all on function public.enqueue_expired_daily_photo_cleanup(integer) from public, anon, authenticated;
grant execute on function public.enqueue_expired_daily_photo_cleanup(integer) to service_role;
