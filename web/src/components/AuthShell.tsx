import Link from "next/link";
import type { ReactNode } from "react";

const POINTS = [
  "Find chargers that fit your car",
  "Book a slot and see the full price first",
  "Live charging status where chargers are connected",
  "Track spending, energy and trips",
];

/** Sign-in, sign-up and password screens: brand panel on desktop, compact header on phones. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/70 md:my-6 md:grid-cols-2 dark:bg-zinc-900 dark:ring-zinc-800">
      <aside className="relative overflow-hidden bg-gradient-to-br from-energy-800 via-energy-700 to-energy-900 p-6 text-white md:p-10">
        <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-16 -right-12 h-72 w-72 text-white/10">
          <path d="M115 10 45 115h50l-10 75 70-105h-50l10-75Z" fill="currentColor" />
        </svg>
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-charge-400/20 blur-3xl" />
        <Link href="/" className="relative inline-flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">⚡</span>
          EVChargePress
        </Link>
        <p className="relative mt-6 text-2xl font-semibold leading-tight tracking-tight md:mt-16 md:text-3xl">Charge with confidence.</p>
        <ul className="relative mt-5 hidden space-y-3 text-sm text-white/85 md:block">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-charge-400 text-[11px] font-bold text-zinc-900">✓</span>
              {p}
            </li>
          ))}
        </ul>
      </aside>
      <section className="p-6 md:p-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-zinc-500">{footer}</div>}
      </section>
    </div>
  );
}
