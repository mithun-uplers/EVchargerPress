import { describe, expect, it } from "vitest";
import { isFrame, parseBasicAuth, parseFrames } from "@/lib/ocpp";

const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;

describe("OCPP gateway parsing", () => {
  it("accepts Basic auth only for the charge point in the URL", () => {
    const secret = "a".repeat(48);
    expect(parseBasicAuth(basic("CP-1", secret), "CP-1")).toBe(secret);
    expect(parseBasicAuth(basic("CP-2", secret), "CP-1")).toBeNull();
    expect(parseBasicAuth(basic("CP-1", "short"), "CP-1")).toBeNull();
    expect(parseBasicAuth("Bearer x", "CP-1")).toBeNull();
    expect(parseBasicAuth("Basic %%%", "CP-1")).toBeNull();
    expect(parseBasicAuth(null, "CP-1")).toBeNull();
  });
  it("validates frame shapes", () => {
    expect(isFrame([2, "1", "Heartbeat", {}])).toBe(true);
    expect(isFrame([3, "1", { status: "Accepted" }])).toBe(true);
    expect(isFrame([4, "1", "NotSupported", "no", {}])).toBe(true);
    expect(isFrame([2, "1", "Heartbeat"])).toBe(false);
    expect(isFrame([2, "", "Heartbeat", {}])).toBe(false);
    expect(isFrame([5, "1", {}])).toBe(false);
    expect(isFrame({ action: "Heartbeat" })).toBe(false);
  });
  it("accepts single frames and small batches", () => {
    expect(parseFrames([2, "1", "Heartbeat", {}])).toHaveLength(1);
    expect(parseFrames([[2, "1", "Heartbeat", {}], [2, "2", "Heartbeat", {}]])).toHaveLength(2);
    expect(parseFrames(Array.from({ length: 21 }, (_, i) => [2, String(i), "Heartbeat", {}]))).toBeNull();
    expect(parseFrames([[2, "1", "Heartbeat", {}], "junk"])).toBeNull();
  });
});
