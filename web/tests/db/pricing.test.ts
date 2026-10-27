import { afterAll, describe, expect, it } from "vitest";
import { asUser, book, createStation, createUser, db, errorCode, expectOk } from "./helpers";

const NOW = "2027-03-01T00:00:00Z";
const START = "2027-03-02T04:30:00Z"; // 10:00 IST

afterAll(() => db.end());

async function quote(evseId: string, minutes = 60, start = START) {
  const r = await asUser<{ quote_booking: Record<string, any> }>(null, NOW, "select public.quote_booking($1,$2,$3)", [ // eslint-disable-line @typescript-eslint/no-explicit-any
    evseId,
    start,
    minutes,
  ], "anon");
  return r;
}

describe("server-side price calculation", () => {
  it("prices energy + reservation fee with 18% tax added (exclusive)", async () => {
    const { evseId } = await createStation(); // 60 kW, ₹18/kWh, ₹50 reservation, 18% exclusive
    const q = expectOk(await quote(evseId)).quote_booking;
    // 60 kW × 1 h × 80% assumed draw = 48 kWh × 1800 paise = 86 400
    expect(q.assumptions.estimated_kwh).toBe(48);
    expect(q.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "energy_kwh", amount_minor: 86400, is_estimate: true, payable: "at_session" }),
        expect.objectContaining({ type: "reservation_fixed", amount_minor: 5000, is_estimate: false, payable: "reservation" }),
      ]),
    );
    expect(q.reservation).toEqual({ net_minor: 5000, tax_minor: 900, total_minor: 5900 });
    expect(q.estimated_charging).toEqual({ net_minor: 86400, tax_minor: 15552, total_minor: 101952 });
    expect(q.estimated_grand_total_minor).toBe(107852);
    expect(q.currency).toBe("INR");
    expect(q.payment).toBe("pay_at_station");
  });

  it("extracts tax from tax-inclusive prices without adding it", async () => {
    const { evseId } = await createStation({
      tariff: { tax_mode: "inclusive", tax_rate_bp: 1800, components: [{ type: "reservation_fixed", price_minor: 5000 }] },
    });
    const q = expectOk(await quote(evseId)).quote_booking;
    // 5000 × 1800 / 11800 = 762.7 → 763
    expect(q.reservation).toEqual({ net_minor: 5000, tax_minor: 763, total_minor: 5000 });
  });

  it("supports per-minute and fixed session fees, and reports idle fees without adding them", async () => {
    const { evseId } = await createStation({
      tariff: {
        tax_rate_bp: 0,
        components: [
          { type: "time_min", price_minor: 200 },
          { type: "session_fixed", price_minor: 3000 },
          { type: "idle_min", price_minor: 500 },
        ],
      },
    });
    const q = expectOk(await quote(evseId, 45)).quote_booking;
    expect(q.lines.find((l: { type: string }) => l.type === "time_min").amount_minor).toBe(9000);
    expect(q.estimated_charging.total_minor).toBe(12000);
    expect(q.reservation.total_minor).toBe(0);
    expect(q.idle_fee_per_min_minor).toBe(500);
  });

  it("refuses to quote or book a charging point without a tariff", async () => {
    const { evseId } = await createStation({ tariff: null });
    expect(errorCode(await quote(evseId))).toBe("EVB14");
    const user = await createUser();
    expect(errorCode(await book(user, NOW, evseId, START))).toBe("EVB14");
  });

  it("freezes the quote into the booking as a snapshot", async () => {
    const { evseId, stationId } = await createStation();
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(b.reservation_fee_minor).toBe(5900);
    expect(b.estimated_total_minor).toBe(107852);
    expect(b.price_snapshot.policy).toMatchObject({ hold_minutes: 10, free_cancel_until_min: 60, time_zone: "Asia/Kolkata" });

    // A later price change does not touch the existing booking.
    await db.query(
      "update public.tariff_components set price_minor = 99999 where tariff_id = (select id from public.tariffs where station_id = $1)",
      [stationId],
    );
    const { rows } = await db.query("select price_snapshot, reservation_fee_minor from public.bookings where id = $1", [b.id]);
    expect(rows[0].reservation_fee_minor).toBe(5900);
    expect(rows[0].price_snapshot.reservation.total_minor).toBe(5900);
  });
});
