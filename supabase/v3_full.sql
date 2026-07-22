-- GROUP FLOW V3 FULL — run once in Supabase SQL Editor
create extension if not exists pgcrypto;

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text,
  hashtags text,
  image_url text,
  status text not null default 'ready' check (status in ('draft','ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','posted','failed','skipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posting_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  queue_id uuid references public.queue_items(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  content_id uuid references public.content_items(id) on delete set null,
  result text not null check (result in ('posted','failed','skipped')),
  post_url text,
  notes text,
  posted_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  default_post_time time not null default '09:00',
  timezone text not null default 'Asia/Bangkok',
  queue_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.content_items enable row level security;
alter table public.queue_items enable row level security;
alter table public.posting_logs enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "content_items own rows" on public.content_items;
create policy "content_items own rows" on public.content_items for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "queue_items own rows" on public.queue_items;
create policy "queue_items own rows" on public.queue_items for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "posting_logs own rows" on public.posting_logs;
create policy "posting_logs own rows" on public.posting_logs for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "app_settings own row" on public.app_settings;
create policy "app_settings own row" on public.app_settings for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists queue_items_scheduled_at_idx on public.queue_items(scheduled_at);
create index if not exists queue_items_status_idx on public.queue_items(status);
create index if not exists posting_logs_posted_at_idx on public.posting_logs(posted_at);
