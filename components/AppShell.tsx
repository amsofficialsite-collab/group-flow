"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  History,
  LayoutDashboard,
  Settings,
  Users,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import LogoutButton from "@/components/auth/LogoutButton";

const items = [
  ["/dashboard", "Dashboard", "ภาพรวมระบบ", LayoutDashboard],
  ["/groups", "Groups", "กลุ่มและ Identity", Users],
  ["/contents", "Content Library", "คลังคอนเทนต์", FileText],
  ["/queue", "Daily Queue", "คิวและตารางโพสต์", CalendarDays],
  ["/history", "Posting History", "ประวัติการโพสต์", History],
  ["/settings", "Settings", "ตั้งค่าระบบ", Settings],
] as const;

export default function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="gf-page min-h-screen lg:grid lg:grid-cols-[284px_1fr]">
      <aside className="gf-sidebar lg:sticky lg:top-0 lg:h-screen">
        <div className="gf-brand">
          <div className="gf-logo">GF</div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black tracking-[0.04em] text-slate-950">GROUP FLOW</div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500">Facebook posting workspace</div>
          </div>
        </div>

        <div className="gf-sidebar-status">
          <div className="flex items-center gap-2">
            <span className="gf-status-dot" />
            <span className="text-xs font-bold text-slate-700">Automation workspace</span>
          </div>
          <span className="gf-version">V13.7</span>
        </div>

        <nav className="gf-nav">
          {items.map(([href, label, helper, Icon]) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`gf-nav-link ${active ? "gf-nav-link-active" : ""}`}>
                <span className="gf-nav-icon"><Icon size={18} strokeWidth={2} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{label}</span>
                  <span className={`block truncate text-[11px] ${active ? "text-white/70" : "text-slate-400"}`}>{helper}</span>
                </span>
                <ChevronRight size={15} className={`transition ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
              </Link>
            );
          })}
        </nav>

        <div className="gf-sidebar-tip">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-700"><Sparkles size={15}/> Smart Workflow</div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">สร้างคิวครั้งเดียว แล้วให้ระบบช่วยจัดการงานโพสต์ต่อเนื่องให้คุณ</p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="gf-header">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> GROUP FLOW
            </div>
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-950 md:text-[28px]">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:flex">
              <span className="gf-status-dot" /> System ready
            </div>
            <LogoutButton />
          </div>
        </header>
        <section className="gf-content">{children}</section>
      </main>
    </div>
  );
}
