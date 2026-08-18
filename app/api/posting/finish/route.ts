import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30 * 1000;

export async function POST(request: NextRequest) {
  if (
    request.headers.get("x-groupflow-agent-secret") !==
    process.env.GROUPFLOW_AGENT_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server environment variables are incomplete" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const queueId = String(body?.queueId || "");
  const result = body?.result === "posted" ? "posted" : "failed";
  const postUrl = body?.postUrl ? String(body.postUrl) : null;
  const notes = body?.notes ? String(body.notes) : "บันทึกจาก Chrome Posting Agent V13";

  if (!queueId) {
    return NextResponse.json({ error: "queueId is required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowDate = new Date();
  const now = nowDate.toISOString();

  const { data: queueRow, error: queueError } = await supabase
    .from("queue_items")
    .select("id,user_id,group_id,content_id,status,attempt_count")
    .eq("id", queueId)
    .maybeSingle();

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  if (!queueRow) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  // Idempotency: duplicate finish messages must not create duplicate logs.
  if (queueRow.status === "posted") {
    return NextResponse.json({ ok: true, alreadyFinished: true, retry: false });
  }

  const attempts = Number(queueRow.attempt_count || 0);
  const shouldRetry = result === "failed" && attempts < MAX_ATTEMPTS;
  const nextStatus = shouldRetry ? "pending" : result;
  const retryAt = shouldRetry
    ? new Date(nowDate.getTime() + RETRY_DELAY_MS).toISOString()
    : null;

  const { error: updateError } = await supabase
    .from("queue_items")
    .update({
      status: nextStatus,
      scheduled_at: retryAt ?? undefined,
      posting_started_at: null,
      posting_finished_at: now,
      updated_at: now,
      last_error: result === "failed" ? notes : null,
    })
    .eq("id", queueId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: logError } = await supabase.from("posting_logs").insert({
    user_id: queueRow.user_id,
    queue_id: queueId,
    group_id: queueRow.group_id,
    content_id: queueRow.content_id,
    result,
    post_url: postUrl,
    notes: shouldRetry
      ? `${notes} | retry ${attempts + 1}/${MAX_ATTEMPTS}`
      : notes,
    posted_at: now,
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    retry: shouldRetry,
    nextAttemptAt: retryAt,
    attempt: attempts,
    maxAttempts: MAX_ATTEMPTS,
  });
}
