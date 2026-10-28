"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/stations", label: "Stations" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/sessions", label: "Charging sessions" },
  { href: "/admin/chargers", label: "Live chargers" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit log" },
];

/** Section tabs for the admin panel; scrolls sideways on phones. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {ADMIN_SECTIONS.map((s) => {
          const active = s.exact ? path === s.href : path.startsWith(s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition ${
                  active
                    ? "border-energy-600 text-energy-800 dark:border-energy-400 dark:text-energy-300"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
