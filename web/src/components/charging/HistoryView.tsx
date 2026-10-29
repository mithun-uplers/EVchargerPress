import Link from "next/link";
import type { ReactNode } from "react";
import { BookingStatusBadge } from "@/components/booking/BookingStatusBadge";
import { BoltIcon, CalendarIcon } from "@/components/nav/icons";
import type { BookingStatus } from "@/lib/booking-types";
import { formatDuration, type HistoryItem, type HistoryMetric, type HistorySummary, type HistoryView as View } from "@/lib/charging-stats";
import { formatLocal, formatMoney, formatTime } from "@/lib/format";
import { BarChart } from "./BarChart";

export type BookingBrief = {
  reference: string;
  stationName: string;
  start: string;
  end: string;
  timeZone: string;
  status: BookingStatus;
  evseLabel: string | null;
  estimatedTotalMinor: number;
  currency: string;
  vehicleLabel: string | null;
  vehicleId?: string | null;
};

export const SOURCE_BADGE: Record<HistoryItem["source"], { label: string; cls: string }> = {
  manual: { label: "Manual entry", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  operator_api: { label: "From operator", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  charger_ocpp: { label: "From charger", cls: "bg-energy-100 text-energy-800 dark:bg-energy-500/15 dark:text-energy-300" },
  booking_estimate: { label: "Estimate · no session", cls: "bg-charge-50 text-charge-600 ring-1 ring-inset ring-charge-200 dark:bg-charge-500/10 dark:text-charge-300" },
};

const money = (minor: number, currency: string) => formatMoney(minor, currency).replace(/\.00$/, "");
const kwh = (v: number) => `${Math.round(v * 10) / 10} kWh`;

function periodLabel(view: View, key: string, long = false) {
  if (view === "year") return key;
  return new Date(`${key}-01T00:00:00Z`).toLocaleString("en-IN", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" });
}

function Segmented({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-white/15 p-1 ring-1 ring-inset ring-white/20">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          aria-current={i.active ? "true" : undefined}
          scroll={false}
          className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition ${i.active ? "bg-white text-energy-800 shadow-sm" : "text-white/85 hover:text-white"}`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

function change(cur: number, prev: number | undefined) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return pct === 0 ? "same as previous" : `${pct > 0 ? "+" : ""}${pct}% vs previous`;
}

export function SessionCard({ item }: { item: HistoryItem }) {
  const est = item.kind === "estimate";
  const mins = item.end ? Math.round((Date.parse(item.end) - Date.parse(item.start)) / 60000) : null;
  const badge = SOURCE_BADGE[item.source];
  const body = (
    <div className="flex gap-3">
      <span aria-hidden="true" className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full ${est ? "bg-charge-50 text-charge-500" : "bg-energy-50 text-energy-700 dark:bg-energy-500/10 dark:text-energy-300"}`}>
        <BoltIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-white">{formatLocal(item.start, item.timeZone, { weekday: "short", day: "numeric", month: "short" })}</span>
            {" · "}
            {formatTime(item.start, item.timeZone)}
            {item.end ? `–${formatTime(item.end, item.timeZone)}` : ""}
          </p>
          <p className="shrink-0 text-right font-semibold tabular-nums">
            {item.costMinor !== null ? `${est ? "~" : ""}${formatMoney(item.costMinor, item.currency)}` : <span className="text-zinc-400">—</span>}
          </p>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <p className="truncate font-medium">{item.title}</p>
          <p className="shrink-0 text-sm tabular-nums text-zinc-500">{item.energyKwh !== null ? `${est ? "~" : ""}${kwh(item.energyKwh)}` : "— kWh"}</p>
        </div>
        {item.subtitle && <p className="truncate text-sm text-zinc-500">{item.subtitle}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {item.live && <span className="inline-flex items-center gap-1 rounded bg-charge-400 px-1.5 py-0.5 font-semibold text-zinc-900"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-zinc-900 motion-safe:animate-pulse" />Charging now</span>}
          <span className={`rounded px-1.5 py-0.5 font-medium ${badge.cls}`}>{badge.label}</span>
          {item.isSimulated && <span className="rounded bg-charge-50 px-1.5 py-0.5 font-medium text-charge-600 ring-1 ring-inset ring-charge-200">Simulated</span>}
          {mins !== null && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{est ? "Booked " : ""}{formatDuration(mins)}</span>}
          {item.vehicleLabel && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{item.vehicleLabel}</span>}
          {item.reference && <span className="font-mono text-zinc-400">{item.reference}</span>}
        </div>
      </div>
    </div>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 transition hover:ring-energy-400 dark:bg-zinc-900 dark:ring-zinc-800">
          {body}
        </Link>
      ) : (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">{body}</div>
      )}
    </li>
  );
}

export function UpcomingBookings({ bookings, title = "Upcoming bookings", empty }: { bookings: BookingBrief[]; title?: string; empty?: ReactNode }) {
  return (
    <section aria-labelledby="upcoming-h" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h2 id="upcoming-h" className="flex items-center gap-2 font-semibold"><CalendarIcon className="h-5 w-5 text-energy-600" />{title}</h2>
        <Link href="/bookings" className="text-sm font-medium text-energy-700 hover:underline dark:text-energy-400">All</Link>
      </div>
      {bookings.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-500">{empty ?? <>Nothing booked. <Link href="/" className="font-medium text-energy-700 hover:underline">Find a station</Link></>}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {bookings.map((b) => (
            <li key={b.reference}>
              <Link href={`/bookings/${b.reference}`} className="flex items-center gap-3 rounded-xl p-2 -mx-2 hover:bg-energy-50 dark:hover:bg-energy-500/10">
                <span className="grid w-12 shrink-0 place-items-center rounded-lg bg-energy-600 py-1.5 text-white">
                  <span className="text-[10px] uppercase leading-none tracking-wide">{formatLocal(b.start, b.timeZone, { month: "short" })}</span>
                  <span className="text-lg font-semibold leading-tight">{formatLocal(b.start, b.timeZone, { day: "numeric" })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.stationName}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {formatTime(b.start, b.timeZone)}–{formatTime(b.end, b.timeZone)}{b.evseLabel ? ` · ${b.evseLabel}` : ""}{b.vehicleLabel ? ` · ${b.vehicleLabel}` : ""}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <BookingStatusBadge status={b.status} />
                    <span className="text-xs tabular-nums text-zinc-500">~{money(b.estimatedTotalMinor, b.currency)} est.</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HistoryView({
  summary,
  previous,
  periods,
  basePath = "/history",
  upcoming,
  avgPriceMinor,
  addSession,
  banner,
}: {
  summary: HistorySummary;
  previous?: HistorySummary | null;
  periods: string[];
  basePath?: string;
  upcoming: BookingBrief[];
  avgPriceMinor: number | null;
  addSession?: ReactNode;
  banner?: ReactNode;
}) {
  const { view, metric, period, currency } = summary;
  const href = (o: Partial<{ view: View; period: string; metric: HistoryMetric }>) => {
    const v = o.view ?? view;
    const p = new URLSearchParams({ view: v, metric: o.metric ?? metric });
    if (o.period) p.set("period", o.period);
    else if (!o.view || o.view === view) p.set("period", period);
    return `${basePath}?${p}`;
  };
  const isCost = metric === "cost";
  const headline = isCost ? formatMoney(summary.actualCostMinor, currency) : kwh(summary.actualKwh);
  const secondary = isCost ? kwh(summary.actualKwh) : formatMoney(summary.actualCostMinor, currency);
  const estimateText = summary.estimates
    ? isCost
      ? `~${money(summary.estimateCostMinor, currency)}`
      : `~${kwh(summary.estimateKwh)}`
    : null;
  const delta = previous ? change(isCost ? summary.actualCostMinor : summary.actualKwh, isCost ? previous.actualCostMinor : previous.actualKwh) : null;
  const fmtBar = (v: number) => (isCost ? `₹${Math.round(v).toLocaleString("en-IN")}` : `${Math.round(v * 10) / 10}`);
  const avgSession = summary.sessions ? Math.round((summary.actualKwh / summary.sessions) * 10) / 10 : null;
  const peak = summary.bars.reduce((best, b, i) => (b.actual > (summary.bars[best]?.actual ?? 0) ? i : best), 0);

  // On phones show only the selected period and its neighbours (1 newer, 4 older); all fit on wider screens.
  const sel = periods.indexOf(period);
  const nearSelected = (p: string) => { const i = periods.indexOf(p); return i >= sel - 1 && i <= sel + 4; };

  const side = (
    <>
          <UpcomingBookings bookings={upcoming} />

          <section aria-labelledby="insights-h" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
            <h2 id="insights-h" className="font-semibold">Insights</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-energy-50 p-3 dark:bg-energy-500/10">
                <dt className="text-xs text-zinc-500">Avg. price paid</dt>
                <dd className="mt-1 font-semibold tabular-nums">{avgPriceMinor !== null ? `${formatMoney(avgPriceMinor, currency)}/kWh` : "—"}</dd>
              </div>
              <div className="rounded-xl bg-charge-50 p-3 dark:bg-charge-500/10">
                <dt className="text-xs text-zinc-500">Avg. per session</dt>
                <dd className="mt-1 font-semibold tabular-nums">{avgSession !== null ? kwh(avgSession) : "—"}</dd>
              </div>
              <div className="col-span-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <dt className="text-xs text-zinc-500">Busiest {view === "month" ? "day" : "month"}</dt>
                <dd className="mt-1 font-semibold">
                  {summary.bars[peak]?.actual
                    ? `${view === "month" ? `${summary.bars[peak].label} ${periodLabel(view, period)}` : summary.bars[peak].label} · ${fmtBar(summary.bars[peak].actual)}${isCost ? "" : " kWh"}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-zinc-500">From recorded sessions only. Average price uses sessions with both cost and kWh.</p>
          </section>

    </>
  );

  return (
    <div className="space-y-5">
      {banner}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Charging history</h1>
          <p className="mt-1 text-sm text-zinc-500">Recorded sessions, spending and trends. Estimates are marked “~”.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/analytics" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-medium shadow-sm ring-1 ring-inset ring-zinc-200 hover:bg-energy-50 dark:bg-zinc-900 dark:ring-zinc-700 dark:hover:bg-energy-500/15">Analytics</Link>
        {addSession && (
          <a href="#add-session" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-energy-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-energy-700">
            <BoltIcon className="h-4 w-4" /> Add session
          </a>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* Summary hero */}
          <section aria-label="Summary" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6">
            <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10">
              <path d="M115 10 45 115h50l-10 75 70-105h-50l10-75Z" fill="currentColor" />
            </svg>
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <Segmented
                label="Period length"
                items={[
                  { href: href({ view: "month" }), label: "Month", active: view === "month" },
                  { href: href({ view: "year" }), label: "Year", active: view === "year" },
                ]}
              />
              <Segmented
                label="Measure"
                items={[
                  { href: href({ metric: "cost" }), label: "Cost", active: isCost },
                  { href: href({ metric: "energy" }), label: "Energy", active: !isCost },
                ]}
              />
            </div>
            <p className="relative mt-5 text-sm text-white/80">{isCost ? "Spent" : "Charged"} in {periodLabel(view, period, true)}</p>
            <p className="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{headline}</p>
            <p className="relative mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/85">
              <span>{summary.sessions} session{summary.sessions === 1 ? "" : "s"}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{secondary}</span>
              {delta && (<><span aria-hidden="true">·</span><span>{delta}</span></>)}
            </p>
            {estimateText && (
              <p className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-charge-400/20 px-3 py-1 text-xs text-charge-100 ring-1 ring-inset ring-charge-300/40">
                + {estimateText} estimated from {summary.estimates} booking{summary.estimates === 1 ? "" : "s"} with no recorded session
              </p>
            )}
          </section>

          {/* Period tabs + chart */}
          <section aria-label="Trend" className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800">
            <nav aria-label={view === "month" ? "Month" : "Year"} className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
              {[...periods].reverse().map((p) => (
                <Link
                  key={p}
                  href={href({ period: p })}
                  scroll={false}
                  aria-current={p === period ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${nearSelected(p) ? "" : "max-sm:hidden "}${
                    p === period ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
                  }`}
                >
                  {periodLabel(view, p)}
                </Link>
              ))}
            </nav>
            <BarChart
              bars={summary.bars}
              format={fmtBar}
              label={`${isCost ? "Spending" : "Energy"} per ${view === "month" ? "day" : "month"}, ${periodLabel(view, period, true)}`}
              labelEvery={view === "month" ? 7 : 1}
              height={170}
            />
            <p className="mt-3 text-xs text-zinc-500">
              {isCost ? "₹ spent" : "kWh charged"} per {view === "month" ? "day" : "month"}, in each station’s local time.
            </p>
          </section>

          <div className="space-y-5 lg:hidden">{side}</div>

          {/* Sessions */}
          <section aria-labelledby="sessions-h" className="space-y-3">
            <h2 id="sessions-h" className="px-1 font-semibold">
              Sessions <span className="font-normal text-zinc-500">· {periodLabel(view, period, true)}</span>
            </h2>
            {summary.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-transparent">
                No charging recorded for this {view}. Chargers in our network don’t report sessions automatically yet — add one from your receipt.
              </div>
            ) : (
              <ul className="space-y-3">{summary.items.map((i) => <SessionCard key={i.id} item={i} />)}</ul>
            )}
          </section>
          {addSession && (
            <section id="add-session" aria-labelledby="add-h" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
              <h2 id="add-h" className="font-semibold">Add a session</h2>
              <p className="mb-4 mt-1 text-xs text-zinc-500">Saved as a manual entry and always labelled that way.</p>
              {addSession}
            </section>
          )}
        </div>

        <aside className="hidden min-w-0 space-y-5 lg:block">
          {side}
        </aside>
      </div>
    </div>
  );
}
