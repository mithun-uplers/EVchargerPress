import Link from "next/link";
import type { ReactNode } from "react";
import { ui } from "@/lib/ui";

type SP = Record<string, string | string[] | undefined>;
export const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
export const pageOf = (sp: SP) => Math.max(1, Math.floor(Number(one(sp, "page") ?? 1)) || 1);

export function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Result message passed back by an admin action (?ok= / ?error=). */
export function Flash({ sp }: { sp: SP }) {
  const ok = one(sp, "ok");
  const error = one(sp, "error");
  if (error) return <p role="alert" className={ui.error}>{error}</p>;
  if (ok) return <p role="status" className={ui.ok}>{ok}</p>;
  return null;
}

export function Pager({ page, size, total, href }: { page: number; size: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return <p className="text-xs text-zinc-500">{total} {total === 1 ? "result" : "results"}</p>;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-zinc-500">
        Page {page} of {pages} · {total} results
      </span>
      <span className="flex gap-2">
        {page > 1 && <Link className={ui.btnLight} href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className={ui.btnLight} href={href(page + 1)}>Next</Link>}
      </span>
    </nav>
  );
}

const TONES = {
  green: "bg-energy-50 text-energy-800 ring-1 ring-inset ring-energy-200 dark:bg-energy-500/10 dark:text-energy-300 dark:ring-energy-500/30",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  zinc: "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
} as const;
export type Tone = keyof typeof TONES;
export function Pill({ tone = "zinc", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap ${ui.pill} ${TONES[tone]}`}>{children}</span>;
}

export const BOOKING_TONE: Record<string, Tone> = {
  pending: "amber", confirmed: "green", checked_in: "blue", completed: "zinc", cancelled: "red", expired: "zinc", no_show: "red",
};

export function Stat({ label, value, note, href }: { label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-zinc-500">{note}</dd>}
    </>
  );
  return href ? (
    <Link href={href} className={`${ui.card} block transition hover:ring-energy-300`}>{body}</Link>
  ) : (
    <div className={ui.card}>{body}</div>
  );
}

/** Horizontal-scrolling table container so wide tables never stretch the page on phones. */
export function TableCard({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className={`${ui.cardFlat} overflow-x-auto`}>
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const th = "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500";
export const td = "px-3 py-2.5 align-top";

export function Empty({ children }: { children: ReactNode }) {
  return <p className={`${ui.card} text-center text-sm text-zinc-500`}>{children}</p>;
}

/** Filter chips that are plain links (work without JavaScript). */
export function Chips({ items, current }: { items: { value: string | null; label: string; href: string }[]; current: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          aria-current={i.value === current ? "true" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium ring-1 ring-inset transition ${
            i.value === current
              ? "bg-energy-600 text-white ring-energy-600"
              : "bg-white text-zinc-700 ring-zinc-200 hover:bg-energy-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-energy-500/15"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
