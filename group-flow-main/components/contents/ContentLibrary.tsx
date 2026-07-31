"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Copy,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type Status = "draft" | "ready" | "archived";

type ContentImage = {
  id: string;
  user_id?: string;
  content_id: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  is_cover: boolean;
};

type Item = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  hashtags: string | null;
  image_url: string | null;
  status: Status;
  created_at: string;
  content_images?: ContentImage[];
};

type Form = {
  title: string;
  body: string;
  category: string;
  hashtags: string;
  status: Status;
};

type ExistingImage = ContentImage & {
  removed?: boolean;
};

type NewImage = {
  id: string;
  file: File;
  previewUrl: string;
};

const blank: Form = {
  title: "",
  body: "",
  category: "",
  hashtags: "",
  status: "ready",
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGES = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function formatFacebookPost(input: string) {
  let text = input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

  if (!text) return "";

  const sectionEmojis =
    "📢|📣|🚛|📍|💰|🎯|📋|👩|👨|💼|🎁|📩|📞|🌈|🏢|🕘|🗓️|🗓|🔎|✅";
  text = text.replace(
    new RegExp(`\\s*(${sectionEmojis})\\s*`, "g"),
    "\n\n$1 ",
  );

  text = text.replace(/\s*(✨|✔️|✔|☑️|☑|▪️|▪|•)\s*/g, "\n$1 ");

  const headings = [
    "ตำแหน่ง",
    "รายได้",
    "สถานที่ทำงาน",
    "คุณสมบัติ",
    "รายละเอียดงาน",
    "หน้าที่ความรับผิดชอบ",
    "สวัสดิการ",
    "วันและเวลาทำงาน",
    "สนใจสมัคร",
    "ช่องทางสมัคร",
    "ติดต่อ",
    "เงินเดือน",
  ];

  for (const heading of headings) {
    text = text.replace(
      new RegExp(`\\s*(${heading}\\s*[:：]?)\\s*`, "g"),
      "\n\n$1\n",
    );
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("content_items")
      .select(
        `
        *,
        content_images (
          id,
          content_id,
          image_url,
          storage_path,
          sort_order,
          is_cover
        )
      `,
      )
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    const normalized = ((data || []) as Item[]).map((item) => ({
      ...item,
      content_images: [...(item.content_images || [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }));

    setItems(normalized);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      newImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, [newImages]);

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
    newImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setNewImages([]);
    setExistingImages([]);
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
        status: item.status,
      });

      const relationalImages = item.content_images || [];

      if (relationalImages.length > 0) {
        setExistingImages(
          relationalImages.map((image) => ({ ...image, removed: false })),
        );
      } else if (item.image_url) {
        setExistingImages([
          {
            id: `legacy-${item.id}`,
            content_id: item.id,
            image_url: item.image_url,
            storage_path: getStoragePath(item.image_url),
            sort_order: 0,
            is_cover: true,
            removed: false,
          },
        ]);
      }
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

  function onSelectImages(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    const activeExistingCount = existingImages.filter(
      (image) => !image.removed,
    ).length;
    const remainingSlots =
      MAX_IMAGES - activeExistingCount - newImages.length;

    if (remainingSlots <= 0) {
      alert(`เพิ่มรูปได้สูงสุด ${MAX_IMAGES} รูปต่อคอนเทนต์ค่ะ`);
      return;
    }

    const accepted: NewImage[] = [];

    for (const file of selectedFiles.slice(0, remainingSlots)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`${file.name} ไม่ใช่ไฟล์ JPG, PNG, WEBP หรือ GIF`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} มีขนาดเกิน 8 MB`);
        continue;
      }

      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setNewImages((current) => [...current, ...accepted]);

    if (selectedFiles.length > remainingSlots) {
      alert(`เพิ่มได้สูงสุด ${MAX_IMAGES} รูป ระบบรับเฉพาะรูปที่ยังเหลือค่ะ`);
    }
  }

  function removeNewImage(id: string) {
    setNewImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  function toggleExistingImage(id: string) {
    setExistingImages((current) =>
      current.map((image) =>
        image.id === id ? { ...image, removed: !image.removed } : image,
      ),
    );
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

    return {
      url: data.publicUrl,
      path,
    };
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) {
      alert("กรอกชื่อและข้อความก่อนค่ะ");
      return;
    }

    const activeExisting = existingImages.filter((image) => !image.removed);

    if (activeExisting.length + newImages.length === 0) {
      const confirmed = confirm("ยังไม่ได้เลือกรูปภาพ ต้องการบันทึกต่อหรือไม่?");
      if (!confirmed) return;
    }

    setBusy(true);
    const uploadedPaths: string[] = [];

    try {
      const basePayload = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category.trim() || null,
        hashtags: form.hashtags.trim() || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      };

      let contentId = editing;

      if (editing) {
        const { error } = await supabase
          .from("content_items")
          .update(basePayload)
          .eq("id", editing);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("content_items")
          .insert(basePayload)
          .select("id")
          .single();

        if (error) throw error;
        contentId = data.id;
      }

      if (!contentId) throw new Error("ไม่พบรหัสคอนเทนต์");

      const removedExisting = existingImages.filter(
        (image) => image.removed && !image.id.startsWith("legacy-"),
      );

      if (removedExisting.length > 0) {
        const ids = removedExisting.map((image) => image.id);

        const { error } = await supabase
          .from("content_images")
          .delete()
          .in("id", ids);

        if (error) throw error;
      }

      const removedPaths = existingImages
        .filter((image) => image.removed)
        .map((image) => image.storage_path || getStoragePath(image.image_url))
        .filter((path): path is string => Boolean(path));

      if (removedPaths.length > 0) {
        await supabase.storage.from("content-images").remove(removedPaths);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("ไม่พบผู้ใช้งาน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
      }

      const uploaded = [];

      for (const image of newImages) {
        const result = await uploadImage(image.file);
        uploadedPaths.push(result.path);
        uploaded.push(result);
      }

      const keptImages = existingImages.filter((image) => !image.removed);
      const imageRows = uploaded.map((image, index) => ({
        user_id: user.id,
        content_id: contentId,
        image_url: image.url,
        storage_path: image.path,
        sort_order: keptImages.length + index,
        is_cover: keptImages.length === 0 && index === 0,
      }));

      if (imageRows.length > 0) {
        const { error } = await supabase
          .from("content_images")
          .insert(imageRows);

        if (error) throw error;
      }

      if (editing) {
        const existingRelationalIds = keptImages
          .filter((image) => !image.id.startsWith("legacy-"))
          .map((image) => image.id);

        if (existingRelationalIds.length > 0) {
          const updates = keptImages
            .filter((image) => !image.id.startsWith("legacy-"))
            .map((image, index) =>
              supabase
                .from("content_images")
                .update({
                  sort_order: index,
                  is_cover: index === 0,
                })
                .eq("id", image.id),
            );

          await Promise.all(updates);
        }

        const legacyImages = keptImages.filter((image) =>
          image.id.startsWith("legacy-"),
        );

        if (legacyImages.length > 0) {
          const { error } = await supabase.from("content_images").insert(
            legacyImages.map((image, index) => ({
              user_id: user.id,
              content_id: contentId,
              image_url: image.image_url,
              storage_path:
                image.storage_path || getStoragePath(image.image_url),
              sort_order: index,
              is_cover: index === 0,
            })),
          );

          if (error) throw error;
        }
      }

      const finalCoverUrl =
        keptImages[0]?.image_url || uploaded[0]?.url || null;

      const { error: coverError } = await supabase
        .from("content_items")
        .update({ image_url: finalCoverUrl })
        .eq("id", contentId);

      if (coverError) throw coverError;

      closeModal();
      await load();
    } catch (error) {
      console.error("CONTENT SAVE ERROR:", error);

      if (uploadedPaths.length > 0) {
        await supabase.storage.from("content-images").remove(uploadedPaths);
      }

      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message || "บันทึกไม่สำเร็จค่ะ")
            : "บันทึกไม่สำเร็จค่ะ";

      alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!confirm("ลบคอนเทนต์นี้หรือไม่?")) return;

    const imagePaths = [
      ...(item.content_images || []).map(
        (image) => image.storage_path || getStoragePath(image.image_url),
      ),
      getStoragePath(item.image_url),
    ].filter((path): path is string => Boolean(path));

    const uniquePaths = Array.from(new Set(imagePaths));

    const { error } = await supabase
      .from("content_items")
      .delete()
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (uniquePaths.length > 0) {
      await supabase.storage.from("content-images").remove(uniquePaths);
    }

    await load();
  }

  async function duplicate(item: Item) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("ไม่พบผู้ใช้งาน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
      return;
    }

    const { data, error } = await supabase
      .from("content_items")
      .insert({
        title: `${item.title} (สำเนา)`,
        body: item.body,
        category: item.category,
        hashtags: item.hashtags,
        image_url: item.image_url,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const sourceImages = item.content_images || [];

    if (sourceImages.length > 0) {
      const { error: imageError } = await supabase
        .from("content_images")
        .insert(
          sourceImages.map((image) => ({
            user_id: user.id,
            content_id: data.id,
            image_url: image.image_url,
            storage_path: image.storage_path,
            sort_order: image.sort_order,
            is_cover: image.is_cover,
          })),
        );

      if (imageError) {
        alert(imageError.message);
        return;
      }
    }

    await load();
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
          <Plus size={18} />
          เพิ่มคอนเทนต์
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => {
          const images =
            item.content_images && item.content_images.length > 0
              ? item.content_images
              : item.image_url
                ? [
                    {
                      id: `legacy-${item.id}`,
                      content_id: item.id,
                      image_url: item.image_url,
                      storage_path: null,
                      sort_order: 0,
                      is_cover: true,
                    },
                  ]
                : [];

          return (
            <article key={item.id} className="card overflow-hidden">
              {images.length > 0 && (
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {images.slice(0, 4).map((image, index) => (
                    <div
                      key={image.id}
                      className="relative overflow-hidden rounded-xl"
                    >
                      <img
                        src={image.image_url}
                        alt={`${item.title} รูปที่ ${index + 1}`}
                        className="h-40 w-full object-cover"
                      />

                      {index === 3 && images.length > 4 && (
                        <div className="absolute inset-0 grid place-items-center bg-black/65 text-xl font-bold">
                          +{images.length - 4}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
                  <Pencil size={16} />
                  แก้ไข
                </button>

                <button
                  className="btn-ghost"
                  onClick={() => void duplicate(item)}
                >
                  <Copy size={16} />
                  ทำสำเนา
                </button>

                <button
                  className="btn-danger"
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="empty">
          ยังไม่มีคอนเทนต์ กด “เพิ่มคอนเทนต์” เพื่อเริ่มใช้งาน
        </div>
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
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>

              <label>
                หมวดหมู่
                <input
                  className="input mt-1"
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                />
              </label>

              <label>
                <span className="flex items-center justify-between gap-3">
                  <span>ข้อความ</span>

                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => {
                      const formatted = formatFacebookPost(form.body);
                      setForm({ ...form, body: formatted });
                    }}
                  >
                    <Sparkles size={15} />
                    จัดโพสต์ให้อ่านง่าย
                  </button>
                </span>

                <textarea
                  className="input mt-1 min-h-52 leading-7"
                  placeholder="วางข้อความยาว ๆ ได้เลย แล้วกด ‘จัดโพสต์ให้อ่านง่าย’"
                  value={form.body}
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                />

                <p className="mt-2 text-xs text-white/40">
                  ระบบจะจัดหัวข้อ เว้นบรรทัด และแยกรายการให้เหมาะกับการอ่านบน
                  Facebook โดยไม่เปลี่ยนใจความ
                </p>
              </label>

              {form.body.trim() && (
                <div>
                  <p className="mb-2 text-sm text-white/60">
                    ตัวอย่างการแสดงผลบน Facebook
                  </p>

                  <div className="rounded-2xl border border-white/10 bg-[#242526] p-4 shadow-xl">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xs font-bold">
                        GF
                      </div>

                      <div>
                        <p className="text-sm font-bold">ตัวอย่างโพสต์</p>
                        <p className="text-xs text-white/45">กลุ่มสาธารณะ</p>
                      </div>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-white/90">
                      {form.body}
                      {form.hashtags.trim()
                        ? `\n\n${form.hashtags.trim()}`
                        : ""}
                    </p>
                  </div>
                </div>
              )}

              <label>
                Hashtag
                <input
                  className="input mt-1"
                  placeholder="#ขายของ #รีวิว"
                  value={form.hashtags}
                  onChange={(event) =>
                    setForm({ ...form, hashtags: event.target.value })
                  }
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p>รูปภาพ</p>
                  <span className="text-xs text-white/45">
                    {existingImages.filter((image) => !image.removed).length +
                      newImages.length}
                    /{MAX_IMAGES} รูป
                  </span>
                </div>

                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 px-4 py-5 text-sm text-white/70 transition hover:border-cyan-400 hover:text-cyan-300">
                  <ImagePlus size={20} />
                  เลือกหลายรูปจากเครื่อง

                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={onSelectImages}
                  />
                </label>

                <p className="mt-2 text-xs text-white/40">
                  เลือกหลายรูปพร้อมกันได้ รองรับ JPG, PNG, WEBP, GIF
                  รูปละไม่เกิน 8 MB สูงสุด {MAX_IMAGES} รูป
                </p>

                {(existingImages.length > 0 || newImages.length > 0) && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {existingImages.map((image, index) => (
                      <div
                        key={image.id}
                        className={`relative overflow-hidden rounded-xl border ${
                          image.removed
                            ? "border-red-500/50 opacity-35"
                            : "border-white/10"
                        }`}
                      >
                        <img
                          src={image.image_url}
                          alt={`รูปเดิมที่ ${index + 1}`}
                          className="h-36 w-full object-cover"
                        />

                        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs">
                          {image.removed ? "จะลบ" : `รูป ${index + 1}`}
                        </span>

                        <button
                          type="button"
                          className={`absolute right-2 top-2 rounded-lg p-2 text-white ${
                            image.removed
                              ? "bg-cyan-600 hover:bg-cyan-500"
                              : "bg-black/75 hover:bg-red-600"
                          }`}
                          onClick={() => toggleExistingImage(image.id)}
                          aria-label={
                            image.removed ? "ยกเลิกการลบรูป" : "ลบรูปภาพ"
                          }
                        >
                          {image.removed ? <Plus size={17} /> : <Trash2 size={17} />}
                        </button>
                      </div>
                    ))}

                    {newImages.map((image, index) => (
                      <div
                        key={image.id}
                        className="relative overflow-hidden rounded-xl border border-cyan-400/30"
                      >
                        <img
                          src={image.previewUrl}
                          alt={`รูปใหม่ที่ ${index + 1}`}
                          className="h-36 w-full object-cover"
                        />

                        <span className="absolute left-2 top-2 rounded-md bg-cyan-600/90 px-2 py-1 text-xs">
                          รูปใหม่
                        </span>

                        <button
                          type="button"
                          className="absolute right-2 top-2 rounded-lg bg-black/75 p-2 text-white hover:bg-red-600"
                          onClick={() => removeNewImage(image.id)}
                          aria-label="ลบรูปใหม่"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label>
                สถานะ
                <select
                  className="input mt-1"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as Status,
                    })
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
