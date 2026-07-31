# GROUP FLOW V5 — Posting Agent

เวอร์ชันนี้ต่อยอดจาก V4 และเพิ่ม Chrome Extension สำหรับรับงานจาก Daily Queue แล้วเปิด Facebook Group ใส่ข้อความ แนบรูป และเลือกได้ทั้งโหมดตรวจสอบก่อนหรือโหมดกดโพสต์อัตโนมัติ

## ติดตั้งเว็บ

1. รัน `supabase/v4_complete.sql` ใน Supabase SQL Editor เพื่อสร้างตารางและ Storage bucket `content-images`
2. อัปโหลดไฟล์โปรเจกต์ขึ้น GitHub เดิม
3. รอ Vercel Deploy
4. ตรวจ Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## ติดตั้ง Chrome Extension

ดู `chrome-extension/INSTALL.md`

## วิธีใช้งาน

1. เพิ่ม Content พร้อมรูป
2. เพิ่ม Facebook Group URL
3. สร้าง Daily Queue
4. เลือก:
   - Agent: ตรวจสอบก่อน
   - Agent: โพสต์อัตโนมัติ
5. Extension เปิด Facebook Group ใส่ข้อความและรูป แล้วส่งผลกลับ Posting History

## หมายเหตุ

Facebook สามารถเปลี่ยนโครงสร้างหน้าเว็บได้ จึงอาจต้องปรับ selector ใน Extension ภายหลัง ระบบไม่จัดการ CAPTCHA, checkpoint หรือการยืนยันตัวตนแทนผู้ใช้
