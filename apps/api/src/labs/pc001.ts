import type { World } from "../sim/world.js";

import type { LabDefinition, LabValidationResult, ObjectiveResult } from "./types.js";

export const pc001: LabDefinition = {
  id: "pc-001",
  title: "PC 001 - Default Gateway and Routing",
  description: "Connect two PCs to a router, set IP + default gateway on each PC, and verify ping across the router."
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
    if (!world.isInterfaceOperUp(deviceId, iface.name)) return { ok: false, reason: "Link is down" };
    return { ok: true };
  }

  return { ok: false, reason: "IP not configured" };
}

function hasDefaultGateway(world: World, deviceId: string, gw: string): { ok: boolean; reason?: string } {
  const device = world.getDevice(deviceId);
  if (!device) return { ok: false, reason: "Device not found" };
  return device.config.defaultGateway === gw ? { ok: true } : { ok: false, reason: "Default gateway not configured" };
}

export function validatePc001(world: World): LabValidationResult {
  const objectives: ObjectiveResult[] = [];

  const r1 = world.getDevice("R1");
  const pc1 = world.getDevice("PC1");
  const pc2 = world.getDevice("PC2");

  objectives.push({
    id: "topology-devices",
    title: "Create R1, PC1, and PC2",
    passed: Boolean(r1 && pc1 && pc2),
    hint: r1 && pc1 && pc2 ? undefined : "Add one router (R1) and two PCs (PC1, PC2)."
  });

  const r1LanA = hasIpv4Interface(world, "R1", "192.168.10.1", "255.255.255.0");
  objectives.push({
    id: "r1-lan-a",
    title: "Configure 192.168.10.1/24 on R1 and ensure link is up",
    passed: r1LanA.ok,
    hint: r1LanA.ok
      ? undefined
      : "On R1: conf t -> interface g0/0 (connected toward PC1) -> ip address 192.168.10.1 255.255.255.0 -> no shutdown",
    details: r1LanA.ok ? undefined : r1LanA.reason
  });

  const r1LanB = hasIpv4Interface(world, "R1", "192.168.20.1", "255.255.255.0");
  objectives.push({
    id: "r1-lan-b",
    title: "Configure 192.168.20.1/24 on R1 and ensure link is up",
    passed: r1LanB.ok,
    hint: r1LanB.ok
      ? undefined
      : "On R1: conf t -> interface g0/1 (connected toward PC2) -> ip address 192.168.20.1 255.255.255.0 -> no shutdown",
    details: r1LanB.ok ? undefined : r1LanB.reason
  });

  const pc1If = hasIpv4Interface(world, "PC1", "192.168.10.10", "255.255.255.0");
  objectives.push({
    id: "pc1-ip",
    title: "Configure 192.168.10.10/24 on PC1 and ensure link is up",
    passed: pc1If.ok,
    hint: pc1If.ok
      ? undefined
      : "On PC1: use Ports panel IPv4 editor or run 'ip addr add 192.168.10.10/24 dev eth0'",
    details: pc1If.ok ? undefined : pc1If.reason
  });

  const pc2If = hasIpv4Interface(world, "PC2", "192.168.20.20", "255.255.255.0");
  objectives.push({
    id: "pc2-ip",
    title: "Configure 192.168.20.20/24 on PC2 and ensure link is up",
    passed: pc2If.ok,
    hint: pc2If.ok
      ? undefined
      : "On PC2: use Ports panel IPv4 editor or run 'ip addr add 192.168.20.20/24 dev eth0'",
    details: pc2If.ok ? undefined : pc2If.reason
  });

  const pc1Gw = hasDefaultGateway(world, "PC1", "192.168.10.1");
  objectives.push({
    id: "pc1-gw",
    title: "Set default gateway on PC1 to 192.168.10.1",
    passed: pc1Gw.ok,
    hint: pc1Gw.ok ? undefined : "On PC1: 'ip route add default via 192.168.10.1'",
    details: pc1Gw.ok ? undefined : pc1Gw.reason
  });

  const pc2Gw = hasDefaultGateway(world, "PC2", "192.168.20.1");
  objectives.push({
    id: "pc2-gw",
    title: "Set default gateway on PC2 to 192.168.20.1",
    passed: pc2Gw.ok,
    hint: pc2Gw.ok ? undefined : "On PC2: 'ip route add default via 192.168.20.1'",
    details: pc2Gw.ok ? undefined : pc2Gw.reason
  });

  const pingOk = world.canPing("PC1", "192.168.20.20");
  objectives.push({
    id: "ping",
    title: "Ping from PC1 to 192.168.20.20 succeeds",
    passed: pingOk,
    hint: pingOk
      ? undefined
      : "Ensure PC1 and PC2 are cabled to different R1 interfaces, IPs/masks are correct, and both PCs have a default gateway set to R1."
  });

  const score = scoreFor(objectives);

  return {
    labId: pc001.id,
    passed: objectives.every((o) => o.passed),
    score,
    objectives
  };
}
