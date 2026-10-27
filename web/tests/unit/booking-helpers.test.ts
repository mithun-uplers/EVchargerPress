import { describe, expect, it } from "vitest";
import { effectiveStatus, parseRange } from "@/lib/booking-types";
import { parseWindow } from "@/lib/booking-validation";
import { formatMoney, formatTime, localDate } from "@/lib/format";

describe("parseRange", () => {
  it("parses Postgres tstzrange text with hour or hour:minute offsets", () => {
    expect(parseRange('["2027-03-02 04:30:00+00","2027-03-02 05:30:00+00")')).toEqual({
      start: new Date("2027-03-02T04:30:00Z"),
      end: new Date("2027-03-02T05:30:00Z"),
    });
    expect(parseRange('["2027-03-02 10:00:00+05:30","2027-03-02 11:00:00+05:30")').start.toISOString()).toBe("2027-03-02T04:30:00.000Z");
  });
  it("rejects anything that is not a range", () => {
    expect(() => parseRange("2027-03-02")).toThrow();
  });
});

describe("effectiveStatus", () => {
  const now = new Date("2027-03-01T00:10:00Z");
  it("shows a lapsed hold as expired before the sweeper runs", () => {
    expect(effectiveStatus({ status: "pending", hold_expires_at: "2027-03-01T00:10:00Z" }, now)).toBe("expired");
    expect(effectiveStatus({ status: "pending", hold_expires_at: "2027-03-01T00:11:00Z" }, now)).toBe("pending");
    expect(effectiveStatus({ status: "confirmed", hold_expires_at: "2027-03-01T00:00:00Z" }, now)).toBe("confirmed");
  });
});

describe("formatting", () => {
  it("formats minor units as currency", () => {
    expect(formatMoney(5900, "INR")).toBe("₹59.00");
    expect(formatMoney(107852, "INR")).toBe("₹1,078.52");
  });
  it("shows times in the station's zone, not the server's", () => {
    expect(formatTime("2027-03-02T04:30:00Z", "Asia/Kolkata")).toBe("10:00");
    expect(formatTime("2027-03-28T08:00:00Z", "Europe/London")).toBe("09:00");
  });
  it("computes the local date in a time zone", () => {
    // 20:00 UTC on 1 Mar is already 2 Mar in India
    expect(localDate("Asia/Kolkata", new Date("2027-03-01T20:00:00Z"))).toBe("2027-03-02");
    expect(localDate("Europe/London", new Date("2027-03-01T20:00:00Z"))).toBe("2027-03-01");
  });
});

describe("parseWindow (API input validation)", () => {
  const evse = "8b4f2c1e-1111-4a2b-9c3d-123456789abc";
  it("accepts a well-formed request", () => {
    expect(parseWindow({ evse_id: evse, start_at: "2027-03-02T04:30:00Z", duration_min: 60 })).toEqual({
      ok: true,
      value: { evseId: evse, startAt: "2027-03-02T04:30:00Z", durationMin: 60 },
    });
  });
  it("reports every invalid field", () => {
    const r = parseWindow({ evse_id: "nope", start_at: "2027-03-02 10:00", duration_min: 59.5 });
    expect(!r.ok && Object.keys(r.fields).sort()).toEqual(["duration_min", "evse_id", "start_at"]);
  });
  it("requires an explicit time zone on start_at", () => {
    const r = parseWindow({ evse_id: evse, start_at: "2027-03-02T10:00:00", duration_min: 60 });
    expect(!r.ok && r.fields.start_at).toBeTruthy();
  });
  it("handles a missing body", () => {
    expect(parseWindow(null).ok).toBe(false);
  });
});
