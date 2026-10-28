import { notFound } from "next/navigation";
import { StationManageView } from "@/components/admin/StationManageView";
import { getStation, requireAdmin } from "@/server/admin";

export const metadata = { title: "Manage station" };

export default async function AdminStationPage({ params, searchParams }: PageProps<"/admin/stations/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/stations/${id}`);
  const [sp, d] = await Promise.all([searchParams, getStation(id)]);
  if (!d) notFound();
  return <StationManageView d={d} sp={sp} />;
}
