"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BellRing, Clock3, Globe2, Save, UserRound } from "lucide-react";

export default function AppSettings() {
  const s = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const [f, setF] = useState({ display_name: "", default_post_time: "09:00", timezone: "Asia/Bangkok", queue_reminder: true });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await s.from("app_settings").select("*").maybeSingle();
      if (data) setF((prev) => ({ ...prev, ...data }));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true); setMsg("");
    const { data: { user } } = await s.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await s.from("app_settings").upsert({ user_id: user.id, ...f, updated_at: new Date().toISOString() });
    setMsg(error ? error.message : "บันทึกการตั้งค่าเรียบร้อยแล้ว");
    setSaving(false);
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="card">
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-950">การตั้งค่าพื้นฐาน</h2>
        <p className="mt-1 text-sm text-slate-500">กำหนดค่าเริ่มต้นสำหรับการใช้งาน GROUP FLOW</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-bold text-slate-700">
          <span className="flex items-center gap-2"><UserRound size={16} className="text-indigo-500"/>ชื่อที่แสดง</span>
          <input className="input" value={f.display_name} onChange={e=>setF({...f,display_name:e.target.value})} placeholder="ชื่อผู้ใช้งาน" />
        </label>
        <label className="space-y-2 text-sm font-bold text-slate-700">
          <span className="flex items-center gap-2"><Clock3 size={16} className="text-indigo-500"/>เวลาโพสต์เริ่มต้น</span>
          <input type="time" className="input" value={f.default_post_time} onChange={e=>setF({...f,default_post_time:e.target.value})}/>
        </label>
        <label className="space-y-2 text-sm font-bold text-slate-700 md:col-span-2">
          <span className="flex items-center gap-2"><Globe2 size={16} className="text-indigo-500"/>เขตเวลา</span>
          <select className="input" value={f.timezone} onChange={e=>setF({...f,timezone:e.target.value})}><option>Asia/Bangkok</option><option>UTC</option></select>
        </label>
      </div>
    </div>

    <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><BellRing size={18}/></div>
        <div><p className="font-black text-slate-900">แจ้งเตือนคิว</p><p className="mt-1 text-sm text-slate-500">เปิดการแจ้งเตือนเพื่อช่วยติดตามงานที่กำลังจะถึงเวลาโพสต์</p></div>
      </div>
      <button type="button" onClick={()=>setF({...f,queue_reminder:!f.queue_reminder})} className={`relative h-7 w-12 rounded-full transition ${f.queue_reminder?"bg-indigo-600":"bg-slate-300"}`} aria-pressed={f.queue_reminder}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${f.queue_reminder?"left-6":"left-1"}`}/>
      </button>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={`text-sm font-semibold ${msg.includes("เรียบร้อย")?"text-emerald-600":"text-rose-600"}`}>{msg}</p>
      <button className="btn-primary" onClick={save} disabled={saving}><Save size={16}/>{saving?"กำลังบันทึก...":"บันทึกการตั้งค่า"}</button>
    </div>
  </div>;
}
