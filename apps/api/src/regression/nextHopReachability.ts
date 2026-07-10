import { describe, it, expect } from "vitest";
import { CliSession } from "../cli/cliSession.js";
import { World } from "../sim/world.js";

function setIf(
  world: World,
  deviceId: string,
  interfaceName: string,
  ip: string,
  mask: string,
  adminUp = true
): void {
  const dev = world.getDevice(deviceId);
  if (!dev) throw new Error(`Device not found: ${deviceId}`);
  const iface = dev.config.interfaces[interfaceName];
  if (!iface) throw new Error(`Interface not found: ${deviceId} ${interfaceName}`);
  iface.adminUp = adminUp;
  iface.ipv4Address = ip;
  iface.ipv4Mask = mask;
}

function showIpRoute(world: World, deviceId: string): string {
  const dev = world.getDevice(deviceId);
  if (!dev) throw new Error(`Device not found: ${deviceId}`);
  const cli = new CliSession(dev, world);
  cli.executeLine("enable");
  return cli.executeLine("show ip route").output;
}

describe("next-hop reachability", () => {
  it("unreachable default-gateway is ignored", () => {
    const world = new World();
    world.createDevice({ id: "H1", type: "host" });
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "H2", type: "host" });

    world.createLink({
      a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
      b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });

    setIf(world, "H1", "GigabitEthernet0/0", "10.0.0.2", "255.255.255.0", true);
    const h1 = world.getDevice("H1")!;
    h1.config.defaultGateway = "10.0.99.99";

    setIf(world, "R1", "GigabitEthernet0/0", "10.0.0.1", "255.255.255.0", true);
    setIf(world, "R1", "GigabitEthernet0/1", "10.0.1.1", "255.255.255.0", true);

    setIf(world, "H2", "GigabitEthernet0/0", "10.0.1.2", "255.255.255.0", true);
    const h2 = world.getDevice("H2")!;
    h2.config.defaultGateway = "10.0.1.1";

    expect(world.canPing("H1", "10.0.1.2")).toBe(false);

    const r = showIpRoute(world, "H1");
    expect(r).toContain("Gateway of last resort is not set");
    expect(r).not.toContain("S*   0.0.0.0/0");
  });

  it("unreachable static default route does not override reachable default-gateway", () => {
    const world = new World();
    world.createDevice({ id: "H1", type: "host" });
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "H2", type: "host" });

    world.createLink({
      a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
      b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });

    setIf(world, "H1", "GigabitEthernet0/0", "10.0.0.2", "255.255.255.0", true);
    const h1 = world.getDevice("H1")!;
    h1.config.defaultGateway = "10.0.0.1";
    h1.config.staticRoutes.push({ destination: "0.0.0.0", mask: "0.0.0.0", nextHop: "192.168.99.99" });

    setIf(world, "R1", "GigabitEthernet0/0", "10.0.0.1", "255.255.255.0", true);
    setIf(world, "R1", "GigabitEthernet0/1", "10.0.1.1", "255.255.255.0", true);

    setIf(world, "H2", "GigabitEthernet0/0", "10.0.1.2", "255.255.255.0", true);
    const h2 = world.getDevice("H2")!;
    h2.config.defaultGateway = "10.0.1.1";

    expect(world.canPing("H1", "10.0.1.2")).toBe(true);

    const tr = world.traceRoute("H1", "10.0.1.2");
    expect(tr.ok).toBe(true);
    expect(tr.hops).toEqual(["10.0.0.1", "10.0.1.2"]);

    const r = showIpRoute(world, "H1");
    expect(r).toContain("Gateway of last resort is 10.0.0.1");
    expect(r).toContain("S*   0.0.0.0/0");
    expect(r).not.toContain("192.168.99.99");
  });

  it("unreachable static route does not override reachable static route", () => {
    const world = new World();
    world.createDevice({ id: "H1", type: "host" });
    world.createDevice({ id: "R1", type: "router" });
    world.createDevice({ id: "R2", type: "router" });
    world.createDevice({ id: "H2", type: "host" });

    world.createLink({
      a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
      b: { deviceId: "R2", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "R2", interfaceName: "GigabitEthernet0/1" },
      b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });

    setIf(world, "H1", "GigabitEthernet0/0", "10.0.1.2", "255.255.255.0", true);
    world.getDevice("H1")!.config.defaultGateway = "10.0.1.1";

    setIf(world, "R1", "GigabitEthernet0/0", "10.0.1.1", "255.255.255.0", true);
    setIf(world, "R1", "GigabitEthernet0/1", "10.0.12.1", "255.255.255.0", true);
    const r1 = world.getDevice("R1")!;
    r1.config.staticRoutes.push({ destination: "10.0.2.0", mask: "255.255.255.0", nextHop: "192.168.99.99" });
    r1.config.staticRoutes.push({ destination: "10.0.2.0", mask: "255.255.255.0", nextHop: "10.0.12.2" });

    setIf(world, "R2", "GigabitEthernet0/0", "10.0.12.2", "255.255.255.0", true);
    setIf(world, "R2", "GigabitEthernet0/1", "10.0.2.1", "255.255.255.0", true);
    world.getDevice("R2")!.config.staticRoutes.push({
      destination: "10.0.1.0",
      mask: "255.255.255.0",
      nextHop: "10.0.12.1"
    });

    setIf(world, "H2", "GigabitEthernet0/0", "10.0.2.2", "255.255.255.0", true);
    world.getDevice("H2")!.config.defaultGateway = "10.0.2.1";

    expect(world.canPing("H1", "10.0.2.2")).toBe(true);

    const tr = world.traceRoute("H1", "10.0.2.2");
    expect(tr.ok).toBe(true);
    expect(tr.hops).toEqual(["10.0.1.1", "10.0.12.2", "10.0.2.2"]);

    const r = showIpRoute(world, "R1");
    expect(r).toContain("10.0.12.2");
    expect(r).not.toContain("192.168.99.99");
  });

  it("l3switch bridges l2 between hosts", () => {
    const world = new World();
    world.createDevice({ id: "H1", type: "host" });
    world.createDevice({ id: "H2", type: "host" });
    world.createDevice({ id: "L3SW1", type: "l3switch" });

    world.createLink({
      a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "L3SW1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "L3SW1", interfaceName: "GigabitEthernet0/1" },
      cableType: "auto"
    });

    setIf(world, "H1", "GigabitEthernet0/0", "10.0.0.1", "255.255.255.0", true);
    setIf(world, "H2", "GigabitEthernet0/0", "10.0.0.2", "255.255.255.0", true);

    expect(world.canPing("H1", "10.0.0.2")).toBe(true);
  });

  it("l3switch routes l3 between subnets", () => {
    const world = new World();
    world.createDevice({ id: "H1", type: "host" });
    world.createDevice({ id: "H2", type: "host" });
    world.createDevice({ id: "L3SW1", type: "l3switch" });

    world.createLink({
      a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "L3SW1", interfaceName: "GigabitEthernet0/0" },
      cableType: "auto"
    });
    world.createLink({
      a: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" },
      b: { deviceId: "L3SW1", interfaceName: "GigabitEthernet0/1" },
      cableType: "auto"
    });

    setIf(world, "H1", "GigabitEthernet0/0", "10.0.0.2", "255.255.255.0", true);
    world.getDevice("H1")!.config.defaultGateway = "10.0.0.1";

    setIf(world, "L3SW1", "GigabitEthernet0/0", "10.0.0.1", "255.255.255.0", true);
    setIf(world, "L3SW1", "GigabitEthernet0/1", "10.0.1.1", "255.255.255.0", true);

    setIf(world, "H2", "GigabitEthernet0/0", "10.0.1.2", "255.255.255.0", true);
    world.getDevice("H2")!.config.defaultGateway = "10.0.1.1";

    expect(world.canPing("H1", "10.0.1.2")).toBe(true);

    const tr = world.traceRoute("H1", "10.0.1.2");
    expect(tr.ok).toBe(true);
    expect(tr.hops).toEqual(["10.0.0.1", "10.0.1.2"]);
  });
});
