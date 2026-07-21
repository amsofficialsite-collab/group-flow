# GROUP FLOW V2.0 — Group Manager

เวอร์ชันนี้เพิ่มหน้าจัดการ Facebook Group ที่เชื่อมกับ Supabase แล้ว

## ฟีเจอร์
- เพิ่ม แก้ไข และลบกลุ่ม
- เปิดลิงก์ Facebook Group
- ค้นหาและกรองสถานะ
- เปิด/พักใช้งานกลุ่ม
- เก็บหมวดหมู่ จังหวัด จำนวนสมาชิก และหมายเหตุ
- ข้อมูลของผู้ใช้แต่ละคนแยกกันด้วย RLS

## การติดตั้ง
1. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม
2. Environment Variables ใน Vercel ต้องมี:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. รอ Vercel Deploy จาก Commit ใหม่
4. ล็อกอินแล้วเปิดเมนู **Groups**

## Database
ต้องมีตาราง `groups` และ `group_categories` พร้อม RLS ตาม SQL ที่รันไว้ก่อนหน้านี้
