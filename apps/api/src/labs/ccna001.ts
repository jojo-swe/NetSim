import type { World } from "../sim/world.js";

import type { LabDefinition, LabValidationResult, ObjectiveResult } from "./types.js";

export const ccna001: LabDefinition = {
  id: "ccna-001",
  title: "CCNA 001 - Basic L2 Connectivity",
  description: "Connect two routers through a switch, configure IP addresses, and verify ping."
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

export function validateCcna001(world: World): LabValidationResult {
  const objectives: ObjectiveResult[] = [];

  const r1 = world.getDevice("R1");
  const r2 = world.getDevice("R2");

  objectives.push({
    id: "topology-routers",
    title: "Create routers R1 and R2",
    passed: Boolean(r1 && r2),
    hint: r1 && r2 ? undefined : "Use the device palette to add two routers (R1 and R2)."
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

  const r1Ip = hasIpv4Interface(world, "R1", "10.0.0.1", "255.255.255.0");
  objectives.push({
    id: "r1-ip",
    title: "Configure 10.0.0.1/24 on R1 and no shutdown",
    passed: r1Ip.ok,
    hint: r1Ip.ok
      ? undefined
      : "On R1: conf t -> interface g0/0 (or any connected interface) -> ip address 10.0.0.1 255.255.255.0 -> no shutdown",
    details: r1Ip.ok ? undefined : r1Ip.reason
  });

  const r2Ip = hasIpv4Interface(world, "R2", "10.0.0.2", "255.255.255.0");
  objectives.push({
    id: "r2-ip",
    title: "Configure 10.0.0.2/24 on R2 and no shutdown",
    passed: r2Ip.ok,
    hint: r2Ip.ok
      ? undefined
      : "On R2: conf t -> interface g0/0 (or any connected interface) -> ip address 10.0.0.2 255.255.255.0 -> no shutdown",
    details: r2Ip.ok ? undefined : r2Ip.reason
  });

  const pingOk = world.canPing("R1", "10.0.0.2");
  objectives.push({
    id: "ping",
    title: "Ping from R1 to 10.0.0.2 succeeds",
    passed: pingOk,
    hint: pingOk
      ? undefined
      : "Make sure R1 and R2 are cabled through a switch and both interfaces are up and in the same /24 subnet."
  });

  const score = scoreFor(objectives);

  return {
    labId: ccna001.id,
    passed: objectives.every((o) => o.passed),
    score,
    objectives
  };
}
