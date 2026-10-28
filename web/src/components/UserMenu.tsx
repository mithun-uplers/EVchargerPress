import Link from "next/link";
import { signOut } from "@/app/actions";
import { getCurrentUser } from "@/lib/supabase/server";

export async function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="inline-flex min-h-10 items-center rounded-xl bg-energy-600 shadow-sm px-3 text-sm font-medium text-white hover:bg-energy-700">
        Sign in
      </Link>
    );
  }
  if (compact) {
    return (
      <Link href="/profile" className="max-w-40 truncate text-sm text-zinc-500" aria-label="Your profile">
        {user.email}
      </Link>
    );
  }
  return (
    <form action={signOut} className="space-y-2">
      <p className="truncate text-xs text-zinc-500" title={user.email}>{user.email}</p>
      <button className="min-h-10 w-full rounded-xl px-3 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">
        Sign out
      </button>
    </form>
  );
}
