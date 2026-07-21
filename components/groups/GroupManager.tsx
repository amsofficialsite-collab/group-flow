"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type FacebookGroup = {
  id: string;
  name: string;
  facebook_url: string | null;
  category: string | null;
  province: string | null;
  members: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type GroupForm = {
  name: string;
  facebook_url: string;
  category: string;
  province: string;
  members: string;
  active: boolean;
  notes: string;
};

const emptyForm: GroupForm = {
  name: "",
  facebook_url: "",
  category: "",
  province: "",
  members: "0",
  active: true,
  notes: "",
};

export default function GroupManager() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const [groupsResult, categoriesResult] = await Promise.all([
      supabase
        .from("groups")
        .select("id,name,facebook_url,category,province,members,active,notes,created_at,updated_at")
        .order("created_at", { ascending: false }),
      supabase.from("group_categories").select("name").order("name"),
    ]);

    if (groupsResult.error) {
      setError(groupsResult.error.message);
    } else {
      setGroups((groupsResult.data ?? []) as FacebookGroup[]);
    }

    if (!categoriesResult.error) {
      setCategories((categoriesResult.data ?? []).map((item) => item.name));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredGroups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesStatus = status === "all" || (status === "active" ? group.active : !group.active);
      const matchesQuery =
        !keyword ||
        [group.name, group.category, group.province, group.facebook_url]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(keyword));
      return matchesStatus && matchesQuery;
    });
  }, [groups, query, status]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setDialogOpen(true);
  };

  const openEdit = (group: FacebookGroup) => {
    setEditingId(group.id);
    setForm({
      name: group.name,
      facebook_url: group.facebook_url ?? "",
      category: group.category ?? "",
      province: group.province ?? "",
      members: String(group.members ?? 0),
      active: group.active,
      notes: group.notes ?? "",
    });
    setError("");
    setSuccess("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!saving) setDialogOpen(false);
  };

  const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("กรุณาระบุชื่อกลุ่ม");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      facebook_url: form.facebook_url.trim() || null,
      category: form.category.trim() || null,
      province: form.province.trim() || null,
      members: Math.max(0, Number.parseInt(form.members || "0", 10) || 0),
      active: form.active,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("groups").update(payload).eq("id", editingId)
      : await supabase.from("groups").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const categoryName = form.category.trim();
    if (categoryName && !categories.some((name) => name.toLowerCase() === categoryName.toLowerCase())) {
      await supabase.from("group_categories").insert({ name: categoryName });
    }

    setSuccess(editingId ? "แก้ไขข้อมูลกลุ่มแล้ว" : "เพิ่มกลุ่มเรียบร้อยแล้ว");
    setSaving(false);
    setDialogOpen(false);
    await loadData();
  };

  const toggleStatus = async (group: FacebookGroup) => {
    setError("");
    const { error: updateError } = await supabase
      .from("groups")
      .update({ active: !group.active, updated_at: new Date().toISOString() })
      .eq("id", group.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadData();
  };

  const deleteGroup = async (group: FacebookGroup) => {
    const confirmed = window.confirm(`ลบกลุ่ม “${group.name}” ใช่หรือไม่?`);
    if (!confirmed) return;

    setError("");
    const { error: deleteError } = await supabase.from("groups").delete().eq("id", group.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSuccess("ลบกลุ่มเรียบร้อยแล้ว");
    await loadData();
  };

  const activeCount = groups.filter((group) => group.active).length;
  const totalMembers = groups.reduce((sum, group) => sum + (group.members || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="กลุ่มทั้งหมด" value={groups.length.toLocaleString()} />
        <SummaryCard label="กำลังใช้งาน" value={activeCount.toLocaleString()} />
        <SummaryCard label="สมาชิกรวมโดยประมาณ" value={totalMembers.toLocaleString()} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อกลุ่ม หมวดหมู่ จังหวัด หรือลิงก์"
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-white/30 focus:border-cyan-400/60"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="rounded-xl border border-white/10 bg-[#101319] px-3 py-2.5 text-sm outline-none focus:border-cyan-400/60"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งาน</option>
              <option value="paused">พักใช้งาน</option>
            </select>
          </div>
          <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-cyan-100">
            <Plus size={18} /> เพิ่ม Facebook Group
          </button>
        </div>
      </div>

      {error && <Alert tone="error" text={error} />}
      {success && <Alert tone="success" text={success} />}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {loading ? (
          <div className="grid min-h-64 place-items-center text-white/50"><Loader2 className="animate-spin" /></div>
        ) : filteredGroups.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <Users className="mx-auto mb-3 text-white/25" size={36} />
              <p className="font-semibold">ยังไม่พบ Facebook Group</p>
              <p className="mt-1 text-sm text-white/45">กด “เพิ่ม Facebook Group” เพื่อเริ่มจัดเก็บรายชื่อกลุ่ม</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.035] text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-5 py-4">ชื่อกลุ่ม</th>
                  <th className="px-5 py-4">หมวดหมู่</th>
                  <th className="px-5 py-4">จังหวัด</th>
                  <th className="px-5 py-4 text-right">สมาชิก</th>
                  <th className="px-5 py-4">สถานะ</th>
                  <th className="px-5 py-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredGroups.map((group) => (
                  <tr key={group.id} className="hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <div className="font-semibold">{group.name}</div>
                      {group.facebook_url && (
                        <a href={group.facebook_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">
                          เปิดกลุ่ม <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-4 text-white/65">{group.category || "—"}</td>
                    <td className="px-5 py-4 text-white/65">{group.province || "—"}</td>
                    <td className="px-5 py-4 text-right font-medium">{(group.members || 0).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => void toggleStatus(group)} className={`rounded-full px-3 py-1 text-xs font-semibold ${group.active ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
                        {group.active ? "ใช้งาน" : "พักใช้งาน"}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(group)} title="แก้ไข" className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"><Pencil size={16} /></button>
                        <button onClick={() => void deleteGroup(group)} title="ลบ" className="rounded-lg border border-red-400/20 p-2 text-red-300/80 hover:bg-red-400/10 hover:text-red-200"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={closeDialog}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#101319] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">{editingId ? "แก้ไข Facebook Group" : "เพิ่ม Facebook Group"}</h2>
                <p className="mt-0.5 text-xs text-white/45">จัดเก็บข้อมูลสำหรับใช้วางแผนและติดตามการโพสต์</p>
              </div>
              <button onClick={closeDialog} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><X size={20} /></button>
            </div>

            <form onSubmit={saveGroup} className="space-y-4 p-5">
              <Field label="ชื่อกลุ่ม *">
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="form-input" placeholder="เช่น หางานกรุงเทพและปริมณฑล" />
              </Field>
              <Field label="Facebook Group URL">
                <input value={form.facebook_url} onChange={(event) => setForm({ ...form, facebook_url: event.target.value })} className="form-input" placeholder="https://www.facebook.com/groups/..." type="url" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="หมวดหมู่">
                  <input list="group-category-options" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="form-input" placeholder="เช่น หางาน / Call Center" />
                  <datalist id="group-category-options">{categories.map((name) => <option key={name} value={name} />)}</datalist>
                </Field>
                <Field label="จังหวัด / พื้นที่">
                  <input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} className="form-input" placeholder="เช่น กรุงเทพมหานคร" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="จำนวนสมาชิกโดยประมาณ">
                  <input value={form.members} onChange={(event) => setForm({ ...form, members: event.target.value })} className="form-input" min="0" type="number" />
                </Field>
                <Field label="สถานะ">
                  <select value={form.active ? "active" : "paused"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })} className="form-input">
                    <option value="active">ใช้งาน</option>
                    <option value="paused">พักใช้งาน</option>
                  </select>
                </Field>
              </div>
              <Field label="หมายเหตุ">
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="form-input min-h-24 resize-y" placeholder="เช่น ห้ามโพสต์ซ้ำภายใน 7 วัน / ต้องรอแอดมินอนุมัติ" />
              </Field>
              {error && <Alert tone="error" text={error} />}
              <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/65 hover:bg-white/10 hover:text-white">ยกเลิก</button>
                <button disabled={saving} type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving && <Loader2 className="animate-spin" size={17} />}{editingId ? "บันทึกการแก้ไข" : "เพิ่มกลุ่ม"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5"><p className="text-sm text-white/45">{label}</p><p className="mt-2 text-3xl font-black tracking-tight">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-white/70">{label}</span>{children}</label>;
}

function Alert({ tone, text }: { tone: "error" | "success"; text: string }) {
  const success = tone === "success";
  return <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${success ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>{success && <CheckCircle2 className="mt-0.5 shrink-0" size={16} />}<span>{text}</span></div>;
}
