create table if not exists public.sync_deletions (
  id text primary key,
  user_id uuid not null,
  couple_id uuid not null,
  table_name text not null,
  logical_id text not null,
  deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sync_deletions_couple_table_logical_uidx
  on public.sync_deletions (couple_id, table_name, logical_id);

create index if not exists sync_deletions_couple_deleted_at_idx
  on public.sync_deletions (couple_id, deleted_at desc);

create or replace function public.touch_sync_deletions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_deletions_touch_updated_at on public.sync_deletions;

create trigger sync_deletions_touch_updated_at
before update on public.sync_deletions
for each row
execute function public.touch_sync_deletions_updated_at();

alter table public.sync_deletions enable row level security;
alter table public.sync_deletions force row level security;

drop policy if exists sync_deletions_select_couple_member on public.sync_deletions;
drop policy if exists sync_deletions_insert_couple_member on public.sync_deletions;
drop policy if exists sync_deletions_update_couple_member on public.sync_deletions;
drop policy if exists sync_deletions_delete_couple_member on public.sync_deletions;

create policy sync_deletions_select_couple_member
on public.sync_deletions
for select
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = auth.uid()
  )
);

create policy sync_deletions_insert_couple_member
on public.sync_deletions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = auth.uid()
  )
);

create policy sync_deletions_update_couple_member
on public.sync_deletions
for update
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = auth.uid()
  )
);

create policy sync_deletions_delete_couple_member
on public.sync_deletions
for delete
to authenticated
using (
  exists (
    select 1
    from public.couple_memberships m
    where m.couple_id = sync_deletions.couple_id
      and m.user_id = auth.uid()
  )
);
