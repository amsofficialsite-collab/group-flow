"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Identity = { id:string; name:string; identity_type:"profile"|"page"; active:boolean };
type FacebookGroup = { id:string; name:string; facebook_url:string|null; category:string|null; province:string|null; members:number; active:boolean; notes:string|null; group_identity_access?:{identity_id:string}[] };
type GroupForm = { name:string; facebook_url:string; category:string; province:string; members:string; active:boolean; notes:string; identityIds:string[] };
const emptyForm:GroupForm={name:"",facebook_url:"",category:"",province:"",members:"0",active:true,notes:"",identityIds:[]};

export default function GroupManager(){
 const s=useMemo(()=>createClient(),[]);
 const [groups,setGroups]=useState<FacebookGroup[]>([]),[identities,setIdentities]=useState<Identity[]>([]),[categories,setCategories]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState("");
 const [dialogOpen,setDialogOpen]=useState(false),[editingId,setEditingId]=useState<string|null>(null),[form,setForm]=useState<GroupForm>(emptyForm);
 const [identityName,setIdentityName]=useState(""),[identityType,setIdentityType]=useState<"profile"|"page">("profile");

 const load=useCallback(async()=>{setLoading(true);setError("");const[g,i,c]=await Promise.all([
   s.from("groups").select("id,name,facebook_url,category,province,members,active,notes,group_identity_access(identity_id)").order("name"),
   s.from("facebook_identities").select("id,name,identity_type,active").eq("active",true).order("identity_type").order("name"),
   s.from("group_categories").select("name").order("name")]);
   const e=g.error||i.error; if(e)setError(e.message); setGroups((g.data||[]) as unknown as FacebookGroup[]);setIdentities((i.data||[]) as Identity[]);if(!c.error)setCategories((c.data||[]).map(x=>x.name));setLoading(false)},[s]);
 useEffect(()=>{void load()},[load]);

 const filtered=useMemo(()=>{const k=query.trim().toLowerCase();return groups.filter(g=>!k||[g.name,g.category,g.province,g.facebook_url].filter(Boolean).some(v=>String(v).toLowerCase().includes(k)))},[groups,query]);
 function openCreate(){setEditingId(null);setForm({...emptyForm,identityIds:identities.filter(i=>i.identity_type==="profile").slice(0,1).map(i=>i.id)});setDialogOpen(true)}
 function openEdit(g:FacebookGroup){setEditingId(g.id);setForm({name:g.name,facebook_url:g.facebook_url||"",category:g.category||"",province:g.province||"",members:String(g.members||0),active:g.active,notes:g.notes||"",identityIds:(g.group_identity_access||[]).map(x=>x.identity_id)});setDialogOpen(true)}
 function toggleIdentity(id:string){setForm(f=>({...f,identityIds:f.identityIds.includes(id)?f.identityIds.filter(x=>x!==id):[...f.identityIds,id]}))}
 async function save(e:FormEvent){e.preventDefault();if(!form.name.trim()){setError("กรุณาใส่ชื่อกลุ่ม");return}if(!form.identityIds.length){setError("กรุณาเลือกอย่างน้อย 1 Facebook Identity ที่เข้าถึงกลุ่มนี้ได้");return}setSaving(true);setError("");
   const payload={name:form.name.trim(),facebook_url:form.facebook_url.trim()||null,category:form.category.trim()||null,province:form.province.trim()||null,members:Number(form.members||0),active:form.active,notes:form.notes.trim()||null,updated_at:new Date().toISOString()};
   let groupId=editingId;
   if(editingId){const r=await s.from("groups").update(payload).eq("id",editingId);if(r.error){setError(r.error.message);setSaving(false);return}}
   else {const r=await s.from("groups").insert(payload).select("id").single();if(r.error){setError(r.error.message);setSaving(false);return}groupId=r.data.id}
   await s.from("group_identity_access").delete().eq("group_id",groupId!);
   const {data:{user}}=await s.auth.getUser(); const map=form.identityIds.map(identity_id=>({group_id:groupId!,identity_id,user_id:user!.id})); const mr=await s.from("group_identity_access").insert(map);if(mr.error){setError(mr.error.message);setSaving(false);return}
   if(form.category.trim() && !categories.includes(form.category.trim())) await s.from("group_categories").insert({name:form.category.trim(),user_id:user!.id});
   setSaving(false);setDialogOpen(false);await load();
 }
 async function removeGroup(id:string){if(!confirm("ลบกลุ่มนี้หรือไม่?"))return;const r=await s.from("groups").delete().eq("id",id);if(r.error)setError(r.error.message);else await load()}
 async function addIdentity(){const name=identityName.trim();if(!name)return;const r=await s.from("facebook_identities").insert({name,identity_type:identityType});if(r.error)setError(r.error.message);else{setIdentityName("");await load()}}
 async function removeIdentity(id:string){if(!confirm("ลบ Identity นี้หรือไม่? การผูกกับ Groups จะถูกลบด้วย"))return;const r=await s.from("facebook_identities").delete().eq("id",id);if(r.error)setError(r.error.message);else await load()}
 const identityNames=(g:FacebookGroup)=>(g.group_identity_access||[]).map(m=>identities.find(i=>i.id===m.identity_id)).filter(Boolean) as Identity[];

 return <div className="space-y-5">
  <div className="card"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black text-slate-900">Facebook Identities</h2><p className="text-sm text-slate-500">สร้าง Profile/Page ก่อน แล้วกำหนดว่าแต่ละ Identity เข้า Group ไหนได้บ้าง</p></div></div>
   <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto]"><select className="input" value={identityType} onChange={e=>setIdentityType(e.target.value as "profile"|"page")}><option value="profile">Profile</option><option value="page">Page</option></select><input className="input" value={identityName} onChange={e=>setIdentityName(e.target.value)} placeholder={identityType==="profile"?"เช่น เข็มอัปสร":"เช่น AMS Official"}/><button className="btn-primary" onClick={()=>void addIdentity()}><Plus size={16}/>เพิ่ม Identity</button></div>
   <div className="mt-4 flex flex-wrap gap-2">{identities.map(i=><span key={i.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><b>{i.identity_type==="profile"?"Profile":"Page"}</b> · {i.name}<button className="text-slate-400 hover:text-red-600" onClick={()=>void removeIdentity(i.id)}>×</button></span>)}</div>
  </div>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-900">Facebook Groups</h2><p className="text-sm text-slate-500">1 Group ผูกได้หลาย Identity และ Group ของ Profile/Page ไม่จำเป็นต้องเหมือนกัน</p></div><button className="btn-primary" onClick={openCreate}><Plus size={18}/>เพิ่มกลุ่ม</button></div>
  <div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input className="input pl-10" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหากลุ่ม..."/></div>
  {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  {loading?<div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin"/></div>:<div className="grid gap-4 md:grid-cols-2">{filtered.map(g=><div className="card" key={g.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-slate-900">{g.name}</h3><p className="mt-1 text-sm text-slate-500">{g.category||"ไม่ระบุหมวด"}{g.province?` · ${g.province}`:""}</p></div><span className="badge">{g.active?"active":"paused"}</span></div><div className="mt-4"><p className="text-xs font-bold uppercase text-slate-400">เข้าถึงโดย</p><div className="mt-2 flex flex-wrap gap-2">{identityNames(g).length?identityNames(g).map(i=><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700" key={i.id}>{i.identity_type==="profile"?"Profile":"Page"}: {i.name}</span>):<span className="text-sm text-amber-600">ยังไม่ได้ผูก Identity</span>}</div></div><div className="mt-4 flex gap-2">{g.facebook_url&&<a className="btn-ghost" href={g.facebook_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>เปิด Group</a>}<button className="btn-ghost" onClick={()=>openEdit(g)}><Pencil size={16}/>แก้ไข</button><button className="btn-danger" onClick={()=>void removeGroup(g.id)}><Trash2 size={16}/></button></div></div>)}</div>}
  {dialogOpen&&<div className="modal"><form className="modal-card max-h-[92vh] overflow-y-auto" onSubmit={save}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{editingId?"แก้ไข Group":"เพิ่ม Group"}</h2><button type="button" onClick={()=>setDialogOpen(false)}><X/></button></div><div className="mt-5 grid gap-4"><label>ชื่อ Group<input className="input mt-1" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Facebook URL<input className="input mt-1" value={form.facebook_url} onChange={e=>setForm({...form,facebook_url:e.target.value})} placeholder="https://www.facebook.com/groups/..."/></label>
   <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><p className="font-bold text-slate-900">Identity ไหนเข้าถึง Group นี้ได้?</p><p className="text-xs text-slate-500">ติ๊กได้มากกว่า 1 ตัว</p><div className="mt-3 grid gap-2">{identities.map(i=><label key={i.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white p-3"><input type="checkbox" checked={form.identityIds.includes(i.id)} onChange={()=>toggleIdentity(i.id)}/><span><b>{i.identity_type==="profile"?"Facebook Profile":"Facebook Page"}</b> · {i.name}</span></label>)}</div></div>
   <div className="grid gap-3 sm:grid-cols-2"><label>หมวดหมู่<input list="group-categories" className="input mt-1" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><datalist id="group-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label><label>จังหวัด<input className="input mt-1" value={form.province} onChange={e=>setForm({...form,province:e.target.value})}/></label></div><label>สมาชิก<input type="number" className="input mt-1" value={form.members} onChange={e=>setForm({...form,members:e.target.value})}/></label><label>หมายเหตุ<textarea className="input mt-1" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>ใช้งาน Group นี้</label></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={()=>setDialogOpen(false)}>ยกเลิก</button><button className="btn-primary" disabled={saving}>{saving?<Loader2 className="animate-spin" size={16}/>:null}บันทึก</button></div></form></div>}
 </div>
}
