create or replace function public.admin_storage_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'total_couples', coalesce((
      select count(distinct ma.couple_id)
      from public.media_assets ma
    ), 0),
    'total_assets', coalesce((
      select count(*)
      from public.media_assets ma
    ), 0),
    'ready_assets', coalesce((
      select count(*)
      from public.media_assets ma
      where ma.status = 'ready'
    ), 0),
    'pending_assets', coalesce((
      select count(*)
      from public.media_assets ma
      where ma.status = 'pending'
    ), 0),
    'missing_assets', coalesce((
      select count(*)
      from public.media_assets ma
      where ma.status = 'missing'
    ), 0),
    'orphaned_assets', coalesce((
      select count(*)
      from public.media_assets ma
      where ma.status = 'orphaned'
    ), 0),
    'total_bytes', coalesce((
      select sum(ma.byte_size)
      from public.media_assets ma
      where ma.status in ('pending', 'ready', 'missing')
    ), 0),
    'open_alerts', coalesce((
      select count(*)
      from public.storage_alerts sa
      where sa.status = 'open'
    ), 0),
    'cleanup_backlog', coalesce((
      select count(*)
      from public.media_cleanup_tasks mct
      where mct.status in ('pending', 'processing')
    ), 0),
    'usage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature', feature,
        'object_count', object_count,
        'total_bytes', total_bytes,
        'missing_count', missing_count,
        'couple_count', couple_count
      ) order by total_bytes desc, feature asc)
      from (
        select
          ma.feature,
          count(*)::bigint as object_count,
          coalesce(sum(ma.byte_size), 0)::bigint as total_bytes,
          count(*) filter (where ma.status = 'missing')::bigint as missing_count,
          count(distinct ma.couple_id)::bigint as couple_count
        from public.media_assets ma
        where ma.status in ('pending', 'ready', 'missing')
        group by ma.feature
      ) usage_rows
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_storage_couple_usage(max_rows integer default 50)
returns table (
  couple_id uuid,
  object_count bigint,
  total_bytes bigint,
  missing_count bigint,
  open_alerts bigint,
  cleanup_backlog bigint,
  last_asset_update_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with asset_rollup as (
    select
      ma.couple_id,
      count(*)::bigint as object_count,
      coalesce(sum(ma.byte_size), 0)::bigint as total_bytes,
      count(*) filter (where ma.status = 'missing')::bigint as missing_count,
      max(ma.updated_at) as last_asset_update_at
    from public.media_assets ma
    group by ma.couple_id
  ),
  alert_rollup as (
    select
      sa.couple_id,
      count(*)::bigint as open_alerts
    from public.storage_alerts sa
    where sa.status = 'open'
    group by sa.couple_id
  ),
  cleanup_rollup as (
    select
      mct.couple_id,
      count(*)::bigint as cleanup_backlog
    from public.media_cleanup_tasks mct
    where mct.status in ('pending', 'processing')
    group by mct.couple_id
  )
  select
    ar.couple_id,
    ar.object_count,
    ar.total_bytes,
    ar.missing_count,
    coalesce(al.open_alerts, 0)::bigint as open_alerts,
    coalesce(cr.cleanup_backlog, 0)::bigint as cleanup_backlog,
    ar.last_asset_update_at
  from asset_rollup ar
  left join alert_rollup al on al.couple_id = ar.couple_id
  left join cleanup_rollup cr on cr.couple_id = ar.couple_id
  order by ar.total_bytes desc, ar.last_asset_update_at desc nulls last
  limit greatest(max_rows, 1);
$$;

create or replace function public.admin_storage_metrics(days_back integer default 14)
returns table (
  metric_date date,
  feature text,
  object_count bigint,
  total_bytes bigint,
  missing_object_count bigint,
  orphan_object_count bigint,
  legacy_ref_count bigint,
  expired_row_count bigint,
  alert_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sm.metric_date,
    sm.feature,
    coalesce(sum(sm.object_count), 0)::bigint as object_count,
    coalesce(sum(sm.total_bytes), 0)::bigint as total_bytes,
    coalesce(sum(sm.missing_object_count), 0)::bigint as missing_object_count,
    coalesce(sum(sm.orphan_object_count), 0)::bigint as orphan_object_count,
    coalesce(sum(sm.legacy_ref_count), 0)::bigint as legacy_ref_count,
    coalesce(sum(sm.expired_row_count), 0)::bigint as expired_row_count,
    coalesce(sum(sm.alert_count), 0)::bigint as alert_count
  from public.storage_metrics_daily sm
  where sm.metric_date >= current_date - greatest(days_back, 1)
  group by sm.metric_date, sm.feature
  order by sm.metric_date desc, total_bytes desc, sm.feature asc;
$$;

revoke all on function public.admin_storage_overview() from public, anon, authenticated;
revoke all on function public.admin_storage_couple_usage(integer) from public, anon, authenticated;
revoke all on function public.admin_storage_metrics(integer) from public, anon, authenticated;

grant execute on function public.admin_storage_overview() to service_role;
grant execute on function public.admin_storage_couple_usage(integer) to service_role;
grant execute on function public.admin_storage_metrics(integer) to service_role;
