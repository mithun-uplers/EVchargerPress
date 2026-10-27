import { afterAll, describe, expect, it } from "vitest";
import { EVERY_DAY, asUser, book, createStation, createUser, db, errorCode, expectOk } from "./helpers";

const NOW = "2027-03-01T00:00:00Z"; // Mon 05:30 IST
const START = "2027-03-02T04:30:00Z"; // Tue 10:00 IST

afterAll(() => db.end());

describe("invalid slots are rejected on the server", () => {
  it("rejects durations outside the configured range or step", async () => {
    const { evseId } = await createStation({ rules: { min_duration_min: 30, max_duration_min: 120, slot_step_min: 15 } });
    const user = await createUser();
    expect(errorCode(await book(user, NOW, evseId, START, 15))).toBe("EVB04");
    expect(errorCode(await book(user, NOW, evseId, START, 135))).toBe("EVB04");
    expect(errorCode(await book(user, NOW, evseId, START, 50))).toBe("EVB04");
    expectOk(await book(user, NOW, evseId, START, 120));
  });

  it("rejects starts that are misaligned, in the past, inside the lead time or too far ahead", async () => {
    const { evseId } = await createStation({ rules: { lead_time_min: 30, max_advance_days: 7 } });
    const user = await createUser();
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T04:37:00Z"))).toBe("EVB05"); // 10:07
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T04:30:30Z"))).toBe("EVB05"); // seconds
    expect(errorCode(await book(user, NOW, evseId, "2027-02-28T04:30:00Z"))).toBe("EVB05"); // past
    expect(errorCode(await book(user, NOW, evseId, "2027-03-01T00:15:00Z"))).toBe("EVB05"); // within 30 min lead
    expect(errorCode(await book(user, NOW, evseId, "2027-03-09T04:30:00Z"))).toBe("EVB05"); // > 7 days
  });

  it("rejects windows that touch closed hours", async () => {
    // Open 09:00–18:00 Monday–Saturday; closed Sunday.
    const { evseId } = await createStation({ hours: [1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, opens: "09:00", closes: "18:00" })) });
    const user = await createUser();
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T03:15:00Z"))).toBe("EVB06"); // 08:45 opens before 09:00
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T12:00:00Z"))).toBe("EVB06"); // 17:30–18:30
    expect(errorCode(await book(user, NOW, evseId, "2027-03-07T04:30:00Z"))).toBe("EVB06"); // Sunday
    expectOk(await book(user, NOW, evseId, "2027-03-02T11:30:00Z")); // 17:00–18:00 exactly fits
  });

  it("rejects stations with no opening hours, non-bookable or unknown charging points", async () => {
    const closed = await createStation({ hours: [] });
    const nonBookable = await createStation({ evses: [{ label: "AC-1", is_bookable: false }] });
    const noRules = await createStation({ rules: null });
    const user = await createUser();
    expect(errorCode(await book(user, NOW, closed.evseId, START))).toBe("EVB06");
    expect(errorCode(await book(user, NOW, nonBookable.evseId, START))).toBe("EVB03");
    expect(errorCode(await book(user, NOW, noRules.evseId, START))).toBe("EVB03");
    expect(errorCode(await book(user, NOW, crypto.randomUUID(), START))).toBe("EVB02");
  });

  it("requires a signed-in user and a well-formed idempotency key", async () => {
    const { evseId } = await createStation();
    expect(errorCode(await book(null as unknown as string, NOW, evseId, START))).toBe("EVB01");
    // anon role has no execute permission at all
    const anon = await asUser(null, NOW, "select * from public.create_booking($1,$2,$3,$4)", [evseId, START, 60, crypto.randomUUID()], "anon");
    expect(errorCode(anon)).toBe("42501");
    const user = await createUser();
    expect(errorCode(await book(user, NOW, evseId, START, 60, "short"))).toBe("EVB15");
    expect(errorCode(await book(user, NOW, evseId, START, 60, "has spaces in it"))).toBe("EVB15");
  });

  it("limits how many upcoming bookings one user can hold", async () => {
    const { evseId } = await createStation({ rules: { max_active_per_user: 2 } });
    const user = await createUser();
    expectOk(await book(user, NOW, evseId, "2027-03-02T04:30:00Z"));
    expectOk(await book(user, NOW, evseId, "2027-03-02T06:30:00Z"));
    expect(errorCode(await book(user, NOW, evseId, "2027-03-02T08:30:00Z"))).toBe("EVB09");
  });

  it("does not let customers write bookings directly", async () => {
    const { evseId, stationId } = await createStation({ hours: EVERY_DAY("00:00", "24:00") });
    const user = await createUser();
    const insert = await asUser(user, NOW,
      `insert into public.bookings (user_id, station_id, evse_id, period, buffered_period, hold_expires_at, price_snapshot, currency)
       values ($1, $2, $3, tstzrange($4::timestamptz, $4::timestamptz + interval '1 hour'), tstzrange($4::timestamptz, $4::timestamptz + interval '1 hour'), now(), '{}', 'INR')`,
      [user, stationId, evseId, START]);
    expect(errorCode(insert)).toBe("42501"); // RLS: no insert policy
    const b = expectOk(await book(user, NOW, evseId, START));
    const upd = await asUser<{ id: string }>(user, NOW, "update public.bookings set status = 'confirmed' where id = $1 returning id", [b.id]);
    expect(upd.ok && upd.value).toEqual([]); // RLS: no update policy → 0 rows
  });
});
