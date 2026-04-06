create extension if not exists pgcrypto;

do $$
declare
  table_name text;
  policy_name text;
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
    'together_music'
  ];
begin
  foreach table_name in array app_tables loop
    execute format('alter table if exists public.%I add column if not exists user_id uuid', table_name);
    execute format('alter table if exists public.%I alter column user_id set default auth.uid()', table_name);
    execute format('create index if not exists %I on public.%I (user_id)', table_name || '_user_id_idx', table_name);
    execute format('alter table if exists public.%I enable row level security', table_name);
    execute format('alter table if exists public.%I force row level security', table_name);

    for policy_name in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      table_name || '_select_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      table_name || '_insert_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      table_name || '_update_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      table_name || '_delete_own',
      table_name
    );
  end loop;
end
$$;

create or replace function public.claim_tulika_legacy_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  table_name text;
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
    'together_music'
  ];
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  foreach table_name in array app_tables loop
    execute format(
      'update public.%I
          set user_id = $1,
              id = case
                     when id like ($2 || '':%%'') then id
                     else $2 || '':'' || id
                   end
        where user_id is null',
      table_name
    )
    using current_uid, current_uid::text;
  end loop;
end
$$;

revoke all on function public.claim_tulika_legacy_rows() from public;
grant execute on function public.claim_tulika_legacy_rows() to authenticated;

insert into storage.buckets (id, name, public)
values ('tulika-media', 'tulika-media', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "tulika_media_select_own" on storage.objects;
drop policy if exists "tulika_media_insert_own" on storage.objects;
drop policy if exists "tulika_media_update_own" on storage.objects;
drop policy if exists "tulika_media_delete_own" on storage.objects;

create policy "tulika_media_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tulika-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "tulika_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tulika-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "tulika_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tulika-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'tulika-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "tulika_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tulika-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
