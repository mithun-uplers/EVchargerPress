import { describe, expect, it } from "vitest";
import { connectLabels, supportsCloudConnect, vehicleNoun } from "@/lib/vehicle-types";

describe("vehicle connect labels", () => {
  it("words every label for the vehicle type", () => {
    expect(connectLabels("scooter")).toMatchObject({ connect: "Connect scooter", heading: "Connected scooter", simulated: "Simulated scooter", connected: "Scooter connected" });
    expect(connectLabels("car").connect).toBe("Connect car");
    expect(connectLabels("motorcycle").useSimulated).toBe("Use a simulated motorcycle");
    expect(connectLabels("bicycle").connect).toBe("Connect e-bike");
    expect(vehicleNoun("other")).toBe("vehicle");
    expect(vehicleNoun(null)).toBe("vehicle");
  });
  it("offers the Smartcar cloud connection for cars only", () => {
    expect(supportsCloudConnect("car")).toBe(true);
    for (const t of ["scooter", "motorcycle", "bicycle", "other", null]) expect(supportsCloudConnect(t)).toBe(false);
  });
});
