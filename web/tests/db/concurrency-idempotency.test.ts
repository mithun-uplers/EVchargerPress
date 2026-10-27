import { afterAll, describe, expect, it } from "vitest";
import { book, createStation, createUser, db, errorCode, expectOk, liveBookings, newKey } from "./helpers";

const NOW = "2027-03-01T00:00:00Z";
const START = "2027-03-02T04:30:00Z"; // 10:00 IST

afterAll(() => db.end());

describe("simultaneous conflicting requests", () => {
  it("lets exactly one of 20 parallel requests for the same slot win", async () => {
    const { evseId } = await createStation();
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser()));
    const results = await Promise.all(users.map((u) => book(u, NOW, evseId, START)));
    const wins = results.filter((r) => r.ok);
    const codes = results.filter((r) => !r.ok).map((r) => errorCode(r));
    expect(wins).toHaveLength(1);
    expect(codes).toHaveLength(19);
    expect(new Set(codes)).toEqual(new Set(["EVB07"]));
    expect(await liveBookings(evseId)).toHaveLength(1);
  });

  it("never stores overlapping bookings (and never deadlocks) when parallel requests partly overlap", async () => {
    // Repeated because interleavings vary between runs; a deadlock (40P01) showed up ~1 run in 3 before the per-EVSE lock.
    for (let round = 0; round < 5; round++) {
      const { evseId } = await createStation({ rules: { buffer_min: 10 } });
      const users = await Promise.all(Array.from({ length: 16 }, () => createUser()));
      // Starts every 15 min from 10:00 IST, all 60 min long → heavy partial overlap.
      const starts = users.map((_, i) => new Date(Date.parse(START) + i * 15 * 60_000).toISOString());
      const results = await Promise.all(users.map((u, i) => book(u, NOW, evseId, starts[i])));
      expect(results.filter((r) => !r.ok).map(errorCode).filter((c) => c !== "EVB07")).toEqual([]);
      await expectNoOverlaps(evseId);
    }
  });

  async function expectNoOverlaps(evseId: string) {
    const live = await liveBookings(evseId);
    expect(live.length).toBeGreaterThanOrEqual(1);
    const { rows } = await db.query(
      `select count(*)::int as overlaps from public.bookings a join public.bookings b
         on a.evse_id = b.evse_id and a.id < b.id and a.buffered_period && b.buffered_period
       where a.evse_id = $1 and a.status in ('pending','confirmed','checked_in') and b.status in ('pending','confirmed','checked_in')`,
      [evseId],
    );
    expect(rows[0].overlaps).toBe(0);
  }

  it("enforces the turnover buffer between back-to-back bookings", async () => {
    const { evseId } = await createStation({ rules: { buffer_min: 15 } });
    const [a, b] = [await createUser(), await createUser()];
    expectOk(await book(a, NOW, evseId, START)); // 10:00–11:00, blocked until 11:15
    expect(errorCode(await book(b, NOW, evseId, "2027-03-02T05:30:00Z"))).toBe("EVB07"); // 11:00
    expectOk(await book(b, NOW, evseId, "2027-03-02T05:45:00Z")); // 11:15
    // A booking that would end inside the next one's start + buffer is also blocked
    expect(errorCode(await book(b, NOW, evseId, "2027-03-02T03:30:00Z"))).toBe("EVB07"); // 09:00–10:00 + 15 min
  });

  it("books different charging points at the same time independently", async () => {
    const { evseIds } = await createStation({ evses: [{ label: "DC-1" }, { label: "DC-2" }] });
    const [a, b] = [await createUser(), await createUser()];
    const [r1, r2] = await Promise.all([book(a, NOW, evseIds[0], START), book(b, NOW, evseIds[1], START)]);
    expectOk(r1);
    expectOk(r2);
  });

  it("cannot exceed one user's active-booking limit with parallel requests", async () => {
    const { evseIds } = await createStation({
      rules: { max_active_per_user: 2 },
      evses: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }],
    });
    const user = await createUser();
    const results = await Promise.all(evseIds.map((e) => book(user, NOW, e, START)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok).map(errorCode)).toEqual(["EVB09", "EVB09", "EVB09"]);
  });
});

describe("duplicate requests (idempotency)", () => {
  it("returns the same booking when a request is retried with the same key", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const key = newKey();
    const first = expectOk(await book(user, NOW, evseId, START, 60, key));
    const second = expectOk(await book(user, NOW, evseId, START, 60, key));
    expect(second.id).toBe(first.id);
    expect(second.reference).toBe(first.reference);
    const { rows } = await db.query("select count(*)::int n from public.bookings where user_id = $1", [user]);
    expect(rows[0].n).toBe(1);
    const ev = await db.query("select count(*)::int n from public.booking_events where booking_id = $1", [first.id]);
    expect(ev.rows[0].n).toBe(1);
  });

  it("returns one booking to 10 simultaneous duplicates", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const key = newKey();
    const results = await Promise.all(Array.from({ length: 10 }, () => book(user, NOW, evseId, START, 60, key)));
    const ids = new Set(results.map((r) => expectOk(r).id));
    expect(ids.size).toBe(1);
    const { rows } = await db.query("select count(*)::int n from public.bookings where user_id = $1", [user]);
    expect(rows[0].n).toBe(1);
  });

  it("rejects reuse of a key for a different request", async () => {
    const { evseId } = await createStation();
    const user = await createUser();
    const key = newKey();
    expectOk(await book(user, NOW, evseId, START, 60, key));
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T06:30:00Z", 60, key))).toBe("EVB08");
    expect(errorCode(await book(user, NOW, evseId, START, 90, key))).toBe("EVB08");
  });

  it("scopes keys per user", async () => {
    const { evseId } = await createStation();
    const [a, b] = [await createUser(), await createUser()];
    const key = newKey();
    const ra = expectOk(await book(a, NOW, evseId, START, 60, key));
    const rb = expectOk(await book(b, NOW, evseId, "2027-03-02T06:30:00Z", 60, key));
    expect(ra.id).not.toBe(rb.id);
  });

  it("frees a key when its request failed, so the client can retry", async () => {
    const { evseId } = await createStation();
    const [a, b] = [await createUser(), await createUser()];
    expectOk(await book(a, NOW, evseId, START));
    const key = newKey();
    expect(errorCode(await book(b, NOW, evseId, START, 60, key))).toBe("EVB07");
    expectOk(await book(b, NOW, evseId, "2027-03-02T06:30:00Z", 60, key));
  });

  it("lets a key be reused once it has expired (24 h)", async () => {
    const { evseId } = await createStation({ rules: { max_advance_days: 14 } });
    const user = await createUser();
    const key = newKey();
    expectOk(await book(user, NOW, evseId, START, 60, key));
    const later = "2027-03-02T01:00:00Z"; // 25 h later
    const again = expectOk(await book(user, later, evseId, "2027-03-03T04:30:00Z", 60, key));
    expect(again.period).toContain("2027-03-03");
  });
});
