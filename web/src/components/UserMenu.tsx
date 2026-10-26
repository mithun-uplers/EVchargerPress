import Link from "next/link";
import { signOut } from "@/app/actions";
import { getCurrentUser } from "@/lib/supabase/server";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
        Sign in
      </Link>
    );
  }
  return (
    <form action={signOut} className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{user.email}</span>
      <button className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800">
        Sign out
      </button>
    </form>
  );
}
