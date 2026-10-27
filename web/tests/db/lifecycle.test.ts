import { afterAll, describe, expect, it } from "vitest";
import {
  asAdmin, asUser, book, cancel, checkIn, confirm, createStation, createUser, db, errorCode, events, expectOk,
} from "./helpers";

const NOW = "2027-03-01T00:00:00Z";
const START = "2027-03-02T04:30:00Z"; // Tue 10:00 IST
const at = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

afterAll(() => db.end());

describe("holds and expiry", () => {
  it("creates a timed hold that can be confirmed before it lapses", async () => {
    const { evseId } = await createStation({ rules: { hold_minutes: 10 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(b.status).toBe("pending");
    expect(new Date(b.hold_expires_at).toISOString()).toBe(at(NOW, 10));
    const c = expectOk(await confirm(user, at(NOW, 9), b.id));
    expect(c.status).toBe("confirmed");
    expect(expectOk(await confirm(user, at(NOW, 9), b.id)).status).toBe("confirmed"); // repeat is a no-op
  });

  it("refuses to confirm an expired hold", async () => {
    const { evseId } = await createStation({ rules: { hold_minutes: 10 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(errorCode(await confirm(user, at(NOW, 10), b.id))).toBe("EVB12");
  });

  it("releases the slot once a hold lapses, even before the sweeper runs", async () => {
    const { evseId } = await createStation({ rules: { hold_minutes: 10 } });
    const [a, b] = [await createUser(), await createUser()];
    const held = expectOk(await book(a, NOW, evseId, START));
    expect(errorCode(await book(b, at(NOW, 5), evseId, START))).toBe("EVB07"); // hold still live
    const taken = expectOk(await book(b, at(NOW, 11), evseId, START)); // hold lapsed
    expect(taken.status).toBe("pending");
    const { rows } = await db.query("select status from public.bookings where id = $1", [held.id]);
    expect(rows[0].status).toBe("expired");
    expect((await events(held.id)).at(-1)).toMatchObject({ from_status: "pending", to_status: "expired", reason: "Hold expired" });
  });

  it("the sweeper expires lapsed holds", async () => {
    const { evseId } = await createStation({ rules: { hold_minutes: 10 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    const r = expectOk(await asAdmin<{ sweep_bookings: Record<string, number> }>(at(NOW, 30), "select app.sweep_bookings()"));
    expect(r.sweep_bookings.expired).toBeGreaterThanOrEqual(1);
    const { rows } = await db.query("select status from public.bookings where id = $1", [b.id]);
    expect(rows[0].status).toBe("expired");
  });
});

describe("cancellation rules", () => {
  async function confirmed(rules = {}) {
    const { evseId } = await createStation({ rules: { free_cancel_until_min: 60, ...rules } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expectOk(await confirm(user, NOW, b.id));
    return { evseId, user, b };
  }

  it("cancels a hold for free and reopens the slot", async () => {
    const { evseId } = await createStation();
    const [a, b] = [await createUser(), await createUser()];
    const held = expectOk(await book(a, NOW, evseId, START));
    const c = expectOk(await cancel(a, NOW, held.id, "Plans changed"));
    expect(c).toMatchObject({ status: "cancelled", cancellation_fee_minor: 0 });
    expectOk(await book(b, NOW, evseId, START));
  });

  it("is free until the cut-off before the start", async () => {
    const { user, b } = await confirmed();
    const c = expectOk(await cancel(user, at(START, -61), b.id));
    expect(c.cancellation_fee_minor).toBe(0);
  });

  it("charges the reservation fee for a late cancellation", async () => {
    const { user, b } = await confirmed();
    const c = expectOk(await cancel(user, at(START, -30), b.id));
    expect(c.cancellation_fee_minor).toBe(5900); // ₹50 + 18% tax, from the snapshot
  });

  it("cannot cancel after the booking has started", async () => {
    const { user, b } = await confirmed();
    expect(errorCode(await cancel(user, at(START, 1), b.id))).toBe("EVB13");
  });

  it("treats a repeated cancel as a no-op", async () => {
    const { user, b } = await confirmed();
    expectOk(await cancel(user, at(START, -120), b.id));
    expectOk(await cancel(user, at(START, -10), b.id));
    const ev = await events(b.id);
    expect(ev.filter((e) => e.to_status === "cancelled")).toHaveLength(1);
    const { rows } = await db.query("select cancellation_fee_minor from public.bookings where id = $1", [b.id]);
    expect(rows[0].cancellation_fee_minor).toBe(0); // first cancel's fee stands
  });

  it("uses the policy frozen at booking time, not today's rules", async () => {
    const { user, b } = await confirmed({ free_cancel_until_min: 60 });
    const { rows } = await db.query("select station_id from public.bookings where id = $1", [b.id]);
    await db.query("update public.booking_rules set free_cancel_until_min = 0 where station_id = $1", [rows[0].station_id]);
    expect(expectOk(await cancel(user, at(START, -30), b.id)).cancellation_fee_minor).toBe(5900);
  });

  it("hides and protects other users' bookings", async () => {
    const { b } = await confirmed();
    const stranger = await createUser();
    expect(errorCode(await cancel(stranger, NOW, b.id))).toBe("EVB02");
    const seen = await asUser(stranger, NOW, "select id from public.bookings where id = $1", [b.id]);
    expect(seen.ok && seen.value).toEqual([]);
    const ev = await asUser(stranger, NOW, "select id from public.booking_events where booking_id = $1", [b.id]);
    expect(ev.ok && ev.value).toEqual([]);
  });

  it("cannot cancel an expired hold", async () => {
    const { evseId } = await createStation({ rules: { hold_minutes: 10 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expectOk(await asAdmin(at(NOW, 20), "select app.sweep_bookings()"));
    expect(errorCode(await cancel(user, at(NOW, 20), b.id))).toBe("EVB13");
  });
});

describe("status transitions and immutability", () => {
  it("runs pending → confirmed → checked_in → completed with an audit trail", async () => {
    const { evseId } = await createStation({ rules: { check_in_early_min: 15, no_show_grace_min: 15 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expectOk(await confirm(user, NOW, b.id));
    expect(errorCode(await checkIn(user, at(START, -16), b.id))).toBe("EVB16"); // too early
    expect(expectOk(await checkIn(user, at(START, -5), b.id)).status).toBe("checked_in");
    expectOk(await asAdmin(at(START, 61), "select app.sweep_bookings()"));
    const { rows } = await db.query("select status from public.bookings where id = $1", [b.id]);
    expect(rows[0].status).toBe("completed");
    expect((await events(b.id)).map((e) => e.to_status)).toEqual(["pending", "confirmed", "checked_in", "completed"]);
  });

  it("marks a confirmed booking as no-show after the grace period", async () => {
    const { evseId } = await createStation({ rules: { no_show_grace_min: 15 } });
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expectOk(await confirm(user, NOW, b.id));
    expectOk(await asAdmin(at(START, 10), "select app.sweep_bookings()"));
    expect((await db.query("select status from public.bookings where id = $1", [b.id])).rows[0].status).toBe("confirmed");
    expectOk(await asAdmin(at(START, 16), "select app.sweep_bookings()"));
    expect((await db.query("select status from public.bookings where id = $1", [b.id])).rows[0].status).toBe("no_show");
    expect(errorCode(await checkIn(user, at(START, 20), b.id))).toBe("EVB11");
  });

  it("rejects illegal transitions even for direct database updates", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(errorCode(await asAdmin(NOW, "update public.bookings set status = 'completed' where id = $1", [b.id]))).toBe("EVB11");
    expectOk(await cancel(user, NOW, b.id));
    expect(errorCode(await asAdmin(NOW, "update public.bookings set status = 'confirmed' where id = $1", [b.id]))).toBe("EVB11");
  });

  it("keeps the booking window and price snapshot immutable", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const b = expectOk(await book(user, NOW, evseId, START));
    expect(errorCode(await asAdmin(NOW, "update public.bookings set price_snapshot = '{}' where id = $1", [b.id]))).toBe("EVB10");
    expect(errorCode(await asAdmin(NOW, "update public.bookings set reservation_fee_minor = 0 where id = $1", [b.id]))).toBe("EVB10");
    expect(errorCode(await asAdmin(NOW,
      "update public.bookings set period = tstzrange(lower(period) + interval '1 hour', upper(period) + interval '1 hour') where id = $1", [b.id]))).toBe("EVB10");
    expect(errorCode(await asAdmin(NOW, "update public.booking_events set reason = 'x' where booking_id = $1", [b.id]))).toBe("EVB10");
  });
});
