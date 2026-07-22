# GROUP FLOW V3.0 FULL

ฟีเจอร์ในชุดนี้:
- Login / Logout ด้วย Supabase
- Dashboard ดึงตัวเลขจริง
- Group Manager: เพิ่ม แก้ไข ลบ ค้นหา
- Content Library: เพิ่ม แก้ไข ทำสำเนา ลบ
- Daily Queue: เลือกกลุ่ม + คอนเทนต์ + วันเวลา
- Posting History
- Settings

## อัปเดตฐานข้อมูลก่อน Deploy
1. เข้า Supabase > SQL Editor > New query
2. เปิดไฟล์ `supabase/v3_full.sql`
3. คัดลอกทั้งหมดไปวางและกด Run
4. ต้องขึ้น `Success. No rows returned`

## Deploy
อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม แล้ว Commit changes จากนั้น Vercel จะ Deploy อัตโนมัติ

Environment Variables เดิม:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
