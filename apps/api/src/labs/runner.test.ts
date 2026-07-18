import { describe, expect, it } from "vitest";

import { runLab, type LabDefinition } from "./runner.js";

const baseLab: LabDefinition = {
  name: "Basic validation",
  topology: {
    devices: [
      {
        id: "R1",
        type: "router",
        config: {
          hostname: "edge-r1",
          staticRoutes: [],
          interfaces: {
            "GigabitEthernet0/0": {
              name: "GigabitEthernet0/0",
              adminUp: true,
              ipv4Address: "10.0.0.1",
              ipv4Mask: "255.255.255.0"
            }
          }
        }
      },
      {
        id: "PC1",
        type: "pc",
        config: {
          hostname: "client-1",
          staticRoutes: [],
          defaultGateway: "10.0.0.1",
          interfaces: {
            "GigabitEthernet0/0": {
              name: "GigabitEthernet0/0",
              adminUp: true,
              ipv4Address: "10.0.0.10",
              ipv4Mask: "255.255.255.0"
            }
          }
        }
      }
    ],
    links: [
      {
        id: "link-1",
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "PC1", interfaceName: "GigabitEthernet0/0" },
        cableType: "copper_straight"
      }
    ]
  },
  assertions: [
    { type: "deviceExists", deviceId: "R1" },
    { type: "hostname", deviceId: "R1", expected: "edge-r1" },
    { type: "interfaceUp", deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
    { type: "ping", from: "PC1", targetIp: "10.0.0.1" }
  ]
};

describe("runLab", () => {
  it("passes a correctly configured lab", () => {
    const result = runLab(baseLab);

    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(4);
    expect(result.failedCount).toBe(0);
  });

  it("reports actionable failures", () => {
    const result = runLab({
      ...baseLab,
      assertions: [{ type: "hostname", deviceId: "R1", expected: "wrong-name" }]
    });

    expect(result.passed).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.results[0]?.message).toContain("got edge-r1");
  });

  it("supports negative reachability assertions", () => {
    const result = runLab({
      ...baseLab,
      assertions: [{ type: "ping", from: "PC1", targetIp: "192.0.2.1", expected: false }]
    });

    expect(result.passed).toBe(true);
  });
});
