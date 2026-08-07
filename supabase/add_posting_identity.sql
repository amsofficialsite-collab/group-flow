-- Run once in Supabase SQL Editor.
alter table public.groups
add column if not exists posting_identity text null;

comment on column public.groups.posting_identity is
'ชื่อโปรไฟล์หรือชื่อเพจที่ต้องการใช้โพสต์ลงกลุ่ม เว้นว่างเพื่อใช้ตัวตนปัจจุบัน';
