"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Copy, ExternalLink, Image as ImageIcon, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

type Group = { id: string; name: string; facebook_url: string | null };
type Content = { id: string; title: string; body: string; hashtags: string | null; image_url: string | null };
type QueueRow = {
  id: string;
  scheduled_at: string;
  status: "pending" | "posted" | "failed" | "skipped";
  groups: Group | null;
  content_items: Content | null;
};

export default function DailyQueue() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ), []);

  const [groups, setGroups] = useState<Group[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assistant, setAssistant] = useState<QueueRow | null>(null);
  const [groupId, setGroupId] = useState("");
  const [contentId, setContentId] = useState("");
  const [when, setWhen] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [g, c, q] = await Promise.all([
      supabase.from("groups").select("id,name,facebook_url").eq("active", true).order("name"),
      supabase.from("content_items").select("id,title,body,hashtags,image_url").eq("status", "ready").order("created_at", { ascending: false }),
      supabase.from("queue_items").select("id,scheduled_at,status,groups(id,name,facebook_url),content_items(id,title,body,hashtags,image_url)").order("scheduled_at", { ascending: true }),
    ]);
    if (g.error) alert(g.error.message);
    if (c.error) alert(c.error.message);
    if (q.error) alert(q.error.message);
    setGroups((g.data || []) as Group[]);
    setContents((c.data || []) as Content[]);
    setRows((q.data || []) as unknown as QueueRow[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!groupId || !contentId || !when) return alert("เลือกกลุ่ม คอนเทนต์ และวันเวลาให้ครบค่ะ");
    const { error } = await supabase.from("queue_items").insert({
      group_id: groupId,
      content_id: contentId,
      scheduled_at: new Date(when).toISOString(),
      status: "pending",
    });
    if (error) return alert(error.message);
    setOpen(false); setGroupId(""); setContentId(""); setWhen("");
    await load();
  }

  function fullCaption(row: QueueRow) {
    const c = row.content_items;
    return [c?.body || "", c?.hashtags || ""].filter(Boolean).join("\n\n");
  }

  async function copyCaption(row: QueueRow) {
    await navigator.clipboard.writeText(fullCaption(row));
    alert("คัดลอกข้อความและ Hashtag แล้วค่ะ");
  }

  async function copyImage(row: QueueRow) {
    const url = row.content_items?.image_url;
    if (!url) return alert("คอนเทนต์นี้ไม่มีรูปภาพค่ะ");
    try {
      const response = await fetch(url);
      const original = await response.blob();
      const canvas = document.createElement("canvas");
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(original);
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = objectUrl; });
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ")), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      URL.revokeObjectURL(objectUrl);
      alert("คัดลอกรูปแล้วค่ะ สามารถกด Ctrl+V ในโพสต์ Facebook ได้เลย");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
      alert("เบราว์เซอร์ไม่อนุญาตให้คัดลอกรูป จึงเปิดรูปให้ดาวน์โหลดแทนค่ะ");
    }
  }

  function startPost(row: QueueRow) {
    setPostUrl("");
    setAssistant(row);
  }

  async function finish(result: "posted" | "failed") {
    if (!assistant) return;
    setBusy(true);
    const { error: updateError } = await supabase.from("queue_items").update({ status: result, updated_at: new Date().toISOString() }).eq("id", assistant.id);
    if (updateError) { setBusy(false); return alert(updateError.message); }
    const { error: logError } = await supabase.from("posting_logs").insert({
      queue_id: assistant.id,
      group_id: assistant.groups?.id || null,
      content_id: assistant.content_items?.id || null,
      result,
      post_url: postUrl.trim() || null,
      notes: result === "posted" ? "บันทึกจาก Posting Assistant" : "โพสต์ไม่สำเร็จ",
      posted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (logError) return alert(logError.message);
    setAssistant(null); setPostUrl("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("ลบคิวนี้หรือไม่?")) return;
    const { error } = await supabase.from("queue_items").delete().eq("id", id);
    if (error) alert(error.message); else await load();
  }

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-bold">คิวโพสต์ Facebook Group</h2><p className="text-sm text-white/45">เตรียมข้อความ รูป กลุ่ม และบันทึกผลโพสต์ในหน้าจอเดียว</p></div>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={18}/>เพิ่มคิวโพสต์</button>
    </div>

    {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin"/></div> : rows.length ?
      <div className="space-y-3">{rows.map(row => <div key={row.id} className="card flex flex-col gap-4 lg:flex-row lg:items-center">
        {row.content_items?.image_url ? <img src={row.content_items.image_url} alt="" className="h-24 w-24 rounded-xl object-cover"/> : <div className="grid h-24 w-24 place-items-center rounded-xl bg-white/5"><ImageIcon className="text-white/20"/></div>}
        <div className="min-w-0 flex-1"><p className="font-bold">{row.content_items?.title || "คอนเทนต์ถูกลบ"}</p><p className="mt-1 text-sm text-white/50">{row.groups?.name || "กลุ่มถูกลบ"}</p><p className="mt-1 text-xs text-cyan-300">{new Date(row.scheduled_at).toLocaleString("th-TH")}</p></div>
        <span className="badge">{row.status}</span>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => void copyCaption(row)}><Copy size={16}/>ข้อความ</button>
          {row.content_items?.image_url && <button className="btn-ghost" onClick={() => void copyImage(row)}><ImageIcon size={16}/>รูป</button>}
          <button className="btn-primary" disabled={!row.groups?.facebook_url} onClick={() => startPost(row)}><Send size={16}/>เริ่มโพสต์</button>
          <button className="btn-danger" onClick={() => void remove(row.id)}><Trash2 size={16}/></button>
        </div>
      </div>)}</div>
      : <div className="empty"><CalendarClock className="mx-auto mb-3 text-white/20"/>ยังไม่มีคิวโพสต์</div>}

    {open && <div className="modal"><div className="modal-card"><div className="flex justify-between"><h2 className="text-xl font-bold">เพิ่มคิวโพสต์</h2><button onClick={() => setOpen(false)}><X/></button></div><div className="mt-5 grid gap-4">
      <label>Facebook Group<select className="input mt-1" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">เลือกกลุ่ม</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>คอนเทนต์<select className="input mt-1" value={contentId} onChange={e=>setContentId(e.target.value)}><option value="">เลือกคอนเทนต์</option>{contents.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label>วันและเวลา<input className="input mt-1" type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>
      <button className="btn-primary justify-center" onClick={() => void add()}>บันทึกเข้าคิว</button>
    </div></div></div>}

    {assistant && <div className="modal"><div className="modal-card max-h-[92vh] overflow-y-auto"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Posting Assistant</h2><p className="text-sm text-white/45">ทำตาม 3 ขั้นตอน แล้วบันทึกผล</p></div><button onClick={()=>setAssistant(null)}><X/></button></div>
      <div className="mt-5 space-y-4">
        {assistant.content_items?.image_url && <img src={assistant.content_items.image_url} alt="" className="max-h-72 w-full rounded-xl object-contain bg-black/30"/>}
        <div className="card"><p className="text-sm font-bold text-cyan-300">1. เตรียมโพสต์</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn-ghost" onClick={()=>void copyCaption(assistant)}><Copy size={16}/>คัดลอกข้อความ</button>{assistant.content_items?.image_url&&<button className="btn-ghost" onClick={()=>void copyImage(assistant)}><ImageIcon size={16}/>คัดลอกรูป</button>}</div></div>
        <div className="card"><p className="text-sm font-bold text-cyan-300">2. เปิด Facebook Group</p><a className="btn-primary mt-3 inline-flex" href={assistant.groups?.facebook_url || "#"} target="_blank" rel="noreferrer"><ExternalLink size={16}/>เปิดกลุ่ม {assistant.groups?.name}</a><p className="mt-3 text-xs text-white/45">นำข้อความและรูปไปวางในช่องสร้างโพสต์ แล้วกดโพสต์บน Facebook</p></div>
        <div className="card"><p className="text-sm font-bold text-cyan-300">3. บันทึกผล</p><label className="mt-3 block text-sm">ลิงก์โพสต์ (ไม่บังคับ)<input className="input mt-1" placeholder="https://www.facebook.com/..." value={postUrl} onChange={e=>setPostUrl(e.target.value)}/></label><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busy} className="btn-primary justify-center" onClick={()=>void finish("posted")}><Check size={17}/>โพสต์สำเร็จ</button><button disabled={busy} className="btn-danger justify-center" onClick={()=>void finish("failed")}>ไม่สำเร็จ</button></div></div>
      </div>
    </div></div>}
  </div>;
}
