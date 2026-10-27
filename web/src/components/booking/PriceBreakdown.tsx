import type { PriceSnapshot } from "@/lib/booking-types";
import { formatMoney } from "@/lib/format";

/** Transparent breakdown from the server-side price snapshot. Estimates are labelled. */
export function PriceBreakdown({ snap }: { snap: PriceSnapshot }) {
  const c = snap.currency;
  const taxPct = snap.tariff.tax_rate_bp / 100;
  const res = snap.lines.filter((l) => l.payable === "reservation");
  const session = snap.lines.filter((l) => l.payable === "at_session");
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-medium">Reservation</h3>
        <dl className="mt-2 space-y-1">
          {res.length === 0 && <Row label="Reservation fee" value={formatMoney(0, c)} />}
          {res.map((l) => (
            <Row key={l.type} label={l.label} value={formatMoney(l.amount_minor, c)} />
          ))}
          {snap.reservation.tax_minor > 0 && (
            <Row
              label={`${snap.tariff.tax_mode === "inclusive" ? "Includes" : "Plus"} tax (${taxPct}%)`}
              value={formatMoney(snap.reservation.tax_minor, c)}
              quiet
            />
          )}
          <Row label="Reservation total" value={formatMoney(snap.reservation.total_minor, c)} strong />
        </dl>
      </div>
      <div>
        <h3 className="font-medium">
          Charging <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Estimate</span>
        </h3>
        <dl className="mt-2 space-y-1">
          {session.length === 0 && <Row label="No charging fees listed" value="—" quiet />}
          {session.map((l) => (
            <Row
              key={l.type}
              label={`${l.label}${l.unit !== "each" ? ` · ${Number(l.quantity)} ${l.unit} × ${formatMoney(l.unit_price_minor, c)}` : ""}`}
              value={formatMoney(l.amount_minor, c)}
            />
          ))}
          {snap.estimated_charging.tax_minor > 0 && (
            <Row
              label={`${snap.tariff.tax_mode === "inclusive" ? "Includes" : "Plus"} tax (${taxPct}%)`}
              value={formatMoney(snap.estimated_charging.tax_minor, c)}
              quiet
            />
          )}
          <Row label="Estimated charging cost" value={formatMoney(snap.estimated_charging.total_minor, c)} strong />
        </dl>
        <p className="mt-2 text-xs text-zinc-500">
          Assumes the charger delivers about {Math.round(snap.assumptions.assumed_power_share * 100)}% of its{" "}
          {snap.assumptions.evse_max_power_kw ?? "?"} kW rating ({snap.assumptions.estimated_kwh} kWh). Your real cost depends on your vehicle and
          battery level and is settled at the station.
          {snap.idle_fee_per_min_minor ? ` Idle fee after charging: ${formatMoney(snap.idle_fee_per_min_minor, c)}/min.` : ""}
        </p>
      </div>
      <div className="flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="font-medium">Estimated total</span>
        <span className="text-lg font-semibold">{formatMoney(snap.estimated_grand_total_minor, c)}</span>
      </div>
      <p className="text-xs text-zinc-500">
        Tariff “{snap.tariff.name}”{snap.tariff.source === "demo" ? " (demo prices)" : ""}. No online payment yet: pay at the station.
      </p>
    </div>
  );
}

function Row({ label, value, strong, quiet }: { label: string; value: string; strong?: boolean; quiet?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${quiet ? "text-zinc-500" : ""} ${strong ? "font-medium" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
