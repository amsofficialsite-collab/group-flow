import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";

export default function DashboardPage() {
  return <AppShell title="Dashboard">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="กลุ่มที่ใช้งาน" value="0" helper="เพิ่มกลุ่มในเมนู Groups" />
      <StatCard label="โพสต์วันนี้" value="0" helper="ยังไม่มีรายการในคิว" />
      <StatCard label="สำเร็จ" value="0%" helper="อัตราความสำเร็จวันนี้" />
      <StatCard label="คอนเทนต์พร้อมใช้" value="0" helper="เพิ่มข้อความใน Content Library" />
    </div>
    <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 to-cyan-400/5 p-6">
      <h2 className="text-xl font-semibold">เริ่มต้นใช้งาน GROUP FLOW</h2>
      <p className="mt-2 max-w-2xl text-white/60">เวอร์ชันนี้มีโครงสร้างระบบและหน้าหลักครบแล้ว ขั้นต่อไปคือเชื่อมฐานข้อมูล Supabase เพื่อเพิ่มกลุ่ม คอนเทนต์ และคิวโพสต์จริง</p>
    </div>
  </AppShell>;
}
