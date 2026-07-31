import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  text = text.replace(
    /(?<!^)(?=(?:✨|🎯|📞|📊|⏰|🏥|🏦|🌴|🎉|✈️|🍚|🥪|☎️|✅|🔹|▪️|•))/gu,
    "\n",
  );

  text = text
    .replace(/\s+(Line\s*:)/gi, "\n$1")
    .replace(/\s+(FB\s*:)/gi, "\n$1")
    .replace(/\s+(☎️)/gu, "\n$1")
    .replace(/\s+(https?:\/\/)/gi, "\n$1")
    .replace(/\s+(#\S+)/g, "\n\n$1")
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

export async function POST(request: NextRequest) {
  if (
    request.headers.get("x-groupflow-agent-secret") !==
    process.env.GROUPFLOW_AGENT_SECRET
  ) {
    return unauthorized();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server environment variables are incomplete" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  const { data: candidates, error: selectError } = await supabase
    .from("queue_items")
    .select(
      "id,scheduled_at,status,attempt_count,groups(id,name,facebook_url),content_items(id,title,body,hashtags,image_url,content_images(image_url,sort_order))",
    )
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const row = candidates?.[0] as any;
  if (!row) return NextResponse.json({ job: null });

  const { data: claimed, error: claimError } = await supabase
    .from("queue_items")
    .update({
      status: "posting",
      posting_started_at: now,
      updated_at: now,
      last_error: null,
      attempt_count: Number(row.attempt_count || 0) + 1,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claimed) return NextResponse.json({ job: null });

  const group = row.groups;
  const content = row.content_items;

  if (!group?.facebook_url || !content) {
    const reason = !group?.facebook_url
      ? "ไม่พบ Facebook URL ของกลุ่ม"
      : "ไม่พบข้อมูลคอนเทนต์";

    await supabase
      .from("queue_items")
      .update({
        status: "failed",
        posting_finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: reason,
      })
      .eq("id", row.id);

    return NextResponse.json({ error: reason }, { status: 422 });
  }

  const galleryUrls = Array.isArray(content.content_images)
    ? [...content.content_images]
        .sort(
          (a: any, b: any) =>
            Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
        )
        .map((image: any) => image.image_url)
        .filter(Boolean)
    : [];

  const imageUrls = [...galleryUrls, content.image_url]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);

  const rawCaption = [content.body || "", content.hashtags || ""]
    .filter(Boolean)
    .join("\n\n");

  return NextResponse.json({
    job: {
      queueId: row.id,
      groupUrl: group.facebook_url,
      groupName: group.name,
      caption: formatFacebookCaption(rawCaption),
      imageUrls,
      autoPost: true,
    },
  });
}
