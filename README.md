# GROUP FLOW V4.0 COMPLETE

เวอร์ชันใช้งานจริงสำหรับจัดการ Facebook Group Content

## มีอะไรบ้าง
- Supabase Login
- Group Manager
- Content Library พร้อมอัปโหลด/เปลี่ยน/ลบรูป
- Daily Queue
- Posting Assistant: คัดลอกข้อความ, คัดลอกรูป, เปิดกลุ่ม, บันทึกผลและลิงก์โพสต์
- Dashboard และ Posting History
- Settings

## ติดตั้ง
1. Supabase > SQL Editor > New Query
2. เปิด `supabase/v4_complete.sql` แล้ว Run ทั้งไฟล์
3. อัปโหลดไฟล์ทั้งหมดทับ GitHub repository เดิม
4. รอ Vercel Deployment ขึ้น Ready
5. เปิดเว็บแล้วกด Ctrl+F5

## วิธีโพสต์
1. เพิ่ม Content พร้อมรูปและตั้งสถานะ Ready
2. เพิ่ม Daily Queue โดยเลือก Content + Group + เวลา
3. กด “เริ่มโพสต์”
4. คัดลอกข้อความและรูป แล้วเปิด Facebook Group
5. วางและกดโพสต์บน Facebook
6. กลับมาบันทึก “โพสต์สำเร็จ” และวางลิงก์โพสต์

หมายเหตุ: Facebook ไม่อนุญาตให้เว็บทั่วไปกดโพสต์แทนผู้ใช้โดยตรงโดยไม่มีสิทธิ์ Meta API ที่ได้รับอนุมัติ ดังนั้น V4 ใช้ Posting Assistant ซึ่งใช้งานได้ทันทีและไม่ต้องขอ App Review
