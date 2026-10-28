import type { Metadata } from "next";
import Link from "next/link";
import { updatePassword } from "@/app/actions";
import { AuthShell } from "@/components/AuthShell";
import { getCurrentUser } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  if (!user) {
    return (
      <AuthShell title="Link expired" subtitle="Open the reset link from your latest email, or request a new one.">
        <Link href="/forgot-password" className={ui.btn}>Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={`For ${user.email}`}>
      {sp.required === "1" && (
        <p className={`mb-4 ${ui.ok}`}>Your account was set up by an EVChargePress admin. Choose your own password to continue.</p>
      )}
      {error && <p className={`mb-4 ${ui.error}`}>{error}</p>}
      <form action={updatePassword} className="space-y-4">
        <label className="block text-sm font-medium">
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={ui.input} />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={ui.input} />
        </label>
        <button className={`${ui.btn} w-full`}>Update password</button>
      </form>
    </AuthShell>
  );
}
