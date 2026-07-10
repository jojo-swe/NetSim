import { describe, it, expect } from "vitest";
import { World } from "../sim/world.js";

describe("cable compatibility", () => {
  it("fiber requires SFP ports on both ends", () => {
    const world = new World();
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "R2", type: "router" });

    expect(() =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "R2", interfaceName: "GigabitEthernet0/0" },
        cableType: "fiber"
      })
    ).toThrow("Fiber cable requires SFP ports on both ends");
  });

  it("copper requires RJ45 ports on both ends", () => {
    const world = new World();
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "R2", type: "router" });

    expect(() =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
        b: { deviceId: "R2", interfaceName: "GigabitEthernet0/4" },
        cableType: "copper_straight"
      })
    ).toThrow("Copper cable requires RJ45 ports on both ends");
  });

  it("straight vs crossover validation", () => {
    const world = new World();
    world.createDevice({ id: "SW1", type: "switch" });
    world.createDevice({ id: "SW2", type: "switch" });

    expect(() =>
      world.createLink({
        a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "SW2", interfaceName: "GigabitEthernet0/0" },
        cableType: "copper_straight"
      })
    ).toThrow("Straight-through cable requires one MDI and one MDI-X port");

    const world2 = new World();
    world2.createDevice({ id: "SW1", type: "switch" });
    world2.createDevice({ id: "R1", type: "router" });

    expect(() =>
      world2.createLink({
        a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
        b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
        cableType: "copper_crossover"
      })
    ).toThrow("Crossover cable requires both ends to be MDI or both ends to be MDI-X");
  });

  it("auto resolves as expected", () => {
    const world = new World();
    world.createDevice({ id: "SW1", type: "switch" });
    world.createDevice({ id: "R1", type: "router" });

    const link = world.createLink({
      a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    expect(link.cableType).toBe("copper_straight");

    const world2 = new World();
    world2.createDevice({ id: "SW1", type: "switch" });
    world2.createDevice({ id: "SW2", type: "switch" });

    const link2 = world2.createLink({
      a: { deviceId: "SW1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "SW2", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    expect(link2.cableType).toBe("copper_crossover");
  });

  it("auto fails when any end is SFP but other is not", () => {
    const world = new World();
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "R2", type: "router" });

    expect(() =>
      world.createLink({
        a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
        b: { deviceId: "R2", interfaceName: "GigabitEthernet0/0" },
        cableType: "auto"
      })
    ).toThrow("Fiber cable requires SFP ports on both ends");
  });

  it("fiber succeeds on SFP both ends", () => {
    const world = new World();
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "R2", type: "router" });

    const link = world.createLink({
      a: { deviceId: "R1", interfaceName: "GigabitEthernet0/4" },
      b: { deviceId: "R2", interfaceName: "GigabitEthernet0/4" },
      cableType: "fiber"
    });
    expect(link.cableType).toBe("fiber");
  });
});
