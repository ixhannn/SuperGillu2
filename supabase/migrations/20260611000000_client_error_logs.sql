-- ============================================================================
-- client_error_logs — remote sink for client-side errors / rejections.
--
-- Previously client errors lived only in each user's localStorage and were
-- invisible to the team. This table lets the app ship genuine faults to the
-- cloud (best-effort, throttled, capped client-side in services/errorSink.ts).
--
-- Additive and idempotent. Safe to ship before/after the client change.
-- ============================================================================

create table if not exists public.client_error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  couple_id   uuid references public.couples(id) on delete set null,
  kind        text not null default 'error',
  source      text,
  message     text,
  meta        jsonb,
  app_version text,
  user_agent  text,
  occurred_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists client_error_logs_created_at_idx
  on public.client_error_logs (created_at desc);
create index if not exists client_error_logs_user_idx
  on public.client_error_logs (user_id, created_at desc);

alter table public.client_error_logs enable row level security;
alter table public.client_error_logs force row level security;

-- Authenticated users may INSERT their own error rows only. They may NOT read
-- the table at all (no SELECT policy) — logs are read out-of-band via the
-- service role / admin dashboard, so one user can never read another's errors.
drop policy if exists "client_error_logs_insert_self" on public.client_error_logs;
create policy "client_error_logs_insert_self"
  on public.client_error_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert on public.client_error_logs to authenticated;
