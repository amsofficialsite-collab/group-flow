-- GROUP FLOW V13 STABILITY BASELINE
-- Safe, idempotent migration for the schema used by the current V12.4/V13 app.
-- Run in Supabase SQL Editor before deploying V13.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- groups: current application contract
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  facebook_url text,
  posting_identity text,
  category text,
  province text,
  members integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.groups add column if not exists facebook_url text;
alter table public.groups add column if not exists posting_identity text;
alter table public.groups add column if not exists category text;
alter table public.groups add column if not exists province text;
alter table public.groups add column if not exists members integer not null default 0;
alter table public.groups add column if not exists active boolean not null default true;
alter table public.groups add column if not exists notes text;
alter table public.groups add column if not exists created_at timestamptz not null default now();
alter table public.groups add column if not exists updated_at timestamptz not null default now();

-- Copy a legacy group_url column into facebook_url when a previous schema used it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'groups' and column_name = 'group_url'
  ) then
    execute 'update public.groups set facebook_url = group_url where facebook_url is null and group_url is not null';
  end if;
end $$;

alter table public.groups enable row level security;
drop policy if exists "groups own rows" on public.groups;
create policy "groups own rows"
on public.groups for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists groups_created_at_idx on public.groups(created_at desc);
create index if not exists groups_active_name_idx on public.groups(active, name);

-- ---------------------------------------------------------------------------
-- queue_items: fields required by scheduler claiming/retry lifecycle
-- ---------------------------------------------------------------------------
alter table public.queue_items add column if not exists attempt_count integer not null default 0;
alter table public.queue_items add column if not exists posting_started_at timestamptz;
alter table public.queue_items add column if not exists posting_finished_at timestamptz;
alter table public.queue_items add column if not exists last_error text;

-- V3/V4 allowed only pending/posted/failed/skipped. V13 also claims a job as posting.
alter table public.queue_items drop constraint if exists queue_items_status_check;
alter table public.queue_items
  add constraint queue_items_status_check
  check (status in ('pending','posting','posted','failed','skipped'));

create index if not exists queue_items_scheduler_idx
on public.queue_items(status, scheduled_at);

comment on column public.groups.posting_identity is
'ชื่อ Facebook Profile/Page ที่ต้องการใช้โพสต์ลงกลุ่ม; ว่าง = ใช้ตัวตนปัจจุบัน';

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Per-queue Facebook identity override
-- Existing rows keep "group" behavior for backward compatibility.
-- ---------------------------------------------------------------------------
alter table public.queue_items add column if not exists post_as text not null default 'group';
alter table public.queue_items add column if not exists posting_identity text;
alter table public.queue_items drop constraint if exists queue_items_post_as_check;
alter table public.queue_items
  add constraint queue_items_post_as_check
  check (post_as in ('group','profile','page'));

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Group categories used by GroupManager autocomplete
-- ---------------------------------------------------------------------------
create table if not exists public.group_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.group_categories enable row level security;
drop policy if exists "group_categories own rows" on public.group_categories;
create policy "group_categories own rows"
on public.group_categories for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists group_categories_name_idx on public.group_categories(name);

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- V13.1 live dashboard / queue / history
-- ---------------------------------------------------------------------------
create index if not exists posting_logs_user_posted_idx on public.posting_logs(user_id, posted_at desc);
create index if not exists queue_items_user_status_scheduled_idx on public.queue_items(user_id, status, scheduled_at);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='queue_items') then
    alter publication supabase_realtime add table public.queue_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='posting_logs') then
    alter publication supabase_realtime add table public.posting_logs;
  end if;
end $$;

notify pgrst, 'reload schema';
