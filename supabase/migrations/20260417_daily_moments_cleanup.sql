create extension if not exists pgcrypto;

create table if not exists public.media_cleanup_tasks (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_row_id text not null,
  logical_item_id text not null,
  couple_id uuid not null,
  feature text not null,
  storage_paths text[] not null default '{}',
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists media_cleanup_tasks_source_row_uidx
  on public.media_cleanup_tasks (source_table, source_row_id);

create index if not exists media_cleanup_tasks_pending_idx
  on public.media_cleanup_tasks (status, run_after, created_at);

create index if not exists media_cleanup_tasks_feature_idx
  on public.media_cleanup_tasks (feature, status, run_after);

alter table public.media_cleanup_tasks enable row level security;
alter table public.media_cleanup_tasks force row level security;

revoke all on table public.media_cleanup_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.media_cleanup_tasks to service_role;

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
      coalesce(nullif(split_part(dp.id, ':', 2), ''), nullif(dp.data->>'id', ''), dp.id) as logical_item_id,
      dp.couple_id,
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
      nullif(dp.data->>'expiresAt', '')::timestamptz as expires_at
    from public.daily_photos dp
    where dp.couple_id is not null
      and nullif(dp.data->>'expiresAt', '') is not null
      and nullif(dp.data->>'expiresAt', '')::timestamptz <= now()
    order by nullif(dp.data->>'expiresAt', '')::timestamptz asc, dp.created_at asc
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
  deleted as (
    delete from public.daily_photos dp
    using inserted i
    where dp.id = i.source_row_id
    returning dp.id
  )
  select
    (select count(*)::integer from inserted),
    (select count(*)::integer from deleted);
end;
$$;

revoke all on function public.enqueue_expired_daily_photo_cleanup(integer) from public, anon, authenticated;
grant execute on function public.enqueue_expired_daily_photo_cleanup(integer) to service_role;

create or replace function public.claim_media_cleanup_tasks(target_feature text default null, batch_size integer default 50)
returns setof public.media_cleanup_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select t.id
    from public.media_cleanup_tasks t
    where t.status = 'pending'
      and t.run_after <= now()
      and (target_feature is null or t.feature = target_feature)
    order by t.run_after asc, t.created_at asc
    limit greatest(coalesce(batch_size, 50), 1)
    for update skip locked
  ),
  claimed as (
    update public.media_cleanup_tasks t
    set
      status = 'processing',
      attempts = t.attempts + 1,
      last_error = null
    from claimable c
    where t.id = c.id
    returning t.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_media_cleanup_tasks(text, integer) from public, anon, authenticated;
grant execute on function public.claim_media_cleanup_tasks(text, integer) to service_role;

