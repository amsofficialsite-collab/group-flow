"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  Puzzle,
  Send,
  Trash2,
  Clock3,
  X,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

type Group = {
  id: string;
  name: string;
  facebook_url: string | null;
};

type ContentImage = {
  image_url: string;
  sort_order: number | null;
};

type Content = {
  id: string;
  title: string;
  body: string;
  hashtags: string | null;
  image_url: string | null;
  content_images?: ContentImage[];
};

type QueueRow = {
  id: string;
  scheduled_at: string;
  status: "pending" | "posting" | "posted" | "failed" | "skipped";
  groups: Group | null;
  content_items: Content | null;
};

type PostingResultDetail = {
  queueId?: string;
  result?: "posted" | "failed";
  postUrl?: string;
  notes?: string;
};

const WEEKDAYS = [
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสบดี" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
  { value: 0, label: "อาทิตย์" },
] as const;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromLocalInputs(dateValue: string, timeValue: string): Date | null {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getImageUrls(content: Content | null | undefined): string[] {
  if (!content) return [];

  const galleryUrls = Array.isArray(content.content_images)
    ? [...content.content_images]
        .sort(
          (a, b) =>
            Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
        )
        .map((image) => image.image_url)
        .filter((url): url is string => Boolean(url))
    : [];

  return [...galleryUrls, content.image_url]
    .filter((url): url is string => Boolean(url))
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function formatFacebookCaption(rawText: string): string {
  let text = String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\uFFFD/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  const sectionHeaders = [
    "‼️ ประกาศรับสมัครพนักงาน ‼️",
    "✏️ รายละเอียดงาน",
    "🏢 สถานที่ทำงาน",
    "💐 คุณสมบัติของผู้สมัคร",
    "🌈 สวัสดิการ",
    "🙋🏻‍♀️ ติดต่อสอบถามได้ที่",
    "📥 ลิงก์สำหรับสมัครงาน",
    "📥 ลิ้งค์สำหรับสมัครงาน",
    "หมายเหตุ:",
  ];

  for (const header of sectionHeaders) {
    text = text.split(header).join(`\n\n${header}\n`);
  }

  // แยกรายการที่ขึ้นต้นด้วย Emoji ให้เป็นคนละบรรทัด
  text = text.replace(
    /(?<!^)(?=(?:✨|🎯|📞|📊|⏰|🏥|🏦|🌴|🎉|✈️|🍚|🥪|☎️|✅|🔹|▪️|•))/gu,
    "\n",
  );

  // แยกข้อมูลติดต่อและ URL
  text = text
    .replace(/\s+(Line\s*:)/gi, "\n$1")
    .replace(/\s+(FB\s*:)/gi, "\n$1")
    .replace(/\s+(☎️)/gu, "\n$1")
    .replace(/\s+(https?:\/\/)/gi, "\n$1")
    .replace(/\s+(#\S+)/g, "\n\n$1");

  // แยกประโยคงานที่มักติดกัน
  text = text
    .replace(/(ผิดนัดชำระ)\s+(ติดตาม)/g, "$1\n$2")
    .replace(/(หลังแจ้งค่างวด)\s+(บริการ)/g, "$1\n$2")
    .replace(/(ทาวเวอร์ 2)\s*(สามารถลง)/g, "$1\n$2")
    .replace(/(วันจันทร์\))\s*(โครงการ)/g, "$1\n$2")
    .replace(/(บริษัท)\s*(🙋🏻‍♀️)/gu, "$1\n\n$2");

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function DailyQueue() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      ),
    [],
  );

  const [groups, setGroups] = useState<Group[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assistant, setAssistant] = useState<QueueRow | null>(null);
  const [groupId, setGroupId] = useState("");
  const [contentId, setContentId] = useState("");
  const today = useMemo(() => new Date(), []);
  const nextWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }, []);
  const [scheduleMode, setScheduleMode] = useState<"single" | "multiple">("single");
  const [when, setWhen] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(today));
  const [endDate, setEndDate] = useState(toDateInputValue(nextWeek));
  const [selectedDays, setSelectedDays] = useState<number[]>([today.getDay()]);
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [postUrl, setPostUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);

    const [g, c, q] = await Promise.all([
      supabase
        .from("groups")
        .select("id,name,facebook_url")
        .eq("active", true)
        .order("name"),
      supabase
        .from("content_items")
        .select(
          "id,title,body,hashtags,image_url,content_images(image_url,sort_order)",
        )
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
      supabase
        .from("queue_items")
        .select(
          "id,scheduled_at,status,groups(id,name,facebook_url),content_items(id,title,body,hashtags,image_url,content_images(image_url,sort_order))",
        )
        .order("scheduled_at", { ascending: true }),
    ]);

    if (g.error) alert(g.error.message);
    if (c.error) alert(c.error.message);
    if (q.error) alert(q.error.message);

    setGroups((g.data || []) as Group[]);
    setContents((c.data || []) as Content[]);
    setRows((q.data || []) as unknown as QueueRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onResult = async (event: Event) => {
      const detail = (event as CustomEvent<PostingResultDetail>).detail;

      if (!detail?.queueId || !detail?.result) return;

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("queue_items")
        .update({
          status: detail.result,
          updated_at: now,
        })
        .eq("id", detail.queueId);

      if (updateError) {
        alert(updateError.message);
        return;
      }

      const row = rows.find((item) => item.id === detail.queueId);

      const { error: logError } = await supabase
        .from("posting_logs")
        .insert({
          queue_id: detail.queueId,
          group_id: row?.groups?.id || null,
          content_id: row?.content_items?.id || null,
          result: detail.result,
          post_url: detail.postUrl || null,
          notes: detail.notes || "บันทึกจาก Chrome Posting Agent",
          posted_at: now,
        });

      if (logError) {
        alert(logError.message);
        return;
      }

      await load();

      alert(
        detail.result === "posted"
          ? "Posting Agent รายงานว่าโพสต์สำเร็จแล้วค่ะ"
          : `Posting Agent รายงานว่าโพสต์ไม่สำเร็จค่ะ${
              detail.notes ? `\n\nสาเหตุ: ${detail.notes}` : ""
            }`,
      );
    };

    window.addEventListener(
      "groupflow:post-result",
      onResult as EventListener,
    );

    return () =>
      window.removeEventListener(
        "groupflow:post-result",
        onResult as EventListener,
      );
  }, [rows, supabase]);

  function resetScheduleForm() {
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    setGroupId("");
    setContentId("");
    setWhen("");
    setScheduleMode("single");
    setStartDate(toDateInputValue(now));
    setEndDate(toDateInputValue(weekLater));
    setSelectedDays([now.getDay()]);
    setTimes(["09:00"]);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  function addTime() {
    setTimes((current) => [...current, "12:00"]);
  }

  function updateTime(index: number, value: string) {
    setTimes((current) =>
      current.map((time, timeIndex) => (timeIndex === index ? value : time)),
    );
  }

  function removeTime(index: number) {
    setTimes((current) =>
      current.length === 1
        ? current
        : current.filter((_, timeIndex) => timeIndex !== index),
    );
  }

  async function add() {
    if (!groupId || !contentId) {
      alert("เลือกกลุ่มและคอนเทนต์ให้ครบค่ะ");
      return;
    }

    setBusy(true);

    try {
      if (scheduleMode === "single") {
        if (!when) {
          alert("เลือกวันและเวลาโพสต์ค่ะ");
          return;
        }

        const scheduledDate = new Date(when);
        if (Number.isNaN(scheduledDate.getTime())) {
          alert("วันและเวลาไม่ถูกต้องค่ะ");
          return;
        }

        const { error } = await supabase.from("queue_items").insert({
          group_id: groupId,
          content_id: contentId,
          scheduled_at: scheduledDate.toISOString(),
          status: "pending",
        });

        if (error) throw error;
        alert("เพิ่มคิวโพสต์เรียบร้อยแล้วค่ะ");
      } else {
        if (!startDate || !endDate) {
          alert("เลือกวันที่เริ่มต้นและวันที่สิ้นสุดค่ะ");
          return;
        }

        if (selectedDays.length === 0) {
          alert("เลือกอย่างน้อย 1 วันค่ะ");
          return;
        }

        const validTimes = Array.from(new Set<string>(times.filter((time) => Boolean(time)))).sort();
        if (validTimes.length === 0) {
          alert("เพิ่มอย่างน้อย 1 เวลาโพสต์ค่ะ");
          return;
        }

        const start = dateFromLocalInputs(startDate, "00:00");
        const end = dateFromLocalInputs(endDate, "23:59");
        if (!start || !end || end < start) {
          alert("ช่วงวันที่ไม่ถูกต้องค่ะ");
          return;
        }

        const queueRows: Array<{
          group_id: string;
          content_id: string;
          scheduled_at: string;
          status: "pending";
        }> = [];

        const cursor = new Date(start);
        while (cursor <= end) {
          if (selectedDays.includes(cursor.getDay())) {
            const dateValue = toDateInputValue(cursor);
            for (const time of validTimes) {
              const scheduledDate = dateFromLocalInputs(dateValue, time);
              if (scheduledDate && scheduledDate >= new Date()) {
                queueRows.push({
                  group_id: groupId,
                  content_id: contentId,
                  scheduled_at: scheduledDate.toISOString(),
                  status: "pending",
                });
              }
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        if (queueRows.length === 0) {
          alert("ไม่พบวันและเวลาที่ยังไม่ผ่านไปในช่วงที่เลือกค่ะ");
          return;
        }

        if (queueRows.length > 300) {
          alert(`รายการที่กำลังสร้างมี ${queueRows.length} คิว กรุณาลดช่วงวันที่หรือจำนวนเวลาลงให้ไม่เกิน 300 คิวค่ะ`);
          return;
        }

        const { error } = await supabase.from("queue_items").insert(queueRows);
        if (error) throw error;

        alert(`สร้างคิวโพสต์เรียบร้อย ${queueRows.length} คิวค่ะ`);
      }

      setOpen(false);
      resetScheduleForm();
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "เพิ่มคิวไม่สำเร็จค่ะ");
    } finally {
      setBusy(false);
    }
  }

  function fullCaption(row: QueueRow) {
    const content = row.content_items;

    const rawCaption = [content?.body || "", content?.hashtags || ""]
      .filter(Boolean)
      .join("\n\n");

    return formatFacebookCaption(rawCaption);
  }

  async function copyCaption(row: QueueRow) {
    await navigator.clipboard.writeText(fullCaption(row));
    alert("คัดลอกข้อความและ Hashtag แล้วค่ะ");
  }

  async function copyImage(row: QueueRow) {
    const imageUrls = getImageUrls(row.content_items);
    const url = imageUrls[0];

    if (!url) {
      alert("คอนเทนต์นี้ไม่มีรูปภาพค่ะ");
      return;
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`ดาวน์โหลดรูปไม่สำเร็จ (${response.status})`);
      }

      const original = await response.blob();
      const canvas = document.createElement("canvas");
      const image = new window.Image();
      image.crossOrigin = "anonymous";

      const objectUrl = URL.createObjectURL(original);

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("เปิดรูปไม่สำเร็จ"));
        image.src = objectUrl;
      });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);

      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("แปลงรูปไม่สำเร็จ")),
          "image/png",
        );
      });

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);

      URL.revokeObjectURL(objectUrl);

      alert(
        imageUrls.length > 1
          ? `คัดลอกรูปแรกแล้วค่ะ โพสต์นี้มีทั้งหมด ${imageUrls.length} รูป และ Posting Agent จะส่งทุกรูปให้ Facebook`
          : "คัดลอกรูปแล้วค่ะ สามารถกด Ctrl+V ในโพสต์ Facebook ได้เลย",
      );
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
      alert(
        "เบราว์เซอร์ไม่อนุญาตให้คัดลอกรูป จึงเปิดรูปให้ดาวน์โหลดแทนค่ะ",
      );
    }
  }

  function startPost(row: QueueRow) {
    setPostUrl("");
    setAssistant(row);
  }

  function sendToPostingAgent(row: QueueRow, autoPost = false) {
    const group = row.groups;
    const content = row.content_items;

    if (!group?.facebook_url) {
      alert("กลุ่มนี้ยังไม่มี Facebook URL ค่ะ");
      return;
    }

    if (!content) {
      alert("ไม่พบข้อมูลคอนเทนต์ของคิวนี้ค่ะ");
      return;
    }

    const imageUrls = getImageUrls(content);
    const caption = fullCaption(row);

    console.log("GROUP FLOW POSTING DATA", {
      queueId: row.id,
      groupUrl: group.facebook_url,
      groupName: group.name,
      caption,
      imageUrls,
      imageCount: imageUrls.length,
      autoPost,
    });

    window.dispatchEvent(
      new CustomEvent("groupflow:start-post", {
        detail: {
          queueId: row.id,
          groupUrl: group.facebook_url,
          groupName: group.name,
          caption,
          imageUrls,
          autoPost,
        },
      }),
    );
  }

  async function finish(result: "posted" | "failed") {
    if (!assistant) return;

    setBusy(true);

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("queue_items")
      .update({
        status: result,
        updated_at: now,
      })
      .eq("id", assistant.id);

    if (updateError) {
      setBusy(false);
      alert(updateError.message);
      return;
    }

    const { error: logError } = await supabase
      .from("posting_logs")
      .insert({
        queue_id: assistant.id,
        group_id: assistant.groups?.id || null,
        content_id: assistant.content_items?.id || null,
        result,
        post_url: postUrl.trim() || null,
        notes:
          result === "posted"
            ? "บันทึกจาก Posting Assistant"
            : "โพสต์ไม่สำเร็จ",
        posted_at: now,
      });

    setBusy(false);

    if (logError) {
      alert(logError.message);
      return;
    }

    setAssistant(null);
    setPostUrl("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("ลบคิวนี้หรือไม่?")) return;

    const { error } = await supabase
      .from("queue_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
    } else {
      await load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">คิวโพสต์ Facebook Group</h2>
          <p className="text-sm text-white/45">
            เตรียมข้อความ รูป กลุ่ม และบันทึกผลโพสต์ในหน้าจอเดียว
          </p>
        </div>

        <button className="btn-primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          เพิ่มคิวโพสต์
        </button>
      </div>

      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const imageUrls = getImageUrls(row.content_items);
            const previewUrl = imageUrls[0];

            return (
              <div
                key={row.id}
                className="card flex flex-col gap-4 lg:flex-row lg:items-center"
              >
                {previewUrl ? (
                  <div className="relative">
                    <img
                      src={previewUrl}
                      alt=""
                      className="h-24 w-24 rounded-xl object-cover"
                    />
                    {imageUrls.length > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-2 py-0.5 text-xs text-white">
                        {imageUrls.length} รูป
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="grid h-24 w-24 place-items-center rounded-xl bg-white/5">
                    <ImageIcon className="text-white/20" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {row.content_items?.title || "คอนเทนต์ถูกลบ"}
                  </p>
                  <p className="mt-1 text-sm text-white/50">
                    {row.groups?.name || "กลุ่มถูกลบ"}
                  </p>
                  <p className="mt-1 text-xs text-cyan-300">
                    {new Date(row.scheduled_at).toLocaleString("th-TH")}
                  </p>
                </div>

                <span className="badge">{row.status}</span>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-ghost"
                    onClick={() => void copyCaption(row)}
                  >
                    <Copy size={16} />
                    ข้อความ
                  </button>

                  {imageUrls.length > 0 && (
                    <button
                      className="btn-ghost"
                      onClick={() => void copyImage(row)}
                    >
                      <ImageIcon size={16} />
                      รูป ({imageUrls.length})
                    </button>
                  )}

                  <button
                    className="btn-ghost"
                    disabled={!row.groups?.facebook_url}
                    onClick={() => sendToPostingAgent(row, false)}
                  >
                    <Puzzle size={16} />
                    Agent: ตรวจสอบก่อน
                  </button>

                  <button
                    className="btn-primary"
                    disabled={!row.groups?.facebook_url}
                    onClick={() => sendToPostingAgent(row, true)}
                  >
                    <Send size={16} />
                    Agent: โพสต์อัตโนมัติ
                  </button>

                  <button
                    className="btn-ghost"
                    disabled={!row.groups?.facebook_url}
                    onClick={() => startPost(row)}
                  >
                    <ExternalLink size={16} />
                    โพสต์ด้วยตนเอง
                  </button>

                  <button
                    className="btn-danger"
                    onClick={() => void remove(row.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <CalendarClock className="mx-auto mb-3 text-white/20" />
          ยังไม่มีคิวโพสต์
        </div>
      )}

      {open && (
        <div className="modal">
          <div className="modal-card max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">เพิ่มคิวโพสต์</h2>
              <button onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label>
                Facebook Group
                <select
                  className="input mt-1"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                >
                  <option value="">เลือกกลุ่ม</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                คอนเทนต์
                <select
                  className="input mt-1"
                  value={contentId}
                  onChange={(event) => setContentId(event.target.value)}
                >
                  <option value="">เลือกคอนเทนต์</option>
                  {contents.map((content) => (
                    <option key={content.id} value={content.id}>
                      {content.title}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-sm font-medium">รูปแบบการตั้งเวลา</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={scheduleMode === "single" ? "btn-primary justify-center" : "btn-ghost justify-center"}
                    onClick={() => setScheduleMode("single")}
                  >
                    ครั้งเดียว
                  </button>
                  <button
                    type="button"
                    className={scheduleMode === "multiple" ? "btn-primary justify-center" : "btn-ghost justify-center"}
                    onClick={() => setScheduleMode("multiple")}
                  >
                    หลายวัน/หลายเวลา
                  </button>
                </div>
              </div>

              {scheduleMode === "single" ? (
                <label>
                  วันและเวลา
                  <input
                    className="input mt-1"
                    type="datetime-local"
                    value={when}
                    onChange={(event) => setWhen(event.target.value)}
                  />
                </label>
              ) : (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[.025] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      วันที่เริ่มต้น
                      <input
                        className="input mt-1"
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </label>
                    <label>
                      วันที่สิ้นสุด
                      <input
                        className="input mt-1"
                        type="date"
                        min={startDate}
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                      />
                    </label>
                  </div>

                  <div>
                    <p className="text-sm font-medium">เลือกวันที่ต้องการโพสต์</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const selected = selectedDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            className={selected ? "btn-primary" : "btn-ghost"}
                            onClick={() => toggleDay(day.value)}
                          >
                            {selected && <Check size={15} />}
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">เวลาโพสต์</p>
                      <button type="button" className="btn-ghost" onClick={addTime}>
                        <Plus size={15} />
                        เพิ่มเวลา
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {times.map((time, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Clock3 size={17} className="shrink-0 text-cyan-300" />
                          <input
                            className="input"
                            type="time"
                            value={time}
                            onChange={(event) => updateTime(index, event.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={times.length === 1}
                            onClick={() => removeTime(index)}
                            aria-label={`ลบเวลา ${time}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs leading-5 text-white/45">
                    ระบบจะสร้างคิวทุกวันที่เลือก ตามเวลาทั้งหมดที่ระบุ ภายในช่วงวันที่เริ่มต้นถึงวันที่สิ้นสุด
                  </p>
                </div>
              )}

              <button
                disabled={busy}
                className="btn-primary justify-center"
                onClick={() => void add()}
              >
                {busy && <Loader2 size={17} className="animate-spin" />}
                {scheduleMode === "single" ? "บันทึกเข้าคิว" : "สร้างคิวทั้งหมด"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assistant && (
        <div className="modal">
          <div className="modal-card max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-bold">Posting Assistant</h2>
                <p className="text-sm text-white/45">
                  ทำตาม 3 ขั้นตอน แล้วบันทึกผล
                </p>
              </div>

              <button onClick={() => setAssistant(null)}>
                <X />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {getImageUrls(assistant.content_items)[0] && (
                <img
                  src={getImageUrls(assistant.content_items)[0]}
                  alt=""
                  className="max-h-72 w-full rounded-xl bg-black/30 object-contain"
                />
              )}

              <div className="card">
                <p className="text-sm font-bold text-cyan-300">
                  1. เตรียมโพสต์
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-ghost"
                    onClick={() => void copyCaption(assistant)}
                  >
                    <Copy size={16} />
                    คัดลอกข้อความ
                  </button>

                  {getImageUrls(assistant.content_items).length > 0 && (
                    <button
                      className="btn-ghost"
                      onClick={() => void copyImage(assistant)}
                    >
                      <ImageIcon size={16} />
                      คัดลอกรูปแรก
                    </button>
                  )}
                </div>
              </div>

              <div className="card">
                <p className="text-sm font-bold text-cyan-300">
                  2. เปิด Facebook Group
                </p>

                <a
                  className="btn-primary mt-3 inline-flex"
                  href={assistant.groups?.facebook_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  เปิดกลุ่ม {assistant.groups?.name}
                </a>

                <p className="mt-3 text-xs text-white/45">
                  นำข้อความและรูปไปวางในช่องสร้างโพสต์ แล้วกดโพสต์บน Facebook
                </p>
              </div>

              <div className="card">
                <p className="text-sm font-bold text-cyan-300">
                  3. บันทึกผล
                </p>

                <label className="mt-3 block text-sm">
                  ลิงก์โพสต์ (ไม่บังคับ)
                  <input
                    className="input mt-1"
                    placeholder="https://www.facebook.com/..."
                    value={postUrl}
                    onChange={(event) => setPostUrl(event.target.value)}
                  />
                </label>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    disabled={busy}
                    className="btn-primary justify-center"
                    onClick={() => void finish("posted")}
                  >
                    <Check size={17} />
                    โพสต์สำเร็จ
                  </button>

                  <button
                    disabled={busy}
                    className="btn-danger justify-center"
                    onClick={() => void finish("failed")}
                  >
                    ไม่สำเร็จ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
