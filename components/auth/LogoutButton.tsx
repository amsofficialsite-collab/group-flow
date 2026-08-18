"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return <button onClick={logout} title="ออกจากระบบ" className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><LogOut size={17} /></button>;
}
