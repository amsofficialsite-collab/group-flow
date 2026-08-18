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
