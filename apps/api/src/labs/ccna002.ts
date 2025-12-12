import type { World } from "../sim/world.js";

import type { LabDefinition, LabValidationResult, ObjectiveResult } from "./types.js";

export const ccna002: LabDefinition = {
  id: "ccna-002",
  title: "CCNA 002 - Static Routing (3 Routers)",
  description:
    "Build a 3-router topology (R1-R2-R3), configure IPv4 addresses and static routes, and verify end-to-end ping."
};

function scoreFor(objectives: ObjectiveResult[]): number {
  if (objectives.length === 0) return 0;
  const passed = objectives.filter((o) => o.passed).length;
  return Math.round((passed / objectives.length) * 100);
}

function hasIpv4Interface(
  world: World,
  deviceId: string,
  ip: string,
  mask: string
): { ok: boolean; reason?: string } {
  const device = world.getDevice(deviceId);
  if (!device) return { ok: false, reason: "Device not found" };

  for (const iface of Object.values(device.config.interfaces)) {
    if (!iface.ipv4Address || !iface.ipv4Mask) continue;
    if (iface.ipv4Address !== ip) continue;
    if (iface.ipv4Mask !== mask) continue;
    if (!iface.adminUp) return { ok: false, reason: "Interface is shutdown" };
    return { ok: true };
  }

  return { ok: false, reason: "IP not configured" };
}

function hasStaticRoute(
  world: World,
  deviceId: string,
  destination: string,
  mask: string,
  nextHop: string
): { ok: boolean; reason?: string } {
  const device = world.getDevice(deviceId);
  if (!device) return { ok: false, reason: "Device not found" };

  const routes = Array.isArray((device.config as any).staticRoutes) ? device.config.staticRoutes : [];
  const ok = routes.some((r) => r.destination === destination && r.mask === mask && r.nextHop === nextHop);
  return ok ? { ok: true } : { ok: false, reason: "Static route not configured" };
}

export function validateCcna002(world: World): LabValidationResult {
  const objectives: ObjectiveResult[] = [];

  const r1 = world.getDevice("R1");
  const r2 = world.getDevice("R2");
  const r3 = world.getDevice("R3");

  objectives.push({
    id: "topology-routers",
    title: "Create routers R1, R2, and R3",
    passed: Boolean(r1 && r2 && r3),
    hint: r1 && r2 && r3 ? undefined : "Use the device palette to add three routers (R1, R2, R3)."
  });

  objectives.push({
    id: "hostname-r1",
    title: "Set hostname on R1",
    passed: r1?.config.hostname === "R1",
    hint: r1?.config.hostname === "R1" ? undefined : "On R1: conf t -> hostname R1"
  });

  objectives.push({
    id: "hostname-r2",
    title: "Set hostname on R2",
    passed: r2?.config.hostname === "R2",
    hint: r2?.config.hostname === "R2" ? undefined : "On R2: conf t -> hostname R2"
  });

  objectives.push({
    id: "hostname-r3",
    title: "Set hostname on R3",
    passed: r3?.config.hostname === "R3",
    hint: r3?.config.hostname === "R3" ? undefined : "On R3: conf t -> hostname R3"
  });

  const r1If = hasIpv4Interface(world, "R1", "10.0.12.1", "255.255.255.252");
  objectives.push({
    id: "r1-p2p-ip",
    title: "Configure 10.0.12.1/30 on R1 and no shutdown",
    passed: r1If.ok,
    hint: r1If.ok
      ? undefined
      : "On R1: conf t -> interface g0/0 (or any interface connected to R2) -> ip address 10.0.12.1 255.255.255.252 -> no shutdown",
    details: r1If.ok ? undefined : r1If.reason
  });

  const r2IfA = hasIpv4Interface(world, "R2", "10.0.12.2", "255.255.255.252");
  const r2IfB = hasIpv4Interface(world, "R2", "10.0.23.1", "255.255.255.252");
  objectives.push({
    id: "r2-p2p-ips",
    title: "Configure 10.0.12.2/30 and 10.0.23.1/30 on R2 and no shutdown",
    passed: r2IfA.ok && r2IfB.ok,
    hint:
      r2IfA.ok && r2IfB.ok
        ? undefined
        : "On R2: conf t -> configure one interface as 10.0.12.2/30 (toward R1) and another as 10.0.23.1/30 (toward R3), then no shutdown",
    details:
      r2IfA.ok && r2IfB.ok
        ? undefined
        : `Toward R1: ${r2IfA.reason ?? "missing"}; toward R3: ${r2IfB.reason ?? "missing"}`
  });

  const r3IfA = hasIpv4Interface(world, "R3", "10.0.23.2", "255.255.255.252");
  const r3Lan = hasIpv4Interface(world, "R3", "192.168.3.1", "255.255.255.0");
  objectives.push({
    id: "r3-ips",
    title: "Configure 10.0.23.2/30 and 192.168.3.1/24 on R3 and no shutdown",
    passed: r3IfA.ok && r3Lan.ok,
    hint:
      r3IfA.ok && r3Lan.ok
        ? undefined
        : "On R3: conf t -> configure one interface as 10.0.23.2/30 (toward R2) and another as 192.168.3.1/24 (LAN). Connect the LAN interface to a switch so it comes up.",
    details:
      r3IfA.ok && r3Lan.ok
        ? undefined
        : `Toward R2: ${r3IfA.reason ?? "missing"}; LAN: ${r3Lan.reason ?? "missing"}`
  });

  const r1Route = hasStaticRoute(world, "R1", "192.168.3.0", "255.255.255.0", "10.0.12.2");
  objectives.push({
    id: "r1-static",
    title: "Configure static route on R1 to 192.168.3.0/24 via 10.0.12.2",
    passed: r1Route.ok,
    hint: r1Route.ok ? undefined : "On R1: conf t -> ip route 192.168.3.0 255.255.255.0 10.0.12.2",
    details: r1Route.ok ? undefined : r1Route.reason
  });

  const r2Route = hasStaticRoute(world, "R2", "192.168.3.0", "255.255.255.0", "10.0.23.2");
  objectives.push({
    id: "r2-static",
    title: "Configure static route on R2 to 192.168.3.0/24 via 10.0.23.2",
    passed: r2Route.ok,
    hint: r2Route.ok ? undefined : "On R2: conf t -> ip route 192.168.3.0 255.255.255.0 10.0.23.2",
    details: r2Route.ok ? undefined : r2Route.reason
  });

  const r3Route = hasStaticRoute(world, "R3", "10.0.12.0", "255.255.255.252", "10.0.23.1");
  objectives.push({
    id: "r3-static",
    title: "Configure return static route on R3 to 10.0.12.0/30 via 10.0.23.1",
    passed: r3Route.ok,
    hint: r3Route.ok ? undefined : "On R3: conf t -> ip route 10.0.12.0 255.255.255.252 10.0.23.1",
    details: r3Route.ok ? undefined : r3Route.reason
  });

  const pingOk = world.canPing("R1", "192.168.3.1");
  objectives.push({
    id: "ping",
    title: "Ping from R1 to 192.168.3.1 succeeds",
    passed: pingOk,
    hint: pingOk
      ? undefined
      : "Verify cabling between R1-R2-R3, ensure all interfaces are no shutdown, add the static routes, and confirm with 'show ip route'."
  });

  const score = scoreFor(objectives);

  return {
    labId: ccna002.id,
    passed: objectives.every((o) => o.passed),
    score,
    objectives
  };
}
