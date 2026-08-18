"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, FileText, Send, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RecentGroup = { id: string; name: string; category?: string | null; created_at?: string | null };

export default function LiveDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState({ groups: 0, contents: 0, queue: 0, posted: 0 });
  const [recent, setRecent] = useState<RecentGroup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const [groupsResult, contentsResult, queueResult, postedResult, recentResult] = await Promise.all([
        supabase.from("groups").select("id", { count: "exact", head: true }),
        supabase.from("content_items").select("id", { count: "exact", head: true }),
        supabase.from("queue_items").select("id", { count: "exact", head: true }).gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString()),
        supabase.from("posting_logs").select("id", { count: "exact", head: true }).eq("result", "posted").gte("posted_at", start.toISOString()).lt("posted_at", end.toISOString()),
        // Use * here intentionally: older databases may not yet have every optional group column.
        supabase.from("groups").select("*").order("created_at", { ascending: false }).limit(5),
      ]);

      if (cancelled) return;

      const firstError = [groupsResult, contentsResult, queueResult, postedResult, recentResult]
        .map((result) => result.error)
        .find(Boolean);

      setError(firstError?.message ?? "");
      setCounts({
        groups: groupsResult.count ?? 0,
        contents: contentsResult.count ?? 0,
        queue: queueResult.count ?? 0,
        posted: postedResult.count ?? 0,
      });
      setRecent(
        (recentResult.data ?? []).map((group) => ({
          id: String(group.id),
          name: String(group.name ?? ""),
          category: group.category ?? null,
          created_at: group.created_at ?? null,
        })),
      );
    })();

    return () => { cancelled = true; };
  }, [supabase]);

  const cards = [
    ["กลุ่มทั้งหมด", counts.groups, Users],
    ["คอนเทนต์", counts.contents, FileText],
    ["คิววันนี้", counts.queue, CalendarClock],
    ["โพสต์สำเร็จวันนี้", counts.posted, Send],
  ] as const;

  return (
    <div className="space-y-7">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลด Dashboard ไม่ครบ: {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div className="card" key={label}>
            <Icon className="text-indigo-600" />
            <p className="mt-6 text-4xl font-black text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">กลุ่มที่เพิ่มล่าสุด</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {recent.map((group) => (
            <div className="flex justify-between py-3" key={group.id}>
              <div>
                <p className="font-medium text-slate-900">{group.name}</p>
                <p className="text-xs text-slate-500">{group.category || "ไม่ระบุหมวดหมู่"}</p>
              </div>
              <span className="text-xs text-slate-400">
                {group.created_at ? new Date(group.created_at).toLocaleDateString("th-TH") : "-"}
              </span>
            </div>
          ))}
          {!recent.length && !error && (
            <p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูลกลุ่ม</p>
          )}
        </div>
      </div>
    </div>
  );
}
