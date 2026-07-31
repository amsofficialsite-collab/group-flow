"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, FileText, Loader2, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RecentGroup={id:string;name:string;category:string|null;created_at:string;active:boolean};
type QueueItem={id:string;scheduled_at:string;status:string;groups:{name:string}|null;contents:{title:string}|null};
export default function DashboardClient(){
 const supabase=useMemo(()=>createClient(),[]); const [loading,setLoading]=useState(true);
 const [stats,setStats]=useState({groups:0,active:0,contents:0,ready:0,queue:0,posted:0,failed:0}); const [recent,setRecent]=useState<RecentGroup[]>([]); const [today,setToday]=useState<QueueItem[]>([]);
 useEffect(()=>{(async()=>{const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 const [g,c,q,h,rg,tq]=await Promise.all([
  supabase.from("groups").select("id,active"), supabase.from("contents").select("id,status"),
  supabase.from("daily_queue").select("id,status").gte("scheduled_at",start.toISOString()).lt("scheduled_at",end.toISOString()),
  supabase.from("posting_history").select("id,result").gte("posted_at",start.toISOString()).lt("posted_at",end.toISOString()),
  supabase.from("groups").select("id,name,category,created_at,active").order("created_at",{ascending:false}).limit(5),
  supabase.from("daily_queue").select("id,scheduled_at,status,groups(name),contents(title)").gte("scheduled_at",start.toISOString()).lt("scheduled_at",end.toISOString()).order("scheduled_at").limit(8)
 ]);
 const gs=g.data??[], cs=c.data??[], qs=q.data??[], hs=h.data??[];
 setStats({groups:gs.length,active:gs.filter((x:any)=>x.active).length,contents:cs.length,ready:cs.filter((x:any)=>x.status==="ready").length,queue:qs.length,posted:hs.filter((x:any)=>x.result==="posted").length,failed:hs.filter((x:any)=>x.result==="failed").length});
 setRecent((rg.data??[]) as RecentGroup[]); setToday((tq.data??[]) as unknown as QueueItem[]); setLoading(false);})();},[supabase]);
 if(loading)return <div className="grid min-h-72 place-items-center text-white/50"><Loader2 className="animate-spin"/></div>;
 const success=stats.posted+stats.failed?Math.round(stats.posted/(stats.posted+stats.failed)*100):0;
 return <div className="space-y-6">
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Card icon={<Users/>} label="กลุ่มที่ใช้งาน" value={stats.active} helper={`${stats.groups} กลุ่มทั้งหมด`}/>
   <Card icon={<FileText/>} label="คอนเทนต์พร้อมใช้" value={stats.ready} helper={`${stats.contents} รายการทั้งหมด`}/>
   <Card icon={<CalendarClock/>} label="คิววันนี้" value={stats.queue} helper={`${stats.posted} โพสต์สำเร็จ`}/>
   <Card icon={<CheckCircle2/>} label="อัตราสำเร็จวันนี้" value={`${success}%`} helper={`${stats.failed} รายการล้มเหลว`}/>
  </div>
  <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
   <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">คิวโพสต์วันนี้</h2><p className="text-sm text-white/45">งานที่ต้องจัดการตามเวลา</p></div><Link href="/queue" className="text-sm text-cyan-300">ดูทั้งหมด →</Link></div>
   {today.length? <div className="space-y-2">{today.map(x=><div key={x.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div className="w-16 text-sm font-bold">{new Date(x.scheduled_at).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</div><div className="min-w-0 flex-1"><p className="truncate font-medium">{x.contents?.title??"คอนเทนต์"}</p><p className="truncate text-xs text-white/45">{x.groups?.name??"กลุ่ม"}</p></div><Badge status={x.status}/></div>)}</div>:<Empty text="วันนี้ยังไม่มีคิวโพสต์" href="/queue"/>}
   </section>
   <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">กลุ่มล่าสุด</h2><p className="text-sm text-white/45">รายการที่เพิ่งเพิ่ม</p></div><Link href="/groups" className="text-sm text-cyan-300">จัดการ →</Link></div>
   {recent.length?<div className="space-y-2">{recent.map(g=><div key={g.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-3"><p className="truncate font-medium">{g.name}</p><span className={`text-xs ${g.active?"text-emerald-300":"text-amber-300"}`}>{g.active?"ใช้งาน":"พัก"}</span></div><p className="mt-1 text-xs text-white/40">{g.category||"ไม่ระบุหมวดหมู่"}</p></div>)}</div>:<Empty text="ยังไม่มีกลุ่ม" href="/groups"/>}
   </section>
  </div>
  <section className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-violet-500/15 to-cyan-400/5 p-6"><h2 className="text-xl font-bold">Quick Start</h2><p className="mt-1 text-white/55">เพิ่มคอนเทนต์ เลือกกลุ่ม แล้วจัดคิวโพสต์ได้จากระบบเดียว</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/contents" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black"><Plus size={17}/>สร้างคอนเทนต์</Link><Link href="/queue" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold">จัดคิวโพสต์</Link></div></section>
 </div>
}
function Card({icon,label,value,helper}:{icon:React.ReactNode;label:string;value:number|string;helper:string}){return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="mb-4 text-cyan-300">{icon}</div><p className="text-sm text-white/50">{label}</p><p className="mt-1 text-3xl font-black">{value}</p><p className="mt-2 text-xs text-white/35">{helper}</p></div>}
function Badge({status}:{status:string}){const t:any={pending:"รอดำเนินการ",opened:"เปิดแล้ว",posted:"สำเร็จ",failed:"ล้มเหลว",skipped:"ข้าม"};return <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/60">{t[status]||status}</span>}
function Empty({text,href}:{text:string;href:string}){return <div className="grid min-h-36 place-items-center text-center"><div><p className="text-sm text-white/45">{text}</p><Link href={href} className="mt-3 inline-block text-sm text-cyan-300">เริ่มใช้งาน →</Link></div></div>}
