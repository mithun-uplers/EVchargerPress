import type { Metadata } from "next";
import Link from "next/link";
import { updatePassword } from "@/app/actions";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };

const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  if (!user) {
    return (
      <div className="mx-auto max-w-sm py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-zinc-500">Open the reset link from your latest email, or request a new one.</p>
        <Link href="/forgot-password" className="mt-4 inline-block rounded-lg bg-energy-600 px-4 py-2 text-sm font-medium text-white hover:bg-energy-700">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-zinc-500">For {user.email}</p>
      {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <form action={updatePassword} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </label>
        <button className="w-full rounded-lg bg-energy-600 py-2.5 text-sm font-medium text-white hover:bg-energy-700">Update password</button>
      </form>
    </div>
  );
}
