import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalyticsView } from "@/components/charging/AnalyticsView";
import { chargingAnalytics } from "@/lib/analytics";
import { toHistoryItems } from "@/lib/charging-stats";
import { getCurrentUser } from "@/lib/supabase/server";
import { listSessions } from "@/server/account";

export const metadata: Metadata = { title: "Charging analytics" };

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/analytics");
  const sessions = await listSessions(1000);
  return <AnalyticsView a={chargingAnalytics(toHistoryItems(sessions), new Date())} />;
}
