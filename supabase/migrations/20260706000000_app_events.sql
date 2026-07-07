-- ============================================================================
-- app_events — first-party product-analytics ledger.
--
-- A private, self-hosted event stream for the core funnel (onboarding_complete,
-- pair_invite_sent, pair_joined, ritual_completed, app_open, premium_tap).
-- Written best-effort, throttled + capped client-side in services/analytics.ts.
--
-- Same shape/security model as client_error_logs: authenticated users may INSERT
-- their own rows only and can NEVER read the table (no SELECT policy) — you read
-- it out-of-band via the service role / a saved SQL query. Anonymous
-- (pre-sign-in) funnel steps are captured by PostHog, not here (RLS needs a user).
--
-- Additive and idempotent. Safe to ship before/after the client change.
-- ============================================================================

create table if not exists public.app_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  couple_id   uuid references public.couples(id) on delete set null,
  name        text not null,
  props       jsonb,
  app_version text,
  occurred_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists app_events_created_at_idx
  on public.app_events (created_at desc);
create index if not exists app_events_name_idx
  on public.app_events (name, created_at desc);
create index if not exists app_events_couple_idx
  on public.app_events (couple_id, created_at desc);

alter table public.app_events enable row level security;
alter table public.app_events force row level security;

-- Authenticated users may INSERT their own event rows only. No SELECT policy, so
-- one user can never read another's events; analytics is queried via the service
-- role / an admin dashboard.
drop policy if exists "app_events_insert_self" on public.app_events;
create policy "app_events_insert_self"
  on public.app_events for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert on public.app_events to authenticated;
