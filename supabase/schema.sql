-- MyFatnessPal database setup.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- It is safe to run again.

-- One table holds every synced record. Each app collection (sleep, body, workouts...)
-- is a value in `collection`, and the record itself lives in `data`.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,           -- when the record was last edited on a device
  deleted boolean not null default false,    -- soft delete, so deletions sync too
  server_updated_at timestamptz not null default clock_timestamp(), -- sync cursor
  primary key (user_id, collection, id)
);

create index if not exists records_user_cursor on public.records (user_id, server_updated_at);

-- Last write wins: ignore an incoming update that is older than what we already have,
-- and stamp every accepted change with the server time for the sync cursor.
create or replace function public.records_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- keep the newer server copy
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
before insert or update on public.records
for each row execute function public.records_before_write();

-- Only you can see and change your own rows.
alter table public.records enable row level security;

drop policy if exists "own rows: select" on public.records;
drop policy if exists "own rows: insert" on public.records;
drop policy if exists "own rows: update" on public.records;
drop policy if exists "own rows: delete" on public.records;

create policy "own rows: select" on public.records for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.records for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on public.records for delete to authenticated using (user_id = (select auth.uid()));

-- Lock out anonymous (signed-out) access entirely.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;
