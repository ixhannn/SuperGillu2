-- 20260709000000_admin_analytics_summary.sql
-- First-party analytics aggregation for the admin dashboard "Analytics" tab.
-- Reads public.app_events + public.client_error_logs and returns a single jsonb
-- payload. Called ONLY by the Cloudflare Worker via the service_role key
-- (SECURITY DEFINER + revoked from anon/authenticated).

create or replace function public.admin_analytics_summary(days int default 30)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with params as (
    select least(greatest(coalesce(days, 30), 1), 365) as d
  ),
  p as (
    select d, now() - (d::text || ' days')::interval as since from params
  ),
  ev as (
    select e.* from public.app_events e cross join p where e.created_at >= p.since
  ),

  -- top_pages: most-viewed screens
  top_pages as (
    select coalesce(
      jsonb_agg(jsonb_build_object('screen', screen, 'count', c) order by c desc, screen),
      '[]'::jsonb) as v
    from (
      select props->>'screen' as screen, count(*)::bigint as c
      from ev
      where name = 'screen_view' and nullif(trim(props->>'screen'), '') is not null
      group by props->>'screen'
      order by c desc
      limit 12
    ) t
  ),

  -- top_features: most-used features
  top_features as (
    select coalesce(
      jsonb_agg(jsonb_build_object('feature', feature, 'count', c) order by c desc, feature),
      '[]'::jsonb) as v
    from (
      select props->>'feature' as feature, count(*)::bigint as c
      from ev
      where name = 'feature_used' and nullif(trim(props->>'feature'), '') is not null
      group by props->>'feature'
      order by c desc
      limit 15
    ) t
  ),

  -- dwell_by_screen: average time-on-screen (ms), >= 3 samples
  dwell_by_screen as (
    select coalesce(
      jsonb_agg(jsonb_build_object('screen', screen, 'avg_ms', avg_ms, 'samples', samples) order by avg_ms desc),
      '[]'::jsonb) as v
    from (
      select
        props->>'screen' as screen,
        round(avg((props->>'dwell_ms')::numeric))::bigint as avg_ms,
        count(*)::bigint as samples
      from ev
      where name = 'screen_leave'
        and nullif(trim(props->>'screen'), '') is not null
        -- only cast values that are actually numeric, else ::numeric would throw
        and (props->>'dwell_ms') ~ '^\s*\d+(\.\d+)?\s*$'
      group by props->>'screen'
      having count(*) >= 3
      order by avg_ms desc
      limit 10
    ) t
  ),

  -- daily: last :days calendar days incl. zero-days, ascending
  daily as (
    select coalesce(
      jsonb_agg(jsonb_build_object('day', day, 'events', events, 'users', users) order by day),
      '[]'::jsonb) as v
    from (
      select
        g.day::date as day,
        count(e.id)::bigint as events,
        count(distinct e.user_id)::bigint as users
      from p
      cross join generate_series(current_date - (p.d - 1), current_date, interval '1 day') as g(day)
      left join public.app_events e
        on e.created_at::date = g.day::date and e.created_at >= p.since
      group by g.day
      order by g.day
    ) t
  ),

  -- rolling active users (independent of :days window)
  dau as (select count(distinct user_id)::bigint as c from public.app_events where created_at >= now() - interval '1 day'),
  wau as (select count(distinct user_id)::bigint as c from public.app_events where created_at >= now() - interval '7 days'),

  -- totals + funnel + premium taps (within :days window)
  agg as (
    select
      count(*)::bigint                                              as events,
      count(distinct user_id)::bigint                              as signed_in_users,
      count(distinct couple_id)::bigint                            as couples,
      count(*) filter (where name = 'app_open')::bigint            as app_opens,
      count(*) filter (where name = 'onboarding_complete')::bigint as onboarding_complete,
      count(*) filter (where name = 'pair_invite_sent')::bigint    as pair_invite_sent,
      count(*) filter (where name = 'pair_joined')::bigint         as pair_joined,
      count(*) filter (where name = 'ritual_completed')::bigint    as ritual_completed,
      count(*) filter (where name = 'premium_tap')::bigint         as premium_taps
    from ev
  ),

  -- recent_errors: newest 20
  recent_errors as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'message', message, 'source', source, 'app_version', app_version, 'created_at', created_at
      ) order by created_at desc),
      '[]'::jsonb) as v
    from (
      select message, source, app_version, created_at
      from public.client_error_logs
      order by created_at desc
      limit 20
    ) t
  ),
  error_count_24h as (select count(*)::bigint as c from public.client_error_logs where created_at >= now() - interval '24 hours'),
  error_count_window as (
    select count(*)::bigint as c from public.client_error_logs cross join p where created_at >= p.since
  )

  select jsonb_build_object(
    'range_days',       (select d from p),
    'top_pages',        (select v from top_pages),
    'top_features',     (select v from top_features),
    'dwell_by_screen',  (select v from dwell_by_screen),
    'daily',            (select v from daily),
    'dau',              (select c from dau),
    'wau',              (select c from wau),
    'totals', jsonb_build_object(
      'events',          (select events from agg),
      'signed_in_users', (select signed_in_users from agg),
      'couples',         (select couples from agg),
      'app_opens',       (select app_opens from agg)
    ),
    'funnel', jsonb_build_object(
      'app_open',            (select app_opens from agg),
      'onboarding_complete', (select onboarding_complete from agg),
      'pair_invite_sent',    (select pair_invite_sent from agg),
      'pair_joined',         (select pair_joined from agg),
      'ritual_completed',    (select ritual_completed from agg)
    ),
    'premium_taps',       (select premium_taps from agg),
    'recent_errors',      (select v from recent_errors),
    'error_count_24h',    (select c from error_count_24h),
    'error_count_window', (select c from error_count_window),
    'generated_at',       now()
  );
$$;

revoke all on function public.admin_analytics_summary(int) from public;
revoke all on function public.admin_analytics_summary(int) from anon;
revoke all on function public.admin_analytics_summary(int) from authenticated;
grant execute on function public.admin_analytics_summary(int) to service_role;

comment on function public.admin_analytics_summary(int) is
  'Admin-only first-party analytics summary over the last N days (default 30). SECURITY DEFINER; service_role only.';
