import { describe, expect, it } from "vitest";

import { CliSession } from "../cli/cliSession.js";
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

function cli(world: World, deviceId: string): CliSession {
  const device = world.getDevice(deviceId);
  if (!device) throw new Error(`missing device ${deviceId}`);
  return new CliSession(device, world);
}

function run(session: CliSession, lines: string[]): string {
  return lines.map((line) => session.executeLine(line).output).join("");
}

function configureViaCli(
  world: World,
  deviceId: string,
  routerId: string,
  interfaces: Array<[name: string, address: string]>
): CliSession {
  const session = cli(world, deviceId);
  const output = run(session, [
    "enable",
    "configure terminal",
    ...interfaces.flatMap(([name, address]) => [
      `interface ${name}`,
      `ip address ${address} 255.255.255.252`,
      "ip ospf cost 10",
      "no shutdown",
      "exit"
    ]),
    "router ospf 1",
    `router-id ${routerId}`,
    "network 10.0.0.0 0.255.255.255 area 0",
    "end"
  ]);
  expect(output).not.toContain("%");
  return session;
}

function buildThreeRouterLineViaCli(): { world: World; r1: CliSession; r2: CliSession } {
  const world = new World();
  world.createDevice({ id: "R1", type: "router", hostname: "R1" });
  world.createDevice({ id: "R2", type: "router", hostname: "R2" });
  world.createDevice({ id: "R3", type: "router", hostname: "R3" });
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

  const r1 = configureViaCli(world, "R1", "1.1.1.1", [["g0/0", "10.12.0.1"]]);
  const r2 = configureViaCli(world, "R2", "2.2.2.2", [
    ["g0/0", "10.12.0.2"],
    ["g0/1", "10.23.0.2"]
  ]);
  configureViaCli(world, "R3", "3.3.3.3", [["g0/0", "10.23.0.3"]]);
  return { world, r1, r2 };
}

describe("OSPF IOS CLI", () => {
  it("forms adjacencies and installs routes from CLI configuration", () => {
    const { world, r1, r2 } = buildThreeRouterLineViaCli();

    const neighbors = r2.executeLine("show ip ospf neighbor").output.trimEnd().split("\n");
    expect(neighbors).toEqual([
      "Neighbor ID     Pri   State           Address         Interface",
      "1.1.1.1         1     FULL/  -        10.12.0.1       GigabitEthernet0/0",
      "3.3.3.3         1     FULL/  -        10.23.0.3       GigabitEthernet0/1"
    ]);

    const routes = r1.executeLine("show ip route").output;
    expect(routes).toContain("Codes: C - connected, S - static, O - OSPF");
    expect(routes).toContain("O    10.23.0.0/30 [110/20] via 10.12.0.2, GigabitEthernet0/0");
    expect(world.canPing("R1", "10.23.0.3")).toBe(true);
  });

  it("renders the OSPF block in running-config", () => {
    const { r1 } = buildThreeRouterLineViaCli();
    const config = r1.executeLine("show running-config").output;

    expect(config).toContain(" ip ospf cost 10\n");
    expect(config).toContain("router ospf 1\n router-id 1.1.1.1\n network 10.0.0.0 0.255.255.255 area 0\n!");
  });

  it("enters config-router mode and rejects malformed input", () => {
    const { r1 } = buildThreeRouterLineViaCli();
    r1.executeLine("configure terminal");

    expect(r1.executeLine("router ospf").output).toBe("% Incomplete command.\n");
    expect(r1.executeLine("router ospf 0").output).toContain("% Invalid input");
    expect(r1.executeLine("router ospf 1").prompt).toBe("R1(config-router)#");
    expect(r1.executeLine("router-id 1.1.1").output).toContain("% Invalid input");
    expect(r1.executeLine("network 10.0.0.0 0.0.0.255 area x").output).toContain("% Invalid input");
    expect(r1.executeLine("network 10.0.0.0 0.0.0.255").output).toBe("% Incomplete command.\n");
    expect(r1.complete("net").insert).toBe("work ");
    expect(r1.executeLine("exit").prompt).toBe("R1(config)#");
  });

  it("withdraws routes after no router ospf and no network", () => {
    const { world, r1, r2 } = buildThreeRouterLineViaCli();

    run(r2, ["configure terminal", "router ospf 1", "no network 10.0.0.0 0.255.255.255 area 0", "end"]);
    expect(r2.executeLine("show ip ospf neighbor").output.trimEnd().split("\n")).toHaveLength(1);
    run(r2, ["configure terminal", "router ospf 1", "network 10.0.0.0 0.255.255.255 area 0", "end"]);
    expect(world.canPing("R1", "10.23.0.3")).toBe(true);

    run(r1, ["configure terminal", "no router ospf 1", "end"]);
    expect(world.getDevice("R1")?.config.ospf).toBeUndefined();
    expect(r1.executeLine("show ip route").output).not.toContain("O    ");
    expect(world.canPing("R1", "10.23.0.3")).toBe(false);
  });
});

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
        learnedFrom: "2.2.2.2"
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
    expect(world.canPing("R1", "10.23.0.3")).toBe(false);
  });
});
