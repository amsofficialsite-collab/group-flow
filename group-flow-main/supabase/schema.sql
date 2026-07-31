-- GROUP FLOW V1.4
-- Run this entire file in Supabase > SQL Editor > New query.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facebook_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  group_url text not null,
  category text,
  province text,
  status text not null default 'active' check (status in ('active','paused','blocked')),
  requires_approval boolean not null default false,
  last_posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  hashtags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.facebook_groups(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','opened','posted','failed','skipped')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posting_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  queue_id uuid references public.daily_queue(id) on delete set null,
  group_id uuid references public.facebook_groups(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  result text not null check (result in ('posted','failed','waiting_approval','skipped')),
  posted_at timestamptz not null default now(),
  post_url text,
  notes text
);

alter table public.profiles enable row level security;
alter table public.facebook_groups enable row level security;
alter table public.contents enable row level security;
alter table public.daily_queue enable row level security;
alter table public.posting_history enable row level security;

create policy "profiles own rows" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "groups own rows" on public.facebook_groups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contents own rows" on public.contents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "queue own rows" on public.daily_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "history own rows" on public.posting_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
