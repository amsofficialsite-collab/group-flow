"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return <button onClick={logout} title="ออกจากระบบ" className="rounded-full border border-white/10 p-2 text-white/55 hover:bg-white/10 hover:text-white"><LogOut size={17} /></button>;
}
