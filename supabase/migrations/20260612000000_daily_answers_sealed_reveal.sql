-- Daily Ritual Phase 3: per-user daily answers with SERVER-ENFORCED sealed reveal.
--
-- Moves the two-person daily question OFF the couple_profile singleton JSON blob
-- (services/storage.ts couple_profile.questions[]), which has two defects:
--   1. Clobber: both partners write the same singleton row; an in-flight answer
--      from one device overwrites the other on reconcile (last-write-wins).
--   2. Privacy hole: the partner's answer TEXT travels inside the shared singleton
--      BEFORE the mutual-reveal moment, so a determined client could read it early.
--
-- This table stores ONE row per user per day per couple. The SELECT policy
-- enforces a sealed reveal in the database: a caller may read the partner's row
-- ONLY after the caller has already inserted their OWN answer row for the same
-- (couple_id, prompt_date). No client code can bypass this — it is RLS, not UI.
--
-- Mirrors the shape/RLS conventions of 20260424000000_relationship_signals.sql
-- and 20260422000000_private_space_items.sql (couple_memberships membership check).
-- Membership in couple_memberships IS the "active member" signal: the table has
-- no status column (see 20260407_couple_linking.sql) — a row = an active member,
-- and 20260422164500_pairing_membership_stability.sql prunes stale solo rows.

create table if not exists public.daily_answers (
  -- Deterministic id => natural idempotent upsert and one row per user/day/couple.
  id          text        primary key,            -- '{couple_id}:{prompt_date}:{user_id}'
  user_id     uuid        not null references auth.users(id) on delete cascade,
  couple_id   uuid        not null,
  prompt_date date        not null,
  prompt_id   text,                               -- stable id/hash of the pooled question
  text        text        check (char_length(text) <= 600),
  created_at  timestamptz not null default now()
);

-- Partner-pair fetch for a given day (couple_id, prompt_date) — the hot path.
create index if not exists daily_answers_couple_date_idx
  on public.daily_answers (couple_id, prompt_date);

-- Exact-row lookups: "has THIS user answered for this day?" (drives the seal).
create index if not exists daily_answers_couple_date_user_idx
  on public.daily_answers (couple_id, prompt_date, user_id);

alter table public.daily_answers enable row level security;
alter table public.daily_answers force row level security;

-- Sealed-reveal helper: "has the calling user already answered this day?".
-- SECURITY DEFINER so this self-lookup on daily_answers runs WITHOUT re-applying
-- the table's own RLS. Inlining it as `exists (select 1 from daily_answers ...)`
-- directly inside the SELECT policy below would make the policy reference its own
-- table, and Postgres would raise "infinite recursion detected in policy for
-- relation daily_answers" on the very first read (the cloud read would error and
-- the client would silently fall back to the legacy leaky path). The function
-- only ever checks the CALLER's own rows (user_id = auth.uid()), so it leaks
-- nothing; search_path is pinned and EXECUTE is restricted to authenticated.
create or replace function public.daily_answer_mine_exists(p_couple_id uuid, p_prompt_date date)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_answers
    where couple_id = p_couple_id
      and prompt_date = p_prompt_date
      and user_id = auth.uid()
  );
$$;

revoke all on function public.daily_answer_mine_exists(uuid, date) from public;
grant execute on function public.daily_answer_mine_exists(uuid, date) to authenticated;

drop policy if exists daily_answers_select_sealed on public.daily_answers;
drop policy if exists daily_answers_insert_self   on public.daily_answers;

-- SELECT: sealed reveal.
--  (a) You can always read your OWN row.
--  (b) You can read a NON-self row (your partner's) ONLY when BOTH hold:
--        - you are an active member of that row's couple, AND
--        - you have already submitted your OWN answer for the same
--          (couple_id, prompt_date) — checked via the SECURITY DEFINER helper
--          above so the policy never references its own table (no recursion).
create policy daily_answers_select_sealed
on public.daily_answers
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    exists (
      select 1 from public.couple_memberships m
      where m.couple_id = daily_answers.couple_id
        and m.user_id = auth.uid()
    )
    and public.daily_answer_mine_exists(daily_answers.couple_id, daily_answers.prompt_date)
  )
);

-- INSERT: you may only write your OWN row, and only into a couple you belong to.
create policy daily_answers_insert_self
on public.daily_answers
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.couple_memberships m
    where m.couple_id = daily_answers.couple_id
      and m.user_id = auth.uid()
  )
);

-- NO update / delete policies: answers are immutable once sealed. With RLS forced
-- and no permissive UPDATE/DELETE policy, both operations are denied for everyone
-- (including the row owner) — a submitted answer can never be edited or rescinded,
-- which keeps the reveal honest.
