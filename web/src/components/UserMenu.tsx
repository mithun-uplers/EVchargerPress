import Link from "next/link";
import { signOut } from "@/app/actions";
import { SignOutIcon } from "@/components/nav/icons";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile } from "@/server/account";
import { isAdmin } from "@/server/admin";

function initialsOf(name: string) {
  return name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "EV";
}

const LINKS = [
  { href: "/profile", label: "My profile" },
  { href: "/vehicles", label: "My vehicles · Connect car" },
  { href: "/trips", label: "Saved trips" },
  { href: "/history", label: "Charging history" },
  { href: "/analytics", label: "Analytics" },
];

/**
 * Account controls. Desktop: a card at the bottom of the sidebar with a clear Sign out button.
 * Phones: an avatar button in the top bar that opens a menu (works without JavaScript).
 */
export async function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-energy-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-energy-700">
        Sign in
      </Link>
    );
  }
  const [profile, admin] = await Promise.all([getProfile(user.id), isAdmin()]);
  const name = profile?.display_name || user.email.split("@")[0];
  const initials = initialsOf(name);

  return <AccountMenuView name={name} email={user.email} initials={initials} compact={compact} admin={admin} />;
}

/** Presentational account menu (also used by the design preview). */
export function AccountMenuView({ name, email, initials, compact = false, demo = false, admin = false }: { name: string; email: string; initials: string; compact?: boolean; demo?: boolean; admin?: boolean }) {
  if (compact) {
    return (
      <details className="group relative">
        <summary
          aria-label="Account menu"
          className="flex min-h-10 list-none items-center gap-2 rounded-full p-0.5 pr-2 ring-1 ring-inset ring-zinc-200 hover:bg-energy-50 dark:ring-zinc-700 [&::-webkit-details-marker]:hidden dark:hover:bg-energy-500/15"
        >
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-energy-600 text-sm font-semibold text-white">{initials}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-zinc-500 transition group-open:rotate-180"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </summary>
        <div className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-zinc-500">{email}</p>
          </div>
          <nav aria-label="Account" className="py-1">
            {admin && (
              <Link href="/admin" className="flex min-h-11 items-center px-4 text-sm font-semibold text-energy-700 hover:bg-energy-50 dark:text-energy-400 dark:hover:bg-zinc-800">Admin panel</Link>
            )}
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-11 items-center px-4 text-sm hover:bg-energy-50 dark:hover:bg-zinc-800">{l.label}</Link>
            ))}
          </nav>
          <form action={demo ? undefined : signOut} className="border-t border-zinc-100 p-2 dark:border-zinc-800">
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/25">
              <SignOutIcon className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </details>
    );
  }
  return (
    <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <Link href="/profile" className="flex items-center gap-3 rounded-xl p-1 hover:bg-white dark:hover:bg-zinc-800">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-energy-600 text-sm font-semibold text-white">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-zinc-500" title={email}>{email}</span>
        </span>
      </Link>
      <form action={demo ? undefined : signOut} className="mt-2">
        <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:bg-zinc-950 dark:text-rose-300 dark:ring-rose-500/30 dark:hover:bg-rose-500/20">
          <SignOutIcon className="h-4 w-4" /> Sign out
        </button>
      </form>
    </div>
  );
}
