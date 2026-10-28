import Link from "next/link";
import { PlusIcon, ShieldIcon } from "@/components/nav/icons";
import { isAdmin } from "@/server/admin";

/** Sidebar entries shown only to admins. */
export async function AdminSidebarLinks() {
  if (!(await isAdmin())) return null;
  const cls = "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white";
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Admin</p>
      <Link href="/admin" className={cls}><ShieldIcon />Admin panel</Link>
      <Link href="/admin/stations/new" className={cls}><PlusIcon />Add a station</Link>
    </nav>
  );
}
