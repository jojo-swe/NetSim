import { CliSession } from "../cli/cliSession.js";
import { World } from "../sim/world.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

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

function testUnreachableDefaultGateway(): void {
  const world = new World();
  world.createDevice({ id: "H1", type: "host" });
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "H2", type: "host" });

  world.createLink({
    a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
    b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" }
  });
  world.createLink({
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" }
  });

  setIf(world, "H1", "GigabitEthernet0/0", "10.0.0.2", "255.255.255.0", true);
  const h1 = world.getDevice("H1")!;
  h1.config.defaultGateway = "10.0.99.99";

  setIf(world, "R1", "GigabitEthernet0/0", "10.0.0.1", "255.255.255.0", true);
  setIf(world, "R1", "GigabitEthernet0/1", "10.0.1.1", "255.255.255.0", true);

  setIf(world, "H2", "GigabitEthernet0/0", "10.0.1.2", "255.255.255.0", true);
  const h2 = world.getDevice("H2")!;
  h2.config.defaultGateway = "10.0.1.1";

  assert(world.canPing("H1", "10.0.1.2") === false, "ping should fail with unreachable default-gateway");

  const r = showIpRoute(world, "H1");
  assert(r.includes("Gateway of last resort is not set"), "show ip route should not set gateway");
  assert(!r.includes("S*   0.0.0.0/0"), "show ip route should not show S* default route");
}

function testUnreachableStaticDefaultDoesNotOverrideReachableDefaultGateway(): void {
  const world = new World();
  world.createDevice({ id: "H1", type: "host" });
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "H2", type: "host" });

  world.createLink({
    a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
    b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" }
  });
  world.createLink({
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" }
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

  assert(world.canPing("H1", "10.0.1.2") === true, "ping should succeed via reachable default-gateway");

  const tr = world.traceRoute("H1", "10.0.1.2");
  assert(tr.ok === true, "traceroute should succeed");
  assert(
    JSON.stringify(tr.hops) === JSON.stringify(["10.0.0.1", "10.0.1.2"]),
    `unexpected traceroute hops: ${JSON.stringify(tr.hops)}`
  );

  const r = showIpRoute(world, "H1");
  assert(r.includes("Gateway of last resort is 10.0.0.1"), "show ip route should set gateway");
  assert(r.includes("S*   0.0.0.0/0"), "show ip route should show S* default route");
  assert(!r.includes("192.168.99.99"), "show ip route should not show unreachable static next-hop");
}

function testUnreachableStaticDoesNotOverrideReachableSpecificRoute(): void {
  const world = new World();
  world.createDevice({ id: "H1", type: "host" });
  world.createDevice({ id: "R1", type: "router" });
  world.createDevice({ id: "R2", type: "router" });
  world.createDevice({ id: "H2", type: "host" });

  world.createLink({
    a: { deviceId: "H1", interfaceName: "GigabitEthernet0/0" },
    b: { deviceId: "R1", interfaceName: "GigabitEthernet0/0" }
  });
  world.createLink({
    a: { deviceId: "R1", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "R2", interfaceName: "GigabitEthernet0/0" }
  });
  world.createLink({
    a: { deviceId: "R2", interfaceName: "GigabitEthernet0/1" },
    b: { deviceId: "H2", interfaceName: "GigabitEthernet0/0" }
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

  assert(world.canPing("H1", "10.0.2.2") === true, "ping should succeed via reachable static route");

  const tr = world.traceRoute("H1", "10.0.2.2");
  assert(tr.ok === true, "traceroute should succeed");
  assert(
    JSON.stringify(tr.hops) === JSON.stringify(["10.0.1.1", "10.0.12.2", "10.0.2.2"]),
    `unexpected traceroute hops: ${JSON.stringify(tr.hops)}`
  );

  const r = showIpRoute(world, "R1");
  assert(r.includes("10.0.12.2"), "show ip route should include reachable static next-hop");
  assert(!r.includes("192.168.99.99"), "show ip route should not show unreachable static next-hop");
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: "unreachable default-gateway is ignored", run: testUnreachableDefaultGateway },
  {
    name: "unreachable static default route does not override reachable default-gateway",
    run: testUnreachableStaticDefaultDoesNotOverrideReachableDefaultGateway
  },
  {
    name: "unreachable static route does not override reachable static route",
    run: testUnreachableStaticDoesNotOverrideReachableSpecificRoute
  }
];

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    process.stdout.write(`ok - ${t.name}\n`);
  } catch (e) {
    failed++;
    process.stderr.write(`not ok - ${t.name}\n`);
    process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed} test(s) failed\n`);
  process.exit(1);
}

process.stdout.write(`\n${tests.length} test(s) passed\n`);
