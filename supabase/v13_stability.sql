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

-- ---------------------------------------------------------------------------
-- V13.2 Facebook identities + identity-specific group access
-- A Profile/Page can access many Groups and one Group can belong to many identities.
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  identity_type text not null check (identity_type in ('profile','page')),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists facebook_identities_user_type_name_uidx
on public.facebook_identities(user_id, identity_type, lower(name));

alter table public.facebook_identities enable row level security;
drop policy if exists "facebook_identities own rows" on public.facebook_identities;
create policy "facebook_identities own rows"
on public.facebook_identities for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.group_identity_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  identity_id uuid not null references public.facebook_identities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(group_id, identity_id)
);

alter table public.group_identity_access enable row level security;
drop policy if exists "group_identity_access own rows" on public.group_identity_access;
create policy "group_identity_access own rows"
on public.group_identity_access for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists group_identity_access_identity_idx on public.group_identity_access(identity_id, group_id);
create index if not exists group_identity_access_group_idx on public.group_identity_access(group_id, identity_id);

alter table public.queue_items add column if not exists identity_id uuid references public.facebook_identities(id) on delete set null;
create index if not exists queue_items_identity_idx on public.queue_items(identity_id, scheduled_at);

-- Migrate legacy group.posting_identity values into Page identities and mappings.
insert into public.facebook_identities(user_id, identity_type, name)
select distinct g.user_id, 'page', trim(g.posting_identity)
from public.groups g
where g.user_id is not null and nullif(trim(g.posting_identity),'') is not null
on conflict do nothing;

insert into public.group_identity_access(user_id, group_id, identity_id)
select g.user_id, g.id, i.id
from public.groups g
join public.facebook_identities i
  on i.user_id = g.user_id
 and i.identity_type = 'page'
 and lower(i.name) = lower(trim(g.posting_identity))
where nullif(trim(g.posting_identity),'') is not null
on conflict (group_id, identity_id) do nothing;

-- Existing groups without a legacy Page identity get a default Profile identity.
insert into public.facebook_identities(user_id, identity_type, name)
select distinct g.user_id, 'profile', 'Facebook Profile'
from public.groups g
where g.user_id is not null
on conflict do nothing;

insert into public.group_identity_access(user_id, group_id, identity_id)
select g.user_id, g.id, i.id
from public.groups g
join public.facebook_identities i
  on i.user_id = g.user_id and i.identity_type = 'profile' and i.name = 'Facebook Profile'
where nullif(trim(g.posting_identity),'') is null
on conflict (group_id, identity_id) do nothing;

-- Backfill queue identity from the matching legacy snapshot when possible.
update public.queue_items q
set identity_id = i.id
from public.facebook_identities i
where q.identity_id is null
  and i.user_id = q.user_id
  and (
    (q.post_as = 'profile' and i.identity_type = 'profile')
    or
    (q.post_as = 'page' and i.identity_type = 'page' and lower(i.name) = lower(trim(coalesce(q.posting_identity,''))))
  );

notify pgrst, 'reload schema';
