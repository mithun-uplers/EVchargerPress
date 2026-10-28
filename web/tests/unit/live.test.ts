import { describe, expect, it } from "vitest";
import { isFresh, minutesToTarget, provenance, secondsAgo } from "@/lib/live";

describe("live helpers", () => {
  const now = Date.parse("2026-10-28T10:00:00Z");
  it("treats status older than 15 minutes as stale", () => {
    expect(isFresh("2026-10-28T09:50:00Z", now)).toBe(true);
    expect(isFresh("2026-10-28T09:44:00Z", now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
  it("labels provenance", () => {
    expect(provenance(true)).toBe("Simulated");
    expect(provenance(false)).toBe("Live");
  });
  it("formats ages", () => {
    expect(secondsAgo("2026-10-28T09:59:48Z", now)).toBe("12s ago");
    expect(secondsAgo("2026-10-28T09:45:00Z", now)).toBe("15 min ago");
  });
  it("estimates minutes to a target only with known inputs", () => {
    expect(minutesToTarget(50, 80, 40, 48)).toBe(15);
    expect(minutesToTarget(85, 80, 40, 48)).toBe(0);
    expect(minutesToTarget(null, 80, 40, 48)).toBeNull();
    expect(minutesToTarget(50, 80, null, 48)).toBeNull();
    expect(minutesToTarget(50, 80, 40, 0)).toBeNull();
  });
});
