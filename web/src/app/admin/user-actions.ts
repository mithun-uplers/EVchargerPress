"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/admin";
import { BookingError, rpc } from "@/server/bookings";

/**
 * Creating accounts and changing a user's email or password go through the Supabase Auth
 * admin API with the server-only service-role key. Every action checks the admin role first,
 * and records an audit entry (never the password).
 */

export type UserFormState = { error?: string; ok?: string; values?: Record<string, string> } | null;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED = "Account changes need SUPABASE_SERVICE_ROLE_KEY on the server (see docs/ADMIN.md).";

function passwordProblem(pw: string, confirm: string) {
  if (pw.length < 8) return "Use at least 8 characters for the password.";
  if (pw.length > 72) return "Use at most 72 characters for the password.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number in the password.";
  if (pw !== confirm) return "The two passwords don’t match.";
  return null;
}
function authMessage(e: { message?: string; code?: string; status?: number } | null) {
  const m = (e?.message ?? "").toLowerCase();
  if (e?.code === "email_exists" || m.includes("already been registered") || m.includes("already registered")) return "An account with this email already exists.";
  if (e?.code === "weak_password" || m.includes("password")) return e?.message ?? "That password is too weak.";
  if (m.includes("email")) return "That email address isn’t valid.";
  console.error("Auth admin error", e?.code, e?.status);
  return "Couldn’t save the account. Please try again.";
}
const messageOf = (e: unknown) => (e instanceof BookingError ? e.message : "Something went wrong. Please try again.");

export async function createUserAction(_prev: UserFormState, f: FormData): Promise<UserFormState> {
  await requireAdmin("/admin/users/new");
  const values = { email: str(f, "email").toLowerCase(), display_name: str(f, "display_name"), phone: str(f, "phone") };
  const fail = (error: string): UserFormState => ({ error, values });
  if (!serviceConfigured()) return fail(NOT_CONFIGURED);
  if (!EMAIL.test(values.email)) return fail("Enter a valid email address.");
  if (!values.display_name || values.display_name.length > 80) return fail("Enter the person’s name (up to 80 characters).");
  const pwProblem = passwordProblem(str(f, "password"), str(f, "confirm"));
  if (pwProblem) return fail(pwProblem);
  const requireChange = f.get("require_change") === "on";
  const makeAdmin = f.get("make_admin") === "on";

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email: values.email,
    password: str(f, "password"),
    email_confirm: true, // admin-created accounts skip email verification
    user_metadata: { display_name: values.display_name },
    app_metadata: { password_change_required: requireChange },
  });
  if (error || !data.user) return fail(authMessage(error));
  const id = data.user.id;

  const notes: string[] = [];
  try {
    await rpc("admin_record_account_change", { p_action: "create_user", p_user_id: id, p_detail: { email: values.email, require_change: requireChange, admin: makeAdmin } });
    await rpc("admin_update_profile", { p_user_id: id, p_display_name: values.display_name, p_phone: values.phone || null });
  } catch (e) {
    notes.push(messageOf(e));
  }
  if (makeAdmin) {
    try {
      await rpc("admin_set_admin", { p_user_id: id, p_admin: true });
    } catch (e) {
      notes.push(`Admin access not granted: ${messageOf(e)}`);
    }
  }
  revalidatePath("/admin/users");
  const ok = `Account created for ${values.email}. Share the password with them privately${requireChange ? " — they’ll be asked to choose their own when they first sign in" : ""}.`;
  redirect(`/admin/users/${id}?${new URLSearchParams(notes.length ? { error: `Account created, but: ${notes.join(" ")}` } : { ok })}`);
}

export async function updateUserAction(_prev: UserFormState, f: FormData): Promise<UserFormState> {
  const id = str(f, "user_id");
  await requireAdmin(`/admin/users/${id}`);
  const email = str(f, "email").toLowerCase();
  const currentEmail = str(f, "current_email").toLowerCase();
  try {
    await rpc("admin_update_profile", { p_user_id: id, p_display_name: str(f, "display_name"), p_phone: str(f, "phone") || null });
  } catch (e) {
    return { error: messageOf(e) };
  }
  if (email && email !== currentEmail) {
    if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
    if (!serviceConfigured()) return { error: `Name and phone saved. Email not changed: ${NOT_CONFIGURED}` };
    const { error } = await createServiceClient().auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return { error: `Name and phone saved. Email not changed: ${authMessage(error)}` };
    try {
      await rpc("admin_record_account_change", { p_action: "change_email", p_user_id: id, p_detail: { from: currentEmail, to: email } });
    } catch (e) {
      return { error: `Email changed, but the audit entry failed: ${messageOf(e)}` };
    }
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { ok: email !== currentEmail ? "Saved. The new email works for sign-in straight away." : "Saved." };
}

export async function setPasswordAction(_prev: UserFormState, f: FormData): Promise<UserFormState> {
  const id = str(f, "user_id");
  await requireAdmin(`/admin/users/${id}`);
  if (!serviceConfigured()) return { error: NOT_CONFIGURED };
  const me = await getCurrentUser();
  if (me?.id === id) return { error: "Change your own password from My profile." };
  const problem = passwordProblem(str(f, "password"), str(f, "confirm"));
  if (problem) return { error: problem };
  const requireChange = f.get("require_change") === "on";
  const { error } = await createServiceClient().auth.admin.updateUserById(id, {
    password: str(f, "password"),
    app_metadata: { password_change_required: requireChange },
  });
  if (error) return { error: authMessage(error) };
  try {
    await rpc("admin_record_account_change", { p_action: "set_password", p_user_id: id, p_detail: { require_change: requireChange } });
  } catch (e) {
    return { error: `Password set, but the audit entry failed: ${messageOf(e)}` };
  }
  revalidatePath(`/admin/users/${id}`);
  return { ok: `New password set. Share it privately${requireChange ? "; they’ll choose their own at next sign-in" : ""}.` };
}
