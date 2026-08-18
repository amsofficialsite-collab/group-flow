"use client";

// Compatibility wrapper kept for older imports. The live history implementation
// uses posting_logs, matching the V13 schema.
import PostingHistory from "@/components/history/PostingHistory";

export default function HistoryManager() {
  return <PostingHistory />;
}
