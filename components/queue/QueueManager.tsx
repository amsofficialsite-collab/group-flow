"use client";

// Compatibility wrapper kept for older imports. The live queue implementation
// uses the V13 schema: groups + content_items + queue_items + posting_logs.
import DailyQueue from "@/components/queue/DailyQueue";

export default function QueueManager() {
  return <DailyQueue />;
}
