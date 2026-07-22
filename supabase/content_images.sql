-- Run this file once in Supabase SQL Editor to enable image uploads.

alter table public.content_items
add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-images',
  'content-images',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content images public read" on storage.objects;
create policy "content images public read"
on storage.objects for select
to public
using (bucket_id = 'content-images');

drop policy if exists "content images authenticated upload" on storage.objects;
create policy "content images authenticated upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "content images owner update" on storage.objects;
create policy "content images owner update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "content images owner delete" on storage.objects;
create policy "content images owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'content-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
