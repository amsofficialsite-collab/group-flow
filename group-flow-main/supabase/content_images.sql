-- GROUP FLOW V6.1
-- รองรับหลายรูปต่อ 1 Content

create extension if not exists pgcrypto;

-- เก็บ image_url เดิมไว้ก่อน เพื่อไม่ให้ข้อมูลเก่าหาย
alter table public.content_items
add column if not exists image_url text;

create table if not exists public.content_images (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    default auth.uid()
    references auth.users(id)
    on delete cascade,

  content_id uuid not null
    references public.content_items(id)
    on delete cascade,

  image_url text not null,
  storage_path text,

  sort_order integer not null default 0,
  is_cover boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists content_images_content_id_idx
on public.content_images(content_id);

create index if not exists content_images_sort_order_idx
on public.content_images(content_id, sort_order);

alter table public.content_images enable row level security;

drop policy if exists "content_images own rows"
on public.content_images;

create policy "content_images own rows"
on public.content_images
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'content-images',
  'content-images',
  true,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content images public read"
on storage.objects;

create policy "content images public read"
on storage.objects
for select
to public
using (bucket_id = 'content-images');

drop policy if exists "content images authenticated upload"
on storage.objects;

create policy "content images authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "content images owner update"
on storage.objects;

create policy "content images owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "content images owner delete"
on storage.objects;

create policy "content images owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
