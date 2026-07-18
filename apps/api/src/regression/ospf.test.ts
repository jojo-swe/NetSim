import { describe, expect, it } from "vitest";

import { World } from "../sim/world.js";

function configureInterface(
  world: World,
  deviceId: string,
  interfaceName: string,
  address: string,
  mask = "255.255.255.252",
  cost = 10
): void {
  const device = world.getDevice(deviceId);
  if (!device) throw new Error(`missing device ${deviceId}`);
  device.config.interfaces[interfaceName] = {
    name: interfaceName,
    adminUp: true,
    ipv4Address: address,
    ipv4Mask: mask,
    ospfCost: cost
  };
}

function enableOspf(world: World, deviceId: string, routerId: string, area = 0): void {
  world.configureOspf(deviceId, {
    enabled: true,
    processId: 1,
    routerId,
    networks: [{ network: "10.0.0.0", wildcard: "0.255.255.255", area }]
  });
}

function buildThreeRouterLine(): World {
  const world = new World();
  world.createDevice({ id: "R1", type: "router", hostname: "R1" });
  world.createDevice({ id: "R2", type: "router", hostname: "R2" });
  world.createDevice({ id: "R3", type: "router", hostname: "R3" });

  configureInterface(world, "R1", "GigabitEthernet0/0", "10.12.0.1");
  configureInterface(world, "R2", "GigabitEthernet0/0", "10.12.0.2");
  configureInterface(world, "R2", "GigabitEthernet0/1", "10.23.0.2");
  configureInterface(world, "R3", "GigabitEthernet0/0", "10.23.0.3");

  world.createLink({
    id: "R1-R2",
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
    b: { deviceId: "R2", interfaceName: "GigabitEthernet0/0" },
    cableType: "copper_crossover"
  });
  world.createLink({
    id: "R2-R3",
    a: { deviceId: "R2", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "R3", interfaceName: "GigabitEthernet0/0" },
    cableType: "copper_crossover"
  });

  enableOspf(world, "R1", "1.1.1.1");
  enableOspf(world, "R2", "2.2.2.2");
  enableOspf(world, "R3", "3.3.3.3");
  return world;
}

describe("OSPF control plane", () => {
  it("forms full adjacencies and produces a shared link-state database", () => {
    const world = buildThreeRouterLine();
    const r2 = world.getOspfSnapshot("R2");

    expect(r2).not.toBeNull();
    expect(r2?.neighbors).toEqual([
      expect.objectContaining({ neighborDeviceId: "R1", state: "full", area: 0 }),
      expect.objectContaining({ neighborDeviceId: "R3", state: "full", area: 0 })
    ]);
    expect(r2?.lsdb.map((lsa) => lsa.advertisingRouter)).toEqual([
      "1.1.1.1",
      "2.2.2.2",
      "3.3.3.3"
    ]);
  });

  it("runs SPF and installs a remote route with deterministic next hop and metric", () => {
    const world = buildThreeRouterLine();
    const r1 = world.getOspfSnapshot("R1");
    const route = r1?.routes.find(
      (candidate) => candidate.destination === "10.23.0.0" && candidate.mask === "255.255.255.252"
    );

    expect(route).toEqual(
      expect.objectContaining({
        nextHop: "10.12.0.2",
        outgoingInterface: "GigabitEthernet0/0",
        metric: 20,
        learnedFrom: "3.3.3.3"
      })
    );
  });

  it("uses learned OSPF routes for bidirectional forwarding", () => {
    const world = buildThreeRouterLine();

    expect(world.canPing("R1", "10.23.0.3")).toBe(true);
    expect(world.traceRoute("R1", "10.23.0.3")).toEqual({
      ok: true,
      hops: ["10.12.0.2", "10.23.0.3"]
    });
  });

  it("withdraws routes immediately after a link failure", () => {
    const world = buildThreeRouterLine();
    expect(world.getOspfSnapshot("R1")?.routes).toHaveLength(1);

    world.deleteLink("R2-R3");

    expect(world.getOspfSnapshot("R1")?.routes).toEqual([]);
    expect(world.canPing("R1", "10.23.0.3")).toBe(false);
  });

  it("does not form an adjacency across an area mismatch", () => {
    const world = buildThreeRouterLine();
    enableOspf(world, "R3", "3.3.3.3", 1);

    expect(world.getOspfSnapshot("R2")?.neighbors.map((neighbor) => neighbor.neighborDeviceId)).toEqual([
      "R1"
    ]);
    expect(world.getOspfSnapshot("R1")?.routes).toEqual([]);
  });
});
