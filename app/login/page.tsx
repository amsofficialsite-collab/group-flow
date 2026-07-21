"use client";

import { FormEvent, useState } from "react";
import { LogIn, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur-xl md:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 font-black">GF</div>
          <div><h1 className="text-2xl font-bold">GROUP FLOW</h1><p className="text-sm text-white/50">เข้าสู่ระบบจัดการโพสต์ Facebook Group</p></div>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-white/70">อีเมล
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4">
              <Mail size={17} className="text-white/40" />
              <input className="w-full bg-transparent py-3 outline-none" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
          </label>
          <label className="block text-sm text-white/70">รหัสผ่าน
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-cyan-400/50" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" />
          </label>
          {message && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{message}</p>}
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-black transition hover:bg-cyan-100 disabled:opacity-60">
            <LogIn size={18} />{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-white/40">สร้างผู้ใช้งานครั้งแรกได้ที่ Supabase → Authentication → Users</p>
      </div>
    </main>
  );
}
