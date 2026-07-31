GROUP FLOW V12.1 FIX

แก้ปัญหา:
- บันทึกผลไม่สำเร็จแล้วค้างอยู่กลุ่มเดิม
- Active Job ไม่ถูกปลด ทำให้ไม่ไปคิว/กลุ่มถัดไป
- posting_logs บันทึกผิดพลาดแล้ว API ตอบ 500 ทั้งที่ queue อัปเดตแล้ว

ต้องทำ 2 ส่วน:
1) อัปโหลดโปรเจกต์นี้ขึ้น GitHub แล้วรอ Vercel Deploy ให้ Ready
2) โหลดโฟลเดอร์ chrome-extension เป็น Load unpacked ใหม่ใน chrome://extensions

หลังติดตั้ง ให้ลบ Extension ตัวเดิมก่อน แล้วเลือกโฟลเดอร์ chrome-extension จากชุดนี้
