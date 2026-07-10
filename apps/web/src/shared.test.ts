import { describe, it, expect } from "vitest";
import { devicePorts, deviceIsMdix } from "@netsim/shared";

describe("shared package re-exports from web", () => {
  it("devicePorts returns expected ports for router", () => {
    const ports = devicePorts("router");
    expect(ports.length).toBe(6);
    expect(ports[0].name).toBe("GigabitEthernet0/0");
    expect(ports[0].kind).toBe("rj45");
  });

  it("deviceIsMdix returns true for switch", () => {
    expect(deviceIsMdix("switch")).toBe(true);
    expect(deviceIsMdix("router")).toBe(false);
  });
});
