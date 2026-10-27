export type BookingStatus = "pending" | "confirmed" | "checked_in" | "completed" | "cancelled" | "expired" | "no_show";
export const BOOKING_TABS = ["upcoming", "completed", "cancelled", "expired", "no_show"] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

export type Slot = { evse_id: string; evse_label: string; max_power_kw: number | null; slot_start: string; slot_end: string };

export type PriceLine = {
  type: string;
  label: string;
  unit_price_minor: number;
  quantity: number;
  unit: string;
  amount_minor: number;
  is_estimate: boolean;
  payable: "reservation" | "at_session";
};

export type PriceSnapshot = {
  version: number;
  quoted_at: string;
  currency: string;
  duration_min: number;
  tariff: { id: string; name: string; source: string; tax_mode: "inclusive" | "exclusive"; tax_rate_bp: number };
  assumptions: {
    evse_max_power_kw: number | null;
    assumed_power_share: number;
    estimated_kwh: number;
    effective_power_kw?: number;
    battery_capacity_kwh?: number | null;
    power_basis?: string;
  };
  vehicle?: { id: string; label: string };
  lines: PriceLine[];
  reservation: { net_minor: number; tax_minor: number; total_minor: number };
  estimated_charging: { net_minor: number; tax_minor: number; total_minor: number };
  estimated_grand_total_minor: number;
  idle_fee_per_min_minor: number | null;
  payment: string;
  policy?: {
    hold_minutes: number;
    buffer_min: number;
    free_cancel_until_min: number;
    check_in_early_min: number;
    no_show_grace_min: number;
    time_zone: string;
  };
};

export type BookingRow = {
  id: string;
  reference: string;
  status: BookingStatus;
  period: string;
  hold_expires_at: string | null;
  price_snapshot: PriceSnapshot;
  currency: string;
  reservation_fee_minor: number;
  estimated_total_minor: number;
  cancellation_fee_minor: number | null;
  confirmed_at: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  station: { id: string; name: string; address: string | null; city: string | null; city_is_approx: boolean; time_zone: string } | null;
  evse: { id: string; label: string; max_power_kw: number | null } | null;
  vehicle: { id: string; make: string; model: string; nickname: string | null } | null;
};

/** Parses a Postgres tstzrange like ["2027-03-02 04:30:00+00","2027-03-02 05:30:00+00"). */
export function parseRange(range: string): { start: Date; end: Date } {
  const m = range.match(/^[[(]"?([^",]+)"?,"?([^")]+)"?[\])]$/);
  if (!m) throw new Error(`Unrecognised range: ${range}`);
  const fix = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return { start: fix(m[1]), end: fix(m[2]) };
}

/** What the customer sees: a lapsed hold is shown as expired even before the sweeper runs. */
export function effectiveStatus(b: Pick<BookingRow, "status" | "hold_expires_at">, now = new Date()): BookingStatus {
  if (b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at) <= now) return "expired";
  return b.status;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Held — confirm to keep",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No-show",
};
