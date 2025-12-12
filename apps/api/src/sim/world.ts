import { randomUUID } from "node:crypto";
import type { Device, DeviceType, InterfaceConfig, Link, LinkEndpoint } from "./types.js";

function defaultHostnameFor(type: DeviceType): string {
  switch (type) {
    case "router":
      return "Router";
    case "switch":
      return "Switch";
    case "host":
      return "Host";
  }
}

function ensureInterfaceDefaults(name: string, adminUp: boolean): InterfaceConfig {
  return {
    name,
    adminUp
  };
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (part.length === 0) return null;
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function inSameSubnet(ip: string, mask: string, otherIp: string): boolean {
  const ipN = ipv4ToInt(ip);
  const maskN = ipv4ToInt(mask);
  const otherN = ipv4ToInt(otherIp);
  if (ipN === null || maskN === null || otherN === null) return false;
  return (ipN & maskN) === (otherN & maskN);
}

function maskToPrefixLen(mask: string): number | null {
  const m = ipv4ToInt(mask);
  if (m === null) return null;

  let seenZero = false;
  let len = 0;
  for (let i = 31; i >= 0; i--) {
    const bit = (m >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      len++;
    } else {
      seenZero = true;
    }
  }

  return len;
}

function ipMatchesDestination(targetIp: string, destination: string, mask: string): boolean {
  const t = ipv4ToInt(targetIp);
  const d = ipv4ToInt(destination);
  const m = ipv4ToInt(mask);
  if (t === null || d === null || m === null) return false;
  return (t & m) === (d & m);
}

export class World {
  private devices = new Map<string, Device>();
  private links = new Map<string, Link>();

  listDevices(): Device[] {
    return [...this.devices.values()];
  }

  listLinks(): Link[] {
    return [...this.links.values()];
  }

  exportSnapshot(): { devices: Device[]; links: Link[] } {
    return {
      devices: JSON.parse(JSON.stringify(this.listDevices())) as Device[],
      links: JSON.parse(JSON.stringify(this.listLinks())) as Link[]
    };
  }

  importSnapshot(snapshot: { devices: Device[]; links?: Link[] }): void {
    this.devices.clear();
    this.links.clear();
    for (const device of snapshot.devices) {
      const cloned = JSON.parse(JSON.stringify(device)) as Device;
      if (!Array.isArray((cloned as any).config?.staticRoutes)) {
        (cloned as any).config.staticRoutes = [];
      }
      this.devices.set(device.id, cloned);
    }
    if (snapshot.links) {
      for (const link of snapshot.links) {
        this.links.set(link.id, JSON.parse(JSON.stringify(link)) as Link);
      }
    }
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  createDevice(input: { id?: string; type?: DeviceType; hostname?: string }): Device {
    const id = input.id ?? randomUUID();
    const type: DeviceType = input.type ?? "router";

    const existing = this.devices.get(id);
    if (existing) return existing;

    const hostname = input.hostname ?? defaultHostnameFor(type);
    const defaultAdminUp = type !== "router";

    const device: Device = {
      id,
      type,
      config: {
        hostname,
        staticRoutes: [],
        interfaces: {
          "GigabitEthernet0/0": ensureInterfaceDefaults("GigabitEthernet0/0", defaultAdminUp),
          "GigabitEthernet0/1": ensureInterfaceDefaults("GigabitEthernet0/1", defaultAdminUp)
        }
      }
    };

    this.devices.set(id, device);
    return device;
  }

  createLink(input: { id?: string; a: LinkEndpoint; b: LinkEndpoint }): Link {
    if (input.a.deviceId === input.b.deviceId && input.a.interfaceName === input.b.interfaceName) {
      throw new Error("Invalid link endpoints");
    }

    const aDevice = this.getDevice(input.a.deviceId) ?? this.createDevice({ id: input.a.deviceId });
    const bDevice = this.getDevice(input.b.deviceId) ?? this.createDevice({ id: input.b.deviceId });

    if (!aDevice.config.interfaces[input.a.interfaceName]) {
      aDevice.config.interfaces[input.a.interfaceName] = ensureInterfaceDefaults(
        input.a.interfaceName,
        aDevice.type !== "router"
      );
    }
    if (!bDevice.config.interfaces[input.b.interfaceName]) {
      bDevice.config.interfaces[input.b.interfaceName] = ensureInterfaceDefaults(
        input.b.interfaceName,
        bDevice.type !== "router"
      );
    }

    if (this.findLinkByEndpoint(input.a) || this.findLinkByEndpoint(input.b)) {
      throw new Error("Interface already connected");
    }

    const id = input.id ?? randomUUID();
    const link: Link = {
      id,
      a: { deviceId: input.a.deviceId, interfaceName: input.a.interfaceName },
      b: { deviceId: input.b.deviceId, interfaceName: input.b.interfaceName }
    };
    this.links.set(id, link);
    return link;
  }

  deleteLink(id: string): boolean {
    return this.links.delete(id);
  }

  getLinkPeer(endpoint: LinkEndpoint): LinkEndpoint | null {
    for (const link of this.links.values()) {
      if (link.a.deviceId === endpoint.deviceId && link.a.interfaceName === endpoint.interfaceName) {
        return link.b;
      }
      if (link.b.deviceId === endpoint.deviceId && link.b.interfaceName === endpoint.interfaceName) {
        return link.a;
      }
    }
    return null;
  }

  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    const iface = device.config.interfaces[interfaceName];
    if (!iface?.adminUp) return false;

    const peer = this.getLinkPeer({ deviceId, interfaceName });
    if (!peer) return false;
    const peerDevice = this.devices.get(peer.deviceId);
    if (!peerDevice) return false;
    const peerIface = peerDevice.config.interfaces[peer.interfaceName];
    if (!peerIface?.adminUp) return false;

    return true;
  }

  canPing(fromDeviceId: string, targetIp: string): boolean {
    if (ipv4ToInt(targetIp) === null) return false;

    const targets = this.findActiveIpEndpoints(targetIp);
    if (targets.length === 0) return false;

    const forward = this.routeToIp(fromDeviceId, targetIp, 8, new Set<string>(), undefined);
    if (!forward.ok || !forward.originSourceIp) return false;

    const destDeviceId = targets[0].ep.deviceId;
    const reverse = this.routeToIp(destDeviceId, forward.originSourceIp, 8, new Set<string>(), undefined);
    return reverse.ok;
  }

  private findActiveIpEndpoints(ip: string): Array<{ ep: LinkEndpoint; mask: string }> {
    const out: Array<{ ep: LinkEndpoint; mask: string }> = [];
    for (const device of this.devices.values()) {
      for (const iface of Object.values(device.config.interfaces)) {
        if (!iface.ipv4Address || !iface.ipv4Mask) continue;
        if (iface.ipv4Address !== ip) continue;
        if (!iface.adminUp) continue;
        if (!this.isInterfaceOperUp(device.id, iface.name)) continue;
        out.push({ ep: { deviceId: device.id, interfaceName: iface.name }, mask: iface.ipv4Mask });
      }
    }
    return out;
  }

  private bestRoute(
    device: Device,
    targetIp: string
  ):
    | { kind: "connected"; interfaceName: string; prefixLen: number }
    | { kind: "static"; nextHop: string; prefixLen: number }
    | null {
    let best:
      | { kind: "connected"; interfaceName: string; prefixLen: number }
      | { kind: "static"; nextHop: string; prefixLen: number }
      | null = null;

    for (const iface of Object.values(device.config.interfaces)) {
      if (!iface.adminUp) continue;
      if (!iface.ipv4Address || !iface.ipv4Mask) continue;
      if (!this.isInterfaceOperUp(device.id, iface.name)) continue;
      if (!inSameSubnet(iface.ipv4Address, iface.ipv4Mask, targetIp)) continue;
      const prefixLen = maskToPrefixLen(iface.ipv4Mask) ?? 0;
      if (!best || prefixLen > best.prefixLen) {
        best = { kind: "connected", interfaceName: iface.name, prefixLen };
      }
    }

    for (const sr of device.config.staticRoutes) {
      if (!ipMatchesDestination(targetIp, sr.destination, sr.mask)) continue;
      const prefixLen = maskToPrefixLen(sr.mask) ?? 0;
      if (!best || prefixLen > best.prefixLen) {
        best = { kind: "static", nextHop: sr.nextHop, prefixLen };
      }
    }

    return best;
  }

  private routeToIp(
    fromDeviceId: string,
    targetIp: string,
    maxHops: number,
    visited: Set<string>,
    originSourceIp: string | undefined
  ): { ok: boolean; originSourceIp?: string } {
    if (maxHops <= 0) return { ok: false };
    if (visited.has(fromDeviceId)) return { ok: false };
    visited.add(fromDeviceId);

    const fromDevice = this.devices.get(fromDeviceId);
    if (!fromDevice) return { ok: false };

    const targets = this.findActiveIpEndpoints(targetIp);
    if (targets.length === 0) return { ok: false };

    const best = this.bestRoute(fromDevice, targetIp);
    if (!best) return { ok: false };

    if (best.kind === "connected") {
      for (const srcIface of Object.values(fromDevice.config.interfaces)) {
        if (!srcIface.adminUp) continue;
        if (!srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
        if (!this.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
        if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, targetIp)) continue;

        const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };
        for (const tgt of targets) {
          if (!inSameSubnet(targetIp, tgt.mask, srcIface.ipv4Address)) continue;
          if (this.l2Reachable(srcEp, tgt.ep)) {
            return { ok: true, originSourceIp: originSourceIp ?? srcIface.ipv4Address };
          }
        }
      }

      return { ok: false };
    }

    const nextHopIp = best.nextHop;
    if (ipv4ToInt(nextHopIp) === null) return { ok: false };

    const nextHops = this.findActiveIpEndpoints(nextHopIp);
    if (nextHops.length === 0) return { ok: false };

    for (const srcIface of Object.values(fromDevice.config.interfaces)) {
      if (!srcIface.adminUp) continue;
      if (!srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
      if (!this.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
      if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, nextHopIp)) continue;

      const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };

      for (const nh of nextHops) {
        if (!inSameSubnet(nextHopIp, nh.mask, srcIface.ipv4Address)) continue;
        if (!this.l2Reachable(srcEp, nh.ep)) continue;
        const nextOrigin = originSourceIp ?? srcIface.ipv4Address;
        const hop = this.routeToIp(nh.ep.deviceId, targetIp, maxHops - 1, visited, nextOrigin);
        if (hop.ok) return hop;
      }
    }

    return { ok: false };
  }

  private endpointKey(ep: LinkEndpoint): string {
    return `${ep.deviceId}::${ep.interfaceName}`;
  }

  private endpointAdminUp(ep: LinkEndpoint): boolean {
    const dev = this.devices.get(ep.deviceId);
    if (!dev) return false;
    const iface = dev.config.interfaces[ep.interfaceName];
    return Boolean(iface?.adminUp);
  }

  private findLinkByEndpoint(ep: LinkEndpoint): Link | undefined {
    for (const link of this.links.values()) {
      if (link.a.deviceId === ep.deviceId && link.a.interfaceName === ep.interfaceName) return link;
      if (link.b.deviceId === ep.deviceId && link.b.interfaceName === ep.interfaceName) return link;
    }
    return undefined;
  }

  private physicalNeighbors(ep: LinkEndpoint): LinkEndpoint[] {
    const out: LinkEndpoint[] = [];
    for (const link of this.links.values()) {
      if (link.a.deviceId === ep.deviceId && link.a.interfaceName === ep.interfaceName) {
        out.push(link.b);
      } else if (link.b.deviceId === ep.deviceId && link.b.interfaceName === ep.interfaceName) {
        out.push(link.a);
      }
    }
    return out;
  }

  private l2Reachable(start: LinkEndpoint, goal: LinkEndpoint): boolean {
    const goalKey = this.endpointKey(goal);
    const visited = new Set<string>();
    const queue: LinkEndpoint[] = [start];

    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur) break;
      const curKey = this.endpointKey(cur);

      if (curKey === goalKey) return true;
      if (visited.has(curKey)) continue;
      visited.add(curKey);

      const curDevice = this.devices.get(cur.deviceId);
      if (!curDevice) continue;
      const curIface = curDevice.config.interfaces[cur.interfaceName];
      if (!curIface?.adminUp) continue;

      for (const n of this.physicalNeighbors(cur)) {
        if (!this.endpointAdminUp(n)) continue;
        queue.push(n);
      }

      if (curDevice.type === "switch") {
        for (const iface of Object.values(curDevice.config.interfaces)) {
          if (!iface.adminUp) continue;
          const next: LinkEndpoint = { deviceId: curDevice.id, interfaceName: iface.name };
          if (this.endpointKey(next) === curKey) continue;
          queue.push(next);
        }
      }
    }

    return false;
  }

  reset(): void {
    this.devices.clear();
    this.links.clear();
  }
}
