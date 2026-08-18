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
    <div className="gf-page min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="gf-sidebar border-b p-5 md:min-h-screen md:border-b-0 md:border-r">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 font-black text-white shadow-lg shadow-indigo-200">GF</div>
          <div><div className="font-bold tracking-wide text-slate-900">GROUP FLOW</div><div className="text-xs text-slate-500">Posting workspace</div></div>
        </div>
        <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
          {items.map(([href, label, Icon]) => {
            const active = pathname === href;
            return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "gf-nav-link-active" : "gf-nav-link"}`}><Icon size={18}/>{label}</Link>;
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="gf-header sticky top-0 z-20 flex items-center justify-between border-b px-6 py-5 md:px-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">GROUP FLOW</p><h1 className="text-2xl font-bold text-slate-900">{title}</h1></div>
          <div className="flex items-center gap-2"><div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 shadow-sm">V13</div><LogoutButton /></div>
        </header>
        <section className="p-6 md:p-8">{children}</section>
      </main>
    </div>
  );
}
