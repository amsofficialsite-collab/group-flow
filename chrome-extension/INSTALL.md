# ติดตั้ง GROUP FLOW Posting Agent

1. แตกไฟล์ ZIP โปรเจกต์
2. เปิด Chrome แล้วเข้า `chrome://extensions`
3. เปิด **Developer mode** ด้านขวาบน
4. กด **Load unpacked**
5. เลือกโฟลเดอร์ `chrome-extension`
6. ปักหมุด Extension ชื่อ **GROUP FLOW Posting Agent**
7. เปิด GROUP FLOW และ Facebook ใน Chrome โปรไฟล์เดียวกัน
8. เข้า Daily Queue แล้วกด:
   - **Agent: ตรวจสอบก่อน** เพื่อให้ระบบใส่ข้อความและรูป แล้วรอให้กดโพสต์
   - **Agent: โพสต์อัตโนมัติ** เพื่อให้ระบบใส่ข้อความ รูป และกดโพสต์

ข้อจำกัด: หน้า Facebook เปลี่ยนโครงสร้างได้ตลอดเวลา หาก Facebook เปลี่ยนปุ่มหรือหน้าสร้างโพสต์ อาจต้องปรับ selector ใน `facebook-poster.js` และระบบจะหยุดเมื่อหาองค์ประกอบไม่พบ ไม่มีการหลบ CAPTCHA หรือระบบตรวจสอบของ Facebook
