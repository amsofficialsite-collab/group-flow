"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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

type Identity = {
  id: string;
  name: string;
  identity_type: "profile" | "page";
  active: boolean;
};

type Group = {
  id: string;
  name: string;
  facebook_url: string | null;
  posting_identity: string | null;
  group_identity_access?: { identity_id: string }[];
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
  post_as?: "group" | "profile" | "page";
  posting_identity?: string | null;
  identity_id?: string | null;
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
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assistant, setAssistant] = useState<QueueRow | null>(null);
  const [identityId, setIdentityId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
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
  const [timesByDay, setTimesByDay] = useState<Record<number, string[]>>({ [today.getDay()]: ["09:00"] });
  const [postUrl, setPostUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);

    const [g, i, c, q] = await Promise.all([
      supabase
        .from("groups")
        .select("id,name,facebook_url,posting_identity,group_identity_access(identity_id)")
        .eq("active", true)
        .order("name"),
      supabase
        .from("facebook_identities")
        .select("id,name,identity_type,active")
        .eq("active", true)
        .order("identity_type")
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
          "id,scheduled_at,status,post_as,posting_identity,identity_id,groups(*),content_items(id,title,body,hashtags,image_url,content_images(image_url,sort_order))",
        )
        .in("status", ["pending", "posting"])
        .order("scheduled_at", { ascending: true }),
    ]);

    if (g.error) alert(g.error.message);
    if (i.error) alert(i.error.message);
    if (c.error) alert(c.error.message);
    if (q.error) alert(q.error.message);

    setGroups((g.data || []) as unknown as Group[]);
    setIdentities((i.data || []) as Identity[]);
    setContents((c.data || []) as Content[]);
    setRows((q.data || []) as unknown as QueueRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const channel = supabase
      .channel("v13-daily-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_items" }, () => void load())
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const onResult = async (event: Event) => {
      const detail = (event as CustomEvent<PostingResultDetail>).detail;
      if (!detail?.queueId || !detail?.result) return;

      // The Extension has already persisted queue status + posting_logs via
      // /api/posting/finish. The dashboard only refreshes here to avoid
      // duplicate History rows.
      await load();
      alert(
        detail.result === "posted"
          ? "Posting Agent รายงานว่าโพสต์สำเร็จแล้วค่ะ"
          : `Posting Agent รายงานว่าโพสต์ไม่สำเร็จค่ะ${detail.notes ? `\n\nสาเหตุ: ${detail.notes}` : ""}`,
      );
    };

    window.addEventListener("groupflow:post-result", onResult as EventListener);
    return () => window.removeEventListener("groupflow:post-result", onResult as EventListener);
  }, [rows, supabase]);

  function resetScheduleForm() {
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    setIdentityId("");
    setSelectedGroupIds([]);
    setContentId("");
    setWhen("");
    setScheduleMode("single");
    setStartDate(toDateInputValue(now));
    setEndDate(toDateInputValue(weekLater));
    setSelectedDays([now.getDay()]);
    setTimesByDay({ [now.getDay()]: ["09:00"] });
  }

  function selectIdentity(value: string) {
    setIdentityId(value);
    setSelectedGroupIds([]);
  }

  const selectedIdentity = identities.find((item) => item.id === identityId) ?? null;
  const eligibleGroups = identityId
    ? groups.filter((group) => (group.group_identity_access ?? []).some((access) => access.identity_id === identityId))
    : [];

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  }

  function selectAllGroups() {
    setSelectedGroupIds(eligibleGroups.map((group) => group.id));
  }

  function clearGroups() {
    setSelectedGroupIds([]);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) => {
      const selected = current.includes(day);
      if (selected) {
        setTimesByDay((currentTimes) => {
          const next = { ...currentTimes };
          delete next[day];
          return next;
        });
        return current.filter((value) => value !== day);
      }

      setTimesByDay((currentTimes) => ({
        ...currentTimes,
        [day]: currentTimes[day]?.length ? currentTimes[day] : ["09:00"],
      }));
      return [...current, day];
    });
  }

  function addTime(day: number) {
    setTimesByDay((current) => ({
      ...current,
      [day]: [...(current[day] ?? ["09:00"]), "12:00"],
    }));
  }

  function updateTime(day: number, index: number, value: string) {
    setTimesByDay((current) => ({
      ...current,
      [day]: (current[day] ?? []).map((time, timeIndex) =>
        timeIndex === index ? value : time,
      ),
    }));
  }

  function removeTime(day: number, index: number) {
    setTimesByDay((current) => {
      const dayTimes = current[day] ?? [];
      if (dayTimes.length <= 1) return current;
      return {
        ...current,
        [day]: dayTimes.filter((_, timeIndex) => timeIndex !== index),
      };
    });
  }

  function buildBaseScheduleDates(): Date[] {
    if (scheduleMode === "single") {
      if (!when) return [];
      const date = new Date(when);
      return Number.isNaN(date.getTime()) || date < new Date() ? [] : [date];
    }

    const start = dateFromLocalInputs(startDate, "00:00");
    const end = dateFromLocalInputs(endDate, "23:59");
    if (!start || !end || end < start) return [];

    const dates: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      if (selectedDays.includes(cursor.getDay())) {
        const dateValue = toDateInputValue(cursor);
        const times = Array.from(new Set((timesByDay[cursor.getDay()] ?? []).filter(Boolean))).sort();
        for (const time of times) {
          const date = dateFromLocalInputs(dateValue, time);
          if (date && date >= new Date()) dates.push(date);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  const queuePreview = useMemo(() => {
    const baseDates = buildBaseScheduleDates();
    const interval = Math.max(0, Number(intervalMinutes) || 0);
    return baseDates.flatMap((baseDate) =>
      selectedGroupIds.map((id, groupIndex) => {
        const group = eligibleGroups.find((item) => item.id === id);
        const scheduledAt = new Date(baseDate.getTime() + groupIndex * interval * 60000);
        return { groupId: id, groupName: group?.name || "ไม่พบ Group", scheduledAt };
      }),
    );
  }, [scheduleMode, when, startDate, endDate, selectedDays, timesByDay, selectedGroupIds, eligibleGroups, intervalMinutes]);

  async function add() {
    if (!identityId || !selectedIdentity) {
      alert("กรุณาเลือก Facebook Identity ก่อนค่ะ");
      return;
    }
    if (selectedGroupIds.length === 0 || !contentId) {
      alert("เลือกอย่างน้อย 1 กลุ่มและเลือกคอนเทนต์ให้ครบค่ะ");
      return;
    }
    if (selectedGroupIds.some((id) => !eligibleGroups.some((group) => group.id === id))) {
      alert("มี Group ที่ไม่ได้ผูกกับ Facebook Identity ที่เลือกค่ะ");
      return;
    }
    if (intervalMinutes < 0 || intervalMinutes > 1440) {
      alert("ช่วงห่างต้องอยู่ระหว่าง 0–1,440 นาทีค่ะ");
      return;
    }
    if (scheduleMode === "multiple" && selectedDays.length === 0) {
      alert("เลือกอย่างน้อย 1 วันค่ะ");
      return;
    }
    if (queuePreview.length === 0) {
      alert("ไม่พบวันและเวลาที่ยังไม่ผ่านไป กรุณาตรวจสอบ Schedule ค่ะ");
      return;
    }
    if (queuePreview.length > 300) {
      alert(`รายการที่กำลังสร้างมี ${queuePreview.length} คิว กรุณาลดจำนวน Group/วัน/เวลาให้ไม่เกิน 300 คิวค่ะ`);
      return;
    }

    const postAs: "profile" | "page" = selectedIdentity.identity_type;
    const postingIdentity = postAs === "page" ? selectedIdentity.name : null;
    const queueRows = queuePreview.map((item) => ({
      group_id: item.groupId,
      content_id: contentId,
      scheduled_at: item.scheduledAt.toISOString(),
      status: "pending" as const,
      identity_id: identityId,
      post_as: postAs,
      posting_identity: postingIdentity,
    }));

    setBusy(true);
    try {
      const { error } = await supabase.from("queue_items").insert(queueRows);
      if (error) throw error;
      alert(`สร้างคิวเรียบร้อย ${queueRows.length} คิว สำหรับ ${selectedGroupIds.length} กลุ่มค่ะ`);
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

  function postingIdentityFor(row: QueueRow): string {
    if (row.post_as === "profile") return "";
    if (row.post_as === "page") return row.posting_identity?.trim() || "";
    return row.groups?.posting_identity?.trim() || "";
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
      postingIdentity: postingIdentityFor(row),
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
          postingIdentity: postingIdentityFor(row),
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

    const { data: { user } } = await supabase.auth.getUser();
    const { error: logError } = await supabase
      .from("posting_logs")
      .insert({
        user_id: user?.id,
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

  async function postNow(row: QueueRow) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("queue_items").update({ scheduled_at: now, status: "pending", last_error: null, updated_at: now }).eq("id", row.id);
    if (error) alert(error.message); else await load();
  }

  async function reschedule(row: QueueRow) {
    const suggested = new Date(Date.now() + 30 * 60 * 1000);
    const local = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    const value = window.prompt("ใส่วันและเวลาใหม่ (YYYY-MM-DDTHH:mm)", local);
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date()) { alert("กรุณาเลือกเวลาในอนาคตค่ะ"); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from("queue_items").update({ scheduled_at: date.toISOString(), status: "pending", last_error: null, updated_at: now }).eq("id", row.id);
    if (error) alert(error.message); else await load();
  }

  async function cancelOverdue(row: QueueRow) {
    if (!confirm("ยกเลิกคิวนี้หรือไม่? รายการจะออกจาก Daily Queue และเก็บสถานะเป็น skipped")) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("queue_items").update({ status: "skipped", posting_finished_at: now, last_error: "ยกเลิกจาก Daily Queue", updated_at: now }).eq("id", row.id);
    if (error) { alert(error.message); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error: logError } = await supabase.from("posting_logs").insert({ user_id: user?.id, queue_id: row.id, group_id: row.groups?.id || null, content_id: row.content_items?.id || null, result: "skipped", notes: "ยกเลิกจาก Daily Queue", posted_at: now });
    if (logError) alert(logError.message);
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

  const nowForList = new Date();
  const overdueRows = rows.filter((row) => new Date(row.scheduled_at) < nowForList && row.status === "pending");
  const upcomingRows = rows.filter((row) => new Date(row.scheduled_at) >= nowForList || row.status === "posting");
  const dateKey = (value: string) => new Date(value).toLocaleDateString("en-CA");
  const dateLabel = (value: string) => {
    const date = new Date(value);
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const target = new Date(date); target.setHours(0,0,0,0);
    if (target.getTime() === today.getTime()) return "วันนี้";
    if (target.getTime() === tomorrow.getTime()) return "พรุ่งนี้";
    return date.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

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
      ) : upcomingRows.length || overdueRows.length ? (
        <div className="space-y-6">
          {overdueRows.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-900">คิวตกค้าง • ต้องตรวจสอบ ({overdueRows.length})</p>
              <p className="mb-3 text-sm text-amber-700">รายการเหล่านี้เลยเวลาแล้วแต่ยังเป็น pending จึงไม่ปนกับ Daily Queue หลัก</p>
              <div className="space-y-2">{overdueRows.map((row) => {
                const lateMinutes = Math.max(1, Math.floor((Date.now() - new Date(row.scheduled_at).getTime()) / 60000));
                return <div key={row.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div><p className="font-bold text-slate-900">{row.content_items?.title || "คอนเทนต์ถูกลบ"}</p><p className="text-sm text-slate-600">{row.groups?.name || "กลุ่มถูกลบ"} · {row.post_as === "page" ? `Page: ${row.posting_identity || "-"}` : "Profile"}</p><p className="text-xs text-amber-700">นัด {new Date(row.scheduled_at).toLocaleString("th-TH")} · เลยเวลาประมาณ {lateMinutes} นาที</p></div>
                    <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => void postNow(row)}><Send size={15}/>โพสต์ตอนนี้</button><button className="btn-ghost" onClick={() => void reschedule(row)}><Clock3 size={15}/>เลื่อนเวลา</button><button className="btn-danger" onClick={() => void cancelOverdue(row)}><X size={15}/>ยกเลิก</button></div>
                  </div>
                </div>
              })}</div>
            </div>
          )}
          {upcomingRows.map((row, index) => {
            const imageUrls = getImageUrls(row.content_items);
            const previewUrl = imageUrls[0];

            const showDay = index === 0 || dateKey(upcomingRows[index - 1].scheduled_at) !== dateKey(row.scheduled_at);
            return (
              <Fragment key={row.id}>
              {showDay && <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-800">{dateLabel(row.scheduled_at)}</div>}
              <div
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
                  <p className="mt-1 text-sm text-slate-500">
                    {row.groups?.name || "กลุ่มถูกลบ"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-indigo-600">
                    {row.post_as === "page" ? `Page · ${row.posting_identity || "ไม่ระบุชื่อ"}` : "Facebook Profile"}
                  </p>
                  <p className="mt-1 text-xs text-cyan-600">
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
              </Fragment>
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
                1. Post as / Facebook Identity
                <select className="input mt-1" value={identityId} onChange={(event) => selectIdentity(event.target.value)}>
                  <option value="">เลือก Profile หรือ Page ก่อน</option>
                  {identities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.identity_type === "profile" ? "Profile" : "Page"} · {identity.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">2. Facebook Groups <span className="text-indigo-600">({selectedGroupIds.length} กลุ่ม)</span></p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost" disabled={!identityId || eligibleGroups.length === 0} onClick={selectAllGroups}>เลือกทั้งหมด</button>
                    <button type="button" className="btn-ghost" disabled={selectedGroupIds.length === 0} onClick={clearGroups}>ล้าง</button>
                  </div>
                </div>
                <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                  {!identityId ? <p className="p-3 text-sm text-slate-400">เลือก Identity ก่อน</p> : eligibleGroups.length === 0 ? <p className="p-3 text-sm text-amber-600">Identity นี้ยังไม่ได้ผูกกับ Group ใด กรุณาไปที่หน้า Groups ก่อน</p> : eligibleGroups.map((group) => {
                    const checked = selectedGroupIds.includes(group.id);
                    return <label key={group.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${checked ? "border-indigo-300 bg-indigo-50" : "border-slate-100"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleGroup(group.id)} />
                      <span className="text-sm font-medium text-slate-700">{group.name}</span>
                    </label>;
                  })}
                </div>
              </div>

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

                  <div className="space-y-3">
                    <p className="text-sm font-medium">เวลาโพสต์แยกตามวัน</p>
                    {WEEKDAYS.filter((day) => selectedDays.includes(day.value)).map((day) => {
                      const dayTimes = timesByDay[day.value] ?? ["09:00"];
                      return (
                        <div key={day.value} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-700">{day.label}</p>
                            <button type="button" className="btn-ghost" onClick={() => addTime(day.value)}>
                              <Plus size={15} />
                              เพิ่มเวลา
                            </button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {dayTimes.map((time, index) => (
                              <div key={`${day.value}-${index}`} className="flex items-center gap-2">
                                <Clock3 size={17} className="shrink-0 text-indigo-600" />
                                <input
                                  className="input"
                                  type="time"
                                  value={time}
                                  onChange={(event) => updateTime(day.value, index, event.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn-danger"
                                  disabled={dayTimes.length === 1}
                                  onClick={() => removeTime(day.value, index)}
                                  aria-label={`ลบเวลา ${time} วัน${day.label}`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-5 text-slate-500">
                    แต่ละวันสามารถมีชุดเวลาไม่เหมือนกันได้ เช่น จันทร์ 08:00/12:00/18:00 และอังคาร 09:00/19:00
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-sm font-bold text-slate-800">ช่วงห่างระหว่างแต่ละ Group</p><p className="text-xs text-slate-500">ระบบจะไม่ยิงทุกกลุ่มพร้อมกัน แต่กระจายเวลาตามลำดับที่เลือก</p></div>
                  <div className="flex flex-wrap gap-2">{[0,2,5,10,15,30].map((minute) => <button key={minute} type="button" className={intervalMinutes === minute ? "btn-primary" : "btn-ghost"} onClick={() => setIntervalMinutes(minute)}>{minute === 0 ? "พร้อมกัน" : `${minute} นาที`}</button>)}</div>
                </div>
                <label className="mt-3 block text-sm">กำหนดเอง (นาที)<input className="input mt-1" type="number" min="0" max="1440" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Math.max(0, Number(event.target.value) || 0))} /></label>
              </div>

              {selectedGroupIds.length > 0 && queuePreview.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-800">Queue Preview</p><span className="badge">{queuePreview.length} คิว</span></div>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">{queuePreview.slice(0,100).map((item,index) => <div key={`${item.groupId}-${item.scheduledAt.toISOString()}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0 truncate text-slate-700">{item.groupName}</span><span className="shrink-0 font-semibold text-indigo-600">{item.scheduledAt.toLocaleString("th-TH")}</span></div>)}{queuePreview.length > 100 && <p className="text-center text-xs text-slate-400">แสดง 100 รายการแรกจาก {queuePreview.length} คิว</p>}</div>
              </div>}

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
