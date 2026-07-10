import { type Edge, type Node } from "reactflow";
import {
  devicePorts,
  deviceIsMdix,
  type DeviceType,
  type DevicePort,
  type PortKind,
} from "@netsim/shared";
import { type DeviceNodeData } from "../types";

export function inferDeviceType(deviceId: string, nodes: Node<DeviceNodeData>[]): DeviceType {
  const n = nodes.find((x) => x.id === deviceId) as any;
  const label = (n?.data?.label as string | undefined) ?? "";
  const upperId = deviceId.toUpperCase();
  const lowerLabel = label.toLowerCase();

  if (upperId.startsWith("L3SW") || (lowerLabel.includes("l3") && lowerLabel.includes("switch"))) return "l3switch";
  if (upperId.startsWith("SW") || lowerLabel.includes("switch")) return "switch";
  if (upperId.startsWith("FW") || lowerLabel.includes("firewall")) return "firewall";
  if (upperId.startsWith("SRV") || lowerLabel.includes("server")) return "server";
  if (upperId.startsWith("CLOUD") || lowerLabel.includes("cloud") || lowerLabel.includes("internet")) return "cloud";
  if (upperId.startsWith("PC") || lowerLabel.includes("pc") || lowerLabel.includes("linux")) return "pc";
  if (upperId.startsWith("H") || lowerLabel.includes("host")) return "host";
  return "router";
}

export function inferDeviceTypeFromLabel(deviceId: string, label?: string): DeviceType {
  const upperId = deviceId.toUpperCase();
  const lowerLabel = (label ?? "").toLowerCase();

  if (upperId.startsWith("L3SW") || (lowerLabel.includes("l3") && lowerLabel.includes("switch"))) return "l3switch";
  if (upperId.startsWith("SW") || lowerLabel.includes("switch")) return "switch";
  if (upperId.startsWith("FW") || lowerLabel.includes("firewall")) return "firewall";
  if (upperId.startsWith("SRV") || lowerLabel.includes("server")) return "server";
  if (upperId.startsWith("CLOUD") || lowerLabel.includes("cloud") || lowerLabel.includes("internet")) return "cloud";
  if (upperId.startsWith("PC") || lowerLabel.includes("pc") || lowerLabel.includes("linux")) return "pc";
  if (upperId.startsWith("H") || lowerLabel.includes("host")) return "host";
  return "router";
}

export function usedPorts(deviceId: string, edges: Edge[]): Set<string> {
  const used = new Set<string>();
  for (const e of edges as any[]) {
    const d = e?.data;
    if (d?.a?.deviceId === deviceId && typeof d?.a?.interfaceName === "string") used.add(d.a.interfaceName);
    if (d?.b?.deviceId === deviceId && typeof d?.b?.interfaceName === "string") used.add(d.b.interfaceName);
  }
  return used;
}

export function findPortPeer(
  deviceId: string,
  interfaceName: string,
  edges: Edge[]
): { peerDeviceId: string; peerInterfaceName: string } | null {
  if (!interfaceName) return null;
  for (const e of edges as any[]) {
    const d = e?.data;
    if (
      d?.a?.deviceId === deviceId &&
      d?.a?.interfaceName === interfaceName &&
      typeof d?.b?.deviceId === "string" &&
      typeof d?.b?.interfaceName === "string"
    ) {
      return { peerDeviceId: d.b.deviceId, peerInterfaceName: d.b.interfaceName };
    }
    if (
      d?.b?.deviceId === deviceId &&
      d?.b?.interfaceName === interfaceName &&
      typeof d?.a?.deviceId === "string" &&
      typeof d?.a?.interfaceName === "string"
    ) {
      return { peerDeviceId: d.a.deviceId, peerInterfaceName: d.a.interfaceName };
    }
  }
  return null;
}

export function findPortLinkInfo(
  deviceId: string,
  interfaceName: string,
  edges: Edge[]
): { linkId: string; peerDeviceId: string; peerInterfaceName: string; cableType?: string } | null {
  if (!interfaceName) return null;
  for (const e of edges as any[]) {
    const d = e?.data;
    const cableType = typeof d?.cableType === "string" ? d.cableType : undefined;

    if (
      d?.a?.deviceId === deviceId &&
      d?.a?.interfaceName === interfaceName &&
      typeof d?.b?.deviceId === "string" &&
      typeof d?.b?.interfaceName === "string"
    ) {
      return { linkId: String(e.id), peerDeviceId: d.b.deviceId, peerInterfaceName: d.b.interfaceName, cableType };
    }

    if (
      d?.b?.deviceId === deviceId &&
      d?.b?.interfaceName === interfaceName &&
      typeof d?.a?.deviceId === "string" &&
      typeof d?.a?.interfaceName === "string"
    ) {
      return { linkId: String(e.id), peerDeviceId: d.a.deviceId, peerInterfaceName: d.a.interfaceName, cableType };
    }
  }
  return null;
}

export function availablePorts(deviceId: string, edges: Edge[], nodes: Node<DeviceNodeData>[]): DevicePort[] {
  const t = inferDeviceType(deviceId, nodes);
  const ports = devicePorts(t);
  const used = usedPorts(deviceId, edges);
  return ports.filter((p) => !used.has(p.name));
}

export function firstFreePort(deviceId: string, edges: Edge[], nodes: Node<DeviceNodeData>[]): string | null {
  return availablePorts(deviceId, edges, nodes)[0]?.name ?? null;
}

export function portKindForInterface(
  deviceId: string,
  interfaceName: string,
  nodes: Node<DeviceNodeData>[]
): PortKind | null {
  if (!interfaceName) return null;
  const t = inferDeviceType(deviceId, nodes);
  return devicePorts(t).find((p) => p.name === interfaceName)?.kind ?? null;
}

export function suggestCableType(
  sourceId: string,
  sourceIf: string,
  targetId: string,
  targetIf: string,
  nodes: Node<DeviceNodeData>[]
): import("@netsim/shared").CableType {
  const srcKind = portKindForInterface(sourceId, sourceIf, nodes);
  const dstKind = portKindForInterface(targetId, targetIf, nodes);
  if (!srcKind || !dstKind) return "auto";

  if (srcKind === "sfp" && dstKind === "sfp") return "fiber";

  if (srcKind === "rj45" && dstKind === "rj45") {
    const srcType = inferDeviceType(sourceId, nodes);
    const dstType = inferDeviceType(targetId, nodes);
    const sameRole = deviceIsMdix(srcType) === deviceIsMdix(dstType);
    return sameRole ? "copper_crossover" : "copper_straight";
  }

  return "auto";
}

export function defaultAdminUpFor(type: DeviceType): boolean {
  if (type === "router") return false;
  if (type === "firewall") return false;
  return true;
}
