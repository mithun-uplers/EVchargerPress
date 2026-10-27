import { afterAll, describe, expect, it } from "vitest";
import { EVERY_DAY, asUser, book, createStation, createUser, db, errorCode, expectOk } from "./helpers";

afterAll(() => db.end());

type Slot = { evse_id: string; slot_start: Date; slot_end: Date };
async function slots(stationId: string, date: string, minutes: number, now: string) {
  const r = await asUser<Slot>(null, now, "select * from public.get_availability($1,$2,$3)", [stationId, date, minutes], "anon");
  if (!r.ok) throw new Error(r.error.code);
  return r.value.map((s) => s.slot_start.toISOString());
}

describe("slot availability", () => {
  it("offers aligned starts that fit fully inside opening hours (Asia/Kolkata, UTC+5:30)", async () => {
    const { stationId } = await createStation({ hours: EVERY_DAY("09:00", "18:00") });
    const s = await slots(stationId, "2027-03-02", 60, "2027-03-01T00:00:00Z");
    expect(s[0]).toBe("2027-03-02T03:30:00.000Z"); // 09:00 IST
    expect(s.at(-1)).toBe("2027-03-02T11:30:00.000Z"); // 17:00 IST, ends 18:00
    expect(s).toHaveLength(33); // 09:00 … 17:00 every 15 min
  });

  it("removes starts that would overlap an existing booking or its buffer", async () => {
    const { stationId, evseId } = await createStation({ hours: EVERY_DAY("09:00", "18:00"), rules: { buffer_min: 10 } });
    const user = await createUser();
    expectOk(await book(user, "2027-03-01T00:00:00Z", evseId, "2027-03-02T04:30:00Z")); // 10:00–11:00 IST, blocked to 11:10
    const s = await slots(stationId, "2027-03-02", 60, "2027-03-01T00:00:00Z");
    expect(s).not.toContain("2027-03-02T03:30:00.000Z"); // 09:00–10:00 + 10 min buffer runs into 10:00
    expect(s).not.toContain("2027-03-02T05:30:00.000Z"); // 11:00 is inside the buffer
    expect(s).toContain("2027-03-02T05:45:00.000Z"); // 11:15 is free
  });

  it("respects lead time and the advance-booking limit", async () => {
    const { stationId } = await createStation({
      hours: EVERY_DAY("09:00", "18:00"),
      rules: { lead_time_min: 30, max_advance_days: 2 },
    });
    // now = 09:00 IST on Mar 2 → first start 09:30
    const today = await slots(stationId, "2027-03-02", 30, "2027-03-02T03:30:00Z");
    expect(today[0]).toBe("2027-03-02T04:00:00.000Z");
    expect(await slots(stationId, "2027-03-10", 30, "2027-03-02T03:30:00Z")).toHaveLength(0);
  });

  it("does not offer slots for a station without booking rules", async () => {
    const { stationId } = await createStation({ rules: null });
    expect(await slots(stationId, "2027-03-02", 60, "2027-03-01T00:00:00Z")).toHaveLength(0);
  });
});

describe("time zones and daylight saving", () => {
  it("follows the station's local clock across the UK spring-forward (Europe/London)", async () => {
    const { stationId, evseId } = await createStation({ timeZone: "Europe/London", hours: EVERY_DAY("09:00", "17:00") });
    const now = "2027-03-20T00:00:00Z";
    // 27 March 2027 is GMT (UTC+0); clocks go forward on 28 March (BST, UTC+1).
    expect((await slots(stationId, "2027-03-27", 60, now))[0]).toBe("2027-03-27T09:00:00.000Z");
    expect((await slots(stationId, "2027-03-28", 60, now))[0]).toBe("2027-03-28T08:00:00.000Z");

    const user = await createUser();
    expectOk(await book(user, now, evseId, "2027-03-28T08:00:00Z")); // 09:00 BST — open
    expect(errorCode(await book(user, now, evseId, "2027-03-27T08:00:00Z"))).toBe("EVB06"); // 08:00 GMT — closed
  });

  it("handles the 25-hour autumn day (Europe/London fall-back)", async () => {
    const { stationId } = await createStation({ timeZone: "Europe/London", hours: EVERY_DAY("00:00", "24:00"), rules: { slot_step_min: 60, min_duration_min: 60, max_duration_min: 60 } });
    // 31 Oct 2027: BST → GMT, so the local day lasts 25 hours.
    const s = await slots(stationId, "2027-10-31", 60, "2027-10-25T00:00:00Z");
    expect(s[0]).toBe("2027-10-30T23:00:00.000Z"); // local midnight in BST
    expect(s).toHaveLength(25);
  });

  it("validates alignment in local time for half-hour offsets (IST)", async () => {
    const { evseId } = await createStation({ rules: { slot_step_min: 15 } });
    const user = await createUser();
    expect(errorCode(await book(user, "2027-03-01T00:00:00Z", evseId, "2027-03-02T03:40:00Z"))).toBe("EVB05"); // 09:10 IST
    expectOk(await book(user, "2027-03-01T00:00:00Z", evseId, "2027-03-02T03:45:00Z")); // 09:15 IST
  });

  it("allows bookings across midnight when hours continue into the next day", async () => {
    // Saturday 22:00–24:00 and Sunday 00:00–02:00 (two rows = one continuous opening).
    const { evseId } = await createStation({
      hours: [
        { weekday: 6, opens: "22:00", closes: "24:00" },
        { weekday: 0, opens: "00:00", closes: "02:00" },
      ],
    });
    const user = await createUser();
    const now = "2027-03-01T00:00:00Z";
    // Sat 6 Mar 23:30 IST → Sun 00:30 IST
    expectOk(await book(user, now, evseId, "2027-03-06T18:00:00Z"));
    // Sun 01:30 → 02:30 runs past closing
    expect(errorCode(await book(user, now, evseId, "2027-03-06T20:00:00Z"))).toBe("EVB06");
  });

  it("rejects an unknown station time zone", async () => {
    const r = await db
      .query("insert into public.stations (name, lat, lng, time_zone) values ('Bad tz', 1, 1, 'Mars/Olympus')")
      .then(() => null)
      .catch((e) => e.code);
    expect(r).toBe("22023");
  });
});
