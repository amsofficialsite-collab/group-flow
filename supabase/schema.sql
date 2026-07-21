create extension if not exists "pgcrypto";

create table if not exists public.facebook_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  category text,
  province text,
  status text not null default 'active' check (status in ('active','paused')),
  last_posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  hashtags text,
  status text not null default 'active' check (status in ('active','draft','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.post_queue (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.facebook_groups(id) on delete cascade,
  content_id uuid references public.contents(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','posted','failed','skipped')),
  note text,
  created_at timestamptz not null default now()
);
