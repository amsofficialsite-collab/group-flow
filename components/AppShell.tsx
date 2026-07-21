"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, History, LayoutDashboard, Settings, Users } from "lucide-react";
import LogoutButton from "@/components/auth/LogoutButton";

const items = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/groups", "Groups", Users],
  ["/contents", "Content Library", FileText],
  ["/queue", "Daily Queue", CalendarDays],
  ["/history", "Posting History", History],
  ["/settings", "Settings", Settings],
] as const;

export default function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="border-b border-white/10 bg-black/30 p-5 md:min-h-screen md:border-b-0 md:border-r">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 font-black">GF</div>
          <div><div className="font-bold tracking-wide">GROUP FLOW</div><div className="text-xs text-white/45">Posting workspace</div></div>
        </div>
        <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
          {items.map(([href, label, Icon]) => {
            const active = pathname === href;
            return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-white text-black" : "text-white/65 hover:bg-white/10 hover:text-white"}`}><Icon size={18}/>{label}</Link>;
          })}
        </nav>
      </aside>
      <main>
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-8"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">GROUP FLOW</p><h1 className="text-2xl font-bold">{title}</h1></div><div className="flex items-center gap-2"><div className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/60">V1.4</div><LogoutButton /></div></header>
        <section className="p-6 md:p-8">{children}</section>
      </main>
    </div>
  );
}
