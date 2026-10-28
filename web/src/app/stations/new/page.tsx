import { redirect } from "next/navigation";

/** Stations are added by admins only; the old driver form now lives in the admin panel. */
export default function NewStationRedirect() {
  redirect("/admin/stations/new");
}
