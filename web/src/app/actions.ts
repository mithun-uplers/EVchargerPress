"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CONNECTOR_TYPES } from "@/lib/types";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const enc = encodeURIComponent;

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/* ---------- Auth ---------- */

export async function signIn(formData: FormData) {
  const email = str(formData.get("email"));
  const password = str(formData.get("password"));
  const next = safeNext(str(formData.get("next")) || "/");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${enc(error.message)}&next=${enc(next)}`);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = str(formData.get("email"));
  const password = str(formData.get("password"));
  const displayName = str(formData.get("display_name"));
  // New accounts go through onboarding unless they were in the middle of something (e.g. a booking).
  const requested = safeNext(str(formData.get("next")) || "/");
  const next = requested === "/" ? "/onboarding" : requested;
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${origin}/auth/confirm?next=${enc(next)}`,
    },
  });
  if (error) redirect(`/login?mode=signup&error=${enc(error.message)}&next=${enc(next)}`);
  if (!data.session) {
    redirect(`/login?message=${enc("Check your email to confirm your account, then sign in.")}`);
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/* ---------- Stations ---------- */

export async function createStation(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/stations/new");

  const back = (msg: string) => redirect(`/stations/new?error=${enc(msg)}`);

  const name = str(formData.get("name"));
  const address = str(formData.get("address"));
  const city = str(formData.get("city"));
  const lat = Number(str(formData.get("lat")));
  const lng = Number(str(formData.get("lng")));
  if (name.length < 2) back("Please enter a station name.");
  if (!address || !city) back("Address and city are required.");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)
    back("Please enter a valid latitude and longitude.");

  const connectors: { type: string; power_kw: number; quantity: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const type = str(formData.get(`c${i}_type`));
    const kw = Number(str(formData.get(`c${i}_kw`)));
    const qty = Number(str(formData.get(`c${i}_qty`)) || "1");
    if (!type) continue;
    if (!(CONNECTOR_TYPES as readonly string[]).includes(type)) back("Unknown connector type.");
    if (!(kw > 0) || !(qty > 0)) back("Each connector needs a power (kW) and quantity.");
    connectors.push({ type, power_kw: kw, quantity: Math.floor(qty) });
  }
  if (connectors.length === 0) back("Add at least one connector.");

  const supabase = await createClient();
  const { data: station, error } = await supabase
    .from("stations")
    .insert({
      name,
      address,
      city,
      lat,
      lng,
      operator: str(formData.get("operator")) || null,
      access: str(formData.get("access")) === "restricted" ? "restricted" : "public",
      hours: str(formData.get("hours")) || null,
      price_info: str(formData.get("price_info")) || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !station) back(error?.message ?? "Could not save station.");

  const { error: cErr } = await supabase
    .from("connectors")
    .insert(connectors.map((c) => ({ ...c, station_id: station!.id })));
  if (cErr) {
    await supabase.from("stations").delete().eq("id", station!.id);
    back(cErr.message);
  }

  revalidatePath("/");
  redirect(`/stations/${station!.id}`);
}

export async function deleteStation(formData: FormData) {
  const id = str(formData.get("station_id"));
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  // RLS ensures only the owner can delete.
  await supabase.from("stations").delete().eq("id", id);
  revalidatePath("/");
  redirect("/");
}

/* ---------- Check-ins ---------- */

export async function addCheckin(formData: FormData) {
  const stationId = str(formData.get("station_id"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${enc(`/stations/${stationId}`)}`);

  const status = str(formData.get("status"));
  const comment = str(formData.get("comment")).slice(0, 500) || null;
  if (!["working", "broken", "busy"].includes(status)) {
    redirect(`/stations/${stationId}?error=${enc("Pick a status.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("checkins")
    .insert({ station_id: stationId, user_id: user.id, status, comment });
  if (error) redirect(`/stations/${stationId}?error=${enc(error.message)}`);

  revalidatePath(`/stations/${stationId}`);
  revalidatePath("/");
  redirect(`/stations/${stationId}`);
}

/* ---------- Password recovery ---------- */

export async function requestPasswordReset(formData: FormData) {
  const email = str(formData.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/forgot-password?error=${enc("Enter a valid email address.")}`);
  }
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // The link in the email signs the user in for a short time and lands on /reset-password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${enc("/reset-password")}`,
  });
  // Same message whether or not the account exists, so emails can't be probed.
  redirect(`/forgot-password?sent=1`);
}

export async function updatePassword(formData: FormData) {
  const password = str(formData.get("password"));
  const confirm = str(formData.get("confirm"));
  if (password.length < 8) redirect(`/reset-password?error=${enc("Use at least 8 characters.")}`);
  if (password !== confirm) redirect(`/reset-password?error=${enc("The two passwords don't match.")}`);

  const user = await getCurrentUser();
  if (!user) redirect(`/forgot-password?error=${enc("Your reset link has expired. Request a new one.")}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/reset-password?error=${enc(error.message)}`);
  revalidatePath("/", "layout");
  redirect(`/?message=${enc("Password updated.")}`);
}
