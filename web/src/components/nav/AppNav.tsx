"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoltIcon, CalendarIcon, CarIcon, HomeIcon, MapIcon, PlusIcon, UserIcon } from "./icons";

const ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" || p.startsWith("/stations") },
  { href: "/map", label: "Map", icon: MapIcon, match: (p: string) => p.startsWith("/map"), desktopOnly: true },
  { href: "/bookings", label: "Bookings", icon: CalendarIcon, match: (p: string) => p.startsWith("/bookings") },
  { href: "/vehicles", label: "Vehicles", icon: CarIcon, match: (p: string) => p.startsWith("/vehicles") },
  { href: "/history", label: "History", icon: BoltIcon, match: (p: string) => p.startsWith("/history") },
  { href: "/profile", label: "Profile", icon: UserIcon, match: (p: string) => p.startsWith("/profile") || p.startsWith("/onboarding") },
];

/** Desktop: left sidebar. */
export function SidebarNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
              active
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
      <Link
        href="/stations/new"
        className="mt-4 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <PlusIcon />
        Add a station
      </Link>
    </nav>
  );
}

/** Mobile: bottom tab bar (Home, Bookings, Vehicles, History, Profile). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.filter((i) => !i.desktopOnly).map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
