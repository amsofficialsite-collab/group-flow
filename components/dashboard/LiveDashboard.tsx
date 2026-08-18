"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Users,
  X,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CardKey = "groups" | "contents" | "queue" | "posting" | "posted" | "failed";
type DetailRow = {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  status?: string;
  url?: string | null;
};

const cardInfo: Record<CardKey, { title: string; description: string }> = {
  groups: { title: "กลุ่มทั้งหมด", description: "Facebook Groups ที่บันทึกไว้ในระบบ" },
  contents: { title: "คอนเทนต์", description: "โพสต์ที่อยู่ใน Content Library" },
  queue: { title: "คิวที่เหลือวันนี้", description: "คิวตั้งแต่เวลาปัจจุบันจนถึงสิ้นวัน" },
  posting: { title: "กำลังโพสต์", description: "งานที่ Scheduler/Extension กำลังดำเนินการ" },
  posted: { title: "สำเร็จวันนี้", description: "โพสต์ที่สำเร็จแล้วในวันนี้" },
  failed: { title: "ล้มเหลววันนี้", description: "โพสต์ที่ล้มเหลวในวันนี้ พร้อมสาเหตุ" },
};

export default function LiveDashboard() {
  const s = useMemo(() => createClient(), []);
  const [c, setC] = useState({ groups: 0, contents: 0, queue: 0, posting: 0, posted: 0, failed: 0 });
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const dayBounds = useCallback(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }, []);

  const load = useCallback(async () => {
    const { start, end } = dayBounds();
    const now = new Date().toISOString();
    const r = await Promise.all([
      s.from("groups").select("id", { count: "exact", head: true }),
      s.from("content_items").select("id", { count: "exact", head: true }),
      s.from("queue_items").select("id", { count: "exact", head: true }).in("status", ["pending", "posting"]).gte("scheduled_at", now).lt("scheduled_at", end.toISOString()),
      s.from("queue_items").select("id", { count: "exact", head: true }).eq("status", "posting"),
      s.from("posting_logs").select("id", { count: "exact", head: true }).eq("result", "posted").gte("posted_at", start.toISOString()).lt("posted_at", end.toISOString()),
      s.from("posting_logs").select("id", { count: "exact", head: true }).eq("result", "failed").gte("posted_at", start.toISOString()).lt("posted_at", end.toISOString()),
    ]);
    setError(r.map((x) => x.error).find(Boolean)?.message ?? "");
    setC({
      groups: r[0].count ?? 0,
      contents: r[1].count ?? 0,
      queue: r[2].count ?? 0,
      posting: r[3].count ?? 0,
      posted: r[4].count ?? 0,
      failed: r[5].count ?? 0,
    });
    setUpdated(new Date());
  }, [dayBounds, s]);

  const loadDetails = useCallback(async (key: CardKey) => {
    setOpenCard(key);
    setDetailLoading(true);
    setDetailError("");
    setDetails([]);
    const { start, end } = dayBounds();
    const now = new Date().toISOString();

    try {
      if (key === "groups") {
        const { data, error } = await s.from("groups")
          .select("id,name,facebook_url,category,province,members,active")
          .order("name", { ascending: true });
        if (error) throw error;
        setDetails((data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.name,
          secondary: [r.category, r.province].filter(Boolean).join(" • ") || "ยังไม่ระบุหมวดหมู่",
          meta: `${r.members ?? 0} members • ${r.active ? "ใช้งาน" : "ปิดใช้งาน"}`,
          url: r.facebook_url,
        })));
      }

      if (key === "contents") {
        const { data, error } = await s.from("content_items")
          .select("id,title,category,status,updated_at")
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        setDetails((data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.title,
          secondary: r.category || "ไม่มีหมวดหมู่",
          meta: `สถานะ ${r.status} • แก้ไข ${new Date(r.updated_at).toLocaleString("th-TH")}`,
          status: r.status,
        })));
      }

      if (key === "queue" || key === "posting") {
        let q = s.from("queue_items")
          .select("id,status,scheduled_at,attempt_count,last_error,groups(name),content_items(title),facebook_identities(name,identity_type)")
          .order("scheduled_at", { ascending: true });
        q = key === "posting"
          ? q.eq("status", "posting")
          : q.in("status", ["pending", "posting"]).gte("scheduled_at", now).lt("scheduled_at", end.toISOString());
        const { data, error } = await q;
        if (error) throw error;
        setDetails((data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.content_items?.title || "ไม่มีชื่อคอนเทนต์",
          secondary: `${new Date(r.scheduled_at).toLocaleString("th-TH")} • ${r.groups?.name || "ไม่พบ Group"}`,
          meta: `${r.facebook_identities ? `${r.facebook_identities.identity_type === "page" ? "Page" : "Profile"}: ${r.facebook_identities.name}` : "Identity เดิม"}${r.attempt_count ? ` • Retry ${r.attempt_count}` : ""}${r.last_error ? ` • ${r.last_error}` : ""}`,
          status: r.status,
        })));
      }

      if (key === "posted" || key === "failed") {
        const { data, error } = await s.from("posting_logs")
          .select("id,result,posted_at,post_url,notes,groups(name),content_items(title),queue_items(post_as,posting_identity,facebook_identities(name,identity_type))")
          .eq("result", key === "posted" ? "posted" : "failed")
          .gte("posted_at", start.toISOString())
          .lt("posted_at", end.toISOString())
          .order("posted_at", { ascending: false });
        if (error) throw error;
        setDetails((data ?? []).map((r: any) => {
          const qi = r.queue_items;
          const identity = qi?.facebook_identities
            ? `${qi.facebook_identities.identity_type === "page" ? "Page" : "Profile"}: ${qi.facebook_identities.name}`
            : qi?.posting_identity || qi?.post_as || "ไม่ระบุ Identity";
          return {
            id: r.id,
            primary: r.content_items?.title || "ไม่มีชื่อคอนเทนต์",
            secondary: `${new Date(r.posted_at).toLocaleString("th-TH")} • ${r.groups?.name || "ไม่พบ Group"}`,
            meta: `${identity}${r.notes ? ` • ${r.notes}` : ""}`,
            status: r.result,
            url: r.post_url,
          };
        }));
      }
    } catch (e: any) {
      setDetailError(e?.message || "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setDetailLoading(false);
    }
  }, [dayBounds, s]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const ch = s.channel("v13-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_items" }, () => {
        void load();
        if (openCard === "queue" || openCard === "posting") void loadDetails(openCard);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "posting_logs" }, () => {
        void load();
        if (openCard === "posted" || openCard === "failed") void loadDetails(openCard);
      })
      .subscribe();
    return () => { clearInterval(timer); void s.removeChannel(ch); };
  }, [load, loadDetails, openCard, s]);

  const cards = [
    ["groups", "กลุ่มทั้งหมด", c.groups, Users],
    ["contents", "คอนเทนต์", c.contents, FileText],
    ["queue", "คิวที่เหลือวันนี้", c.queue, CalendarClock],
    ["posting", "กำลังโพสต์", c.posting, Loader2],
    ["posted", "สำเร็จวันนี้", c.posted, CheckCircle2],
    ["failed", "ล้มเหลววันนี้", c.failed, AlertTriangle],
  ] as const;

  return <>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-xl font-black text-slate-900">สถานะระบบแบบอัตโนมัติ</h2><p className="text-sm text-slate-500">กดการ์ดแต่ละใบเพื่อดูรายละเอียด • อัปเดตอัตโนมัติ</p></div>
        <span className="text-xs text-slate-400">ล่าสุด {updated ? updated.toLocaleTimeString("th-TH") : "-"}</span>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([key, label, value, Icon]) => <button type="button" onClick={() => void loadDetails(key)} className="card group text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30" key={key}>
          <div className="flex items-start justify-between"><Icon className="text-indigo-600"/><span className="text-xs font-semibold text-indigo-500 opacity-0 transition group-hover:opacity-100">ดูรายละเอียด →</span></div>
          <p className="mt-5 text-4xl font-black text-slate-900">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p>
        </button>)}
      </div>
    </div>

    {openCard && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.currentTarget === e.target) setOpenCard(null); }}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 md:px-6">
          <div><h3 className="text-xl font-black text-slate-900">{cardInfo[openCard].title}</h3><p className="mt-1 text-sm text-slate-500">{cardInfo[openCard].description}</p></div>
          <button type="button" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setOpenCard(null)} aria-label="ปิด"><X size={20}/></button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-4 md:p-6">
          {detailLoading && <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="mb-3 animate-spin"/><p>กำลังโหลดรายละเอียด...</p></div>}
          {detailError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{detailError}</div>}
          {!detailLoading && !detailError && details.length === 0 && <div className="py-16 text-center text-slate-400">ไม่มีรายการในหมวดนี้</div>}
          {!detailLoading && !detailError && details.length > 0 && <div className="space-y-2">
            {details.map((r) => <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{r.primary}</p>{r.status && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-600">{r.status}</span>}</div>{r.secondary && <p className="mt-1 text-sm text-slate-600">{r.secondary}</p>}{r.meta && <p className="mt-1 text-xs text-slate-400">{r.meta}</p>}</div>
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50">เปิดลิงก์ <ExternalLink size={15}/></a>}
            </div>)}
          </div>}
        </div>
      </div>
    </div>}
  </>;
}
