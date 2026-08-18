"use client";

// Compatibility wrapper kept for older imports. Dashboard queries live in
// LiveDashboard so there is only one Supabase schema contract to maintain.
import LiveDashboard from "@/components/dashboard/LiveDashboard";

export default function DashboardClient() {
  return <LiveDashboard />;
}
