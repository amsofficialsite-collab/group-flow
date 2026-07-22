"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Copy,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Status = "draft" | "ready" | "archived";

type Item = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  hashtags: string | null;
  image_url: string | null;
  status: Status;
  created_at: string;
};

type Form = {
  title: string;
  body: string;
  category: string;
  hashtags: string;
  image_url: string;
  status: Status;
};

const blank: Form = {
  title: "",
  body: "",
  category: "",
  hashtags: "",
  image_url: "",
  status: "ready",
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function ContentLibrary() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );

  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setItems((data || []) as Item[]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.title} ${item.body} ${item.category || ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [items, q],
  );

  function resetImageState() {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setRemoveCurrentImage(false);
  }

  function start(item?: Item) {
    resetImageState();

    if (item) {
      setEditing(item.id);
      setForm({
        title: item.title,
        body: item.body,
        category: item.category || "",
        hashtags: item.hashtags || "",
        image_url: item.image_url || "",
        status: item.status,
      });
      setImagePreview(item.image_url || "");
    } else {
      setEditing(null);
      setForm(blank);
    }

    setOpen(true);
  }

  function closeModal() {
    resetImageState();
    setOpen(false);
  }

  function onSelectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ GIF ค่ะ");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert("ขนาดรูปต้องไม่เกิน 8 MB ค่ะ");
      return;
    }

    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveCurrentImage(false);
  }

  function clearImage() {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setRemoveCurrentImage(Boolean(form.image_url));
  }

  function getStoragePath(url: string | null | undefined) {
    if (!url) return null;
    const marker = "/storage/v1/object/public/content-images/";
    const index = url.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.slice(index + marker.length));
  }

  async function uploadImage(file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("กรุณาเข้าสู่ระบบใหม่อีกครั้งค่ะ");

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${safeExtension}`;

    const { error } = await supabase.storage
      .from("content-images")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from("content-images").getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) {
      alert("กรอกชื่อและข้อความก่อนค่ะ");
      return;
    }

    setBusy(true);
    let newUploadPath: string | null = null;

    try {
      let imageUrl = removeCurrentImage ? null : form.image_url || null;

      if (imageFile) {
        const uploaded = await uploadImage(imageFile);
        imageUrl = uploaded.url;
        newUploadPath = uploaded.path;
      }

      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category.trim() || null,
        hashtags: form.hashtags.trim() || null,
        image_url: imageUrl,
        status: form.status,
        updated_at: new Date().toISOString(),
      };

      const result = editing
        ? await supabase.from("content_items").update(payload).eq("id", editing)
        : await supabase.from("content_items").insert(payload);

      if (result.error) throw result.error;

      const oldPath = getStoragePath(form.image_url);
      const shouldDeleteOld =
        oldPath && (removeCurrentImage || (imageFile && imageUrl !== form.image_url));

      if (shouldDeleteOld) {
        await supabase.storage.from("content-images").remove([oldPath]);
      }

      closeModal();
      await load();
    } catch (error) {
      if (newUploadPath) {
        await supabase.storage.from("content-images").remove([newUploadPath]);
      }
      alert(error instanceof Error ? error.message : "บันทึกไม่สำเร็จค่ะ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!confirm("ลบคอนเทนต์นี้หรือไม่?")) return;

    const { error } = await supabase.from("content_items").delete().eq("id", item.id);
    if (error) {
      alert(error.message);
      return;
    }

    const oldPath = getStoragePath(item.image_url);
    if (oldPath) await supabase.storage.from("content-images").remove([oldPath]);
    await load();
  }

  async function duplicate(item: Item) {
    const { error } = await supabase.from("content_items").insert({
      title: `${item.title} (สำเนา)`,
      body: item.body,
      category: item.category,
      hashtags: item.hashtags,
      image_url: item.image_url,
      status: "draft",
    });

    if (error) alert(error.message);
    else await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-3 text-white/40" size={18} />
          <input
            className="input pl-10"
            placeholder="ค้นหาคอนเทนต์..."
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={() => start()}>
          <Plus size={18} />เพิ่มคอนเทนต์
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.id} className="card overflow-hidden">
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.title}
                className="mb-4 h-64 w-full rounded-xl object-cover"
              />
            )}

            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="badge">{item.category || "ทั่วไป"}</span>
                <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
              </div>
              <span className="text-xs text-white/45">{item.status}</span>
            </div>

            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-white/65">
              {item.body}
            </p>
            {item.hashtags && (
              <p className="mt-3 text-sm text-cyan-300">{item.hashtags}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button className="btn-ghost" onClick={() => start(item)}>
                <Pencil size={16} />แก้ไข
              </button>
              <button className="btn-ghost" onClick={() => void duplicate(item)}>
                <Copy size={16} />ทำสำเนา
              </button>
              <button className="btn-danger" onClick={() => void remove(item)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="empty">ยังไม่มีคอนเทนต์ กด “เพิ่มคอนเทนต์” เพื่อเริ่มใช้งาน</div>
      )}

      {open && (
        <div className="modal">
          <div className="modal-card max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">
                {editing ? "แก้ไขคอนเทนต์" : "เพิ่มคอนเทนต์"}
              </h2>
              <button onClick={closeModal} aria-label="ปิด">
                <X />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label>
                ชื่อ
                <input
                  className="input mt-1"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </label>

              <label>
                หมวดหมู่
                <input
                  className="input mt-1"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                />
              </label>

              <label>
                ข้อความ
                <textarea
                  className="input mt-1 min-h-40"
                  value={form.body}
                  onChange={(event) => setForm({ ...form, body: event.target.value })}
                />
              </label>

              <label>
                Hashtag
                <input
                  className="input mt-1"
                  placeholder="#ขายของ #รีวิว"
                  value={form.hashtags}
                  onChange={(event) => setForm({ ...form, hashtags: event.target.value })}
                />
              </label>

              <div>
                <p className="mb-2">รูปภาพ</p>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 px-4 py-5 text-sm text-white/70 transition hover:border-cyan-400 hover:text-cyan-300">
                  <ImagePlus size={20} />
                  {imagePreview ? "เปลี่ยนรูปภาพ" : "เลือกรูปภาพจากเครื่อง"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={onSelectImage}
                  />
                </label>
                <p className="mt-2 text-xs text-white/40">
                  รองรับ JPG, PNG, WEBP, GIF ขนาดไม่เกิน 8 MB
                </p>

                {imagePreview && (
                  <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10">
                    <img
                      src={imagePreview}
                      alt="ตัวอย่างรูปคอนเทนต์"
                      className="max-h-80 w-full object-contain"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-lg bg-black/75 p-2 text-white hover:bg-red-600"
                      onClick={clearImage}
                      aria-label="ลบรูปภาพ"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </div>

              <label>
                สถานะ
                <select
                  className="input mt-1"
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as Status })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <button
                className="btn-primary justify-center"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "กำลังอัปโหลดและบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
