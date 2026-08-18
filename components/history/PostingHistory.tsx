"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  result: string;
  posted_at: string;
  post_url: string | null;
  notes: string | null;
  groups: { name: string } | null;
  content_items: { title: string } | null;
  queue_items: { post_as: "group" | "profile" | "page" | null; posting_identity: string | null } | null;
};

export default function PostingHistory() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("posting_logs")
      .select("id,result,posted_at,post_url,notes,groups(name),content_items(title),queue_items(post_as,posting_identity)")
      .order("posted_at", { ascending: false })
      .limit(500);
    setError(error?.message ?? "");
    setRows((data || []) as unknown as Row[]);
  }, [supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("v13-history-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posting_logs" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, supabase]);

  async function clear() {
    if (!confirm("ล้างประวัติทั้งหมดหรือไม่?")) return;
    const { error } = await supabase.from("posting_logs").delete().not("id", "is", null);
    if (error) setError(error.message); else void load();
  }

  function identityLabel(row: Row) {
    if (row.queue_items?.post_as === "page") return `Page · ${row.queue_items.posting_identity || "ไม่ระบุชื่อ"}`;
    if (row.queue_items?.post_as === "profile") return "Facebook Profile";
    return "Legacy / ไม่ระบุ";
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black text-slate-900">ประวัติการโพสต์</h2><p className="text-sm text-slate-500">ล่าสุดอยู่ด้านบน • แสดง Identity ที่ใช้โพสต์ • อัปเดตอัตโนมัติ</p></div>
      <div className="flex gap-2"><button className="btn-ghost" onClick={() => void load()}><RefreshCw size={16}/>รีเฟรช</button><button className="btn-danger" onClick={clear}><Trash2 size={16}/>ล้าง</button></div>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">โหลด History ไม่สำเร็จ: {error}</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">วัน / เวลา</th><th>Identity</th><th>กลุ่ม</th><th>คอนเทนต์</th><th>ผลลัพธ์</th><th>หมายเหตุ</th><th>ลิงก์</th></tr></thead>
        <tbody>{rows.map(row => <tr className="border-t border-slate-100" key={row.id}>
          <td className="p-4 whitespace-nowrap">{new Date(row.posted_at).toLocaleString("th-TH")}</td>
          <td className="font-medium text-indigo-700">{identityLabel(row)}</td>
          <td>{row.groups?.name || "-"}</td><td>{row.content_items?.title || "-"}</td><td><span className="badge">{row.result}</span></td>
          <td className="max-w-xs truncate" title={row.notes || ""}>{row.notes || "-"}</td>
          <td>{row.post_url ? <a className="text-indigo-600" target="_blank" rel="noreferrer" href={row.post_url}><ExternalLink size={17}/></a> : "-"}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && !error && <div className="p-10 text-center text-slate-400">ยังไม่มีประวัติการโพสต์</div>}
    </div>
  </div>;
}
