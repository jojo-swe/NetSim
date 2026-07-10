import {
  deviceCapabilities,
  ipv4ToInt,
  inSameSubnet,
  maskToPrefixLen,
  ipMatchesDestination,
  type Device,
  type LinkEndpoint
} from "@netsim/shared";

import type { ArpStore } from "./arp.js";
import type { L2Engine } from "./l2.js";
import { macForEndpoint } from "./mac.js";

type BestRoute =
  | { kind: "connected"; interfaceName: string; prefixLen: number }
  | { kind: "static"; nextHop: string; prefixLen: number };

type ForwardResult = {
  ok: boolean;
  originSourceIp?: string;
  reachedDeviceId?: string;
  hops: string[];
};

export class RoutingEngine {
  constructor(
    private getDevice: (id: string) => Device | undefined,
    private allDevices: () => Iterable<Device>,
    private l2: L2Engine,
    private arp: ArpStore
  ) {}

  canPing(fromDeviceId: string, targetIp: string): boolean {
    if (ipv4ToInt(targetIp) === null) return false;

    const forward = this.forward(fromDeviceId, targetIp, 8, new Set<string>(), undefined, false);
    if (!forward.ok || !forward.originSourceIp || !forward.reachedDeviceId) return false;

    const reverse = this.forward(forward.reachedDeviceId, forward.originSourceIp, 8, new Set<string>(), undefined, false);
    return reverse.ok;
  }

  traceRoute(fromDeviceId: string, targetIp: string): { ok: boolean; hops: string[] } {
    if (ipv4ToInt(targetIp) === null) return { ok: false, hops: [] };
    const result = this.forward(fromDeviceId, targetIp, 8, new Set<string>(), undefined, true);
    return { ok: result.ok, hops: result.hops };
  }

  private findActiveIpEndpoints(ip: string): Array<{ ep: LinkEndpoint; mask: string }> {
    const out: Array<{ ep: LinkEndpoint; mask: string }> = [];
    for (const device of this.allDevices()) {
      for (const iface of Object.values(device.config.interfaces)) {
        if (!iface.ipv4Address || !iface.ipv4Mask) continue;
        if (iface.ipv4Address !== ip) continue;
        if (!iface.adminUp) continue;
        if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;
        out.push({ ep: { deviceId: device.id, interfaceName: iface.name }, mask: iface.ipv4Mask });
      }
    }
    return out;
  }

  private bestRoute(device: Device, targetIp: string): BestRoute | null {
    let best: BestRoute | null = null;

    for (const iface of Object.values(device.config.interfaces)) {
      if (!iface.adminUp) continue;
      if (!iface.ipv4Address || !iface.ipv4Mask) continue;
      if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;
      if (!inSameSubnet(iface.ipv4Address, iface.ipv4Mask, targetIp)) continue;
      const prefixLen = maskToPrefixLen(iface.ipv4Mask) ?? 0;
      if (!best || prefixLen > best.prefixLen) {
        best = { kind: "connected", interfaceName: iface.name, prefixLen };
      }
    }

    const nextHopReachable = (nextHop: string): boolean => {
      if (ipv4ToInt(nextHop) === null) return false;
      for (const iface of Object.values(device.config.interfaces)) {
        if (!iface.adminUp) continue;
        if (!iface.ipv4Address || !iface.ipv4Mask) continue;
        if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;
        if (!inSameSubnet(iface.ipv4Address, iface.ipv4Mask, nextHop)) continue;
        return true;
      }
      return false;
    };

    for (const sr of device.config.staticRoutes) {
      if (!ipMatchesDestination(targetIp, sr.destination, sr.mask)) continue;
      if (!nextHopReachable(sr.nextHop)) continue;
      const prefixLen = maskToPrefixLen(sr.mask) ?? 0;
      if (!best || prefixLen > best.prefixLen) {
        best = { kind: "static", nextHop: sr.nextHop, prefixLen };
      }
    }

    const dg = device.config.defaultGateway;
    if (dg && nextHopReachable(dg)) {
      const prefixLen = 0;
      if (!best) {
        best = { kind: "static", nextHop: dg, prefixLen };
      }
    }

    return best;
  }

  private forward(
    fromDeviceId: string,
    targetIp: string,
    maxHops: number,
    visited: Set<string>,
    originSourceIp: string | undefined,
    trackHops: boolean
  ): ForwardResult {
    if (maxHops <= 0) return { ok: false, hops: [] };
    if (visited.has(fromDeviceId)) return { ok: false, hops: [] };
    visited.add(fromDeviceId);

    const fromDevice = this.getDevice(fromDeviceId);
    if (!fromDevice) return { ok: false, hops: [] };

    if (originSourceIp && !deviceCapabilities(fromDevice.type).canRouteL3) return { ok: false, hops: [] };

    const targets = this.findActiveIpEndpoints(targetIp);
    if (targets.length === 0) return { ok: false, hops: [] };

    const best = this.bestRoute(fromDevice, targetIp);
    if (!best) return { ok: false, hops: [] };

    if (best.kind === "connected") {
      for (const srcIface of Object.values(fromDevice.config.interfaces)) {
        if (!srcIface.adminUp) continue;
        if (!srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
        if (!this.l2.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
        if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, targetIp)) continue;

        const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };
        for (const tgt of targets) {
          if (!inSameSubnet(targetIp, tgt.mask, srcIface.ipv4Address)) continue;
          if (this.l2.l2Reachable(srcEp, tgt.ep)) {
            this.arp.learn(fromDevice.id, targetIp, macForEndpoint(tgt.ep), srcIface.name);
            this.arp.learn(tgt.ep.deviceId, srcIface.ipv4Address, macForEndpoint(srcEp), tgt.ep.interfaceName);
            return {
              ok: true,
              originSourceIp: originSourceIp ?? srcIface.ipv4Address,
              reachedDeviceId: tgt.ep.deviceId,
              hops: trackHops ? [targetIp] : []
            };
          }
        }
      }

      return { ok: false, hops: [] };
    }

    const nextHopIp = best.nextHop;
    if (ipv4ToInt(nextHopIp) === null) return { ok: false, hops: [] };

    const nextHops = this.findActiveIpEndpoints(nextHopIp);
    if (nextHops.length === 0) return { ok: false, hops: [] };

    let bestPartial: ForwardResult | null = null;

    for (const srcIface of Object.values(fromDevice.config.interfaces)) {
      if (!srcIface.adminUp) continue;
      if (!srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
      if (!this.l2.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
      if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, nextHopIp)) continue;

      const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };

      for (const nh of nextHops) {
        if (!inSameSubnet(nextHopIp, nh.mask, srcIface.ipv4Address)) continue;
        if (!this.l2.l2Reachable(srcEp, nh.ep)) continue;

        this.arp.learn(fromDevice.id, nextHopIp, macForEndpoint(nh.ep), srcIface.name);
        this.arp.learn(nh.ep.deviceId, srcIface.ipv4Address, macForEndpoint(srcEp), nh.ep.interfaceName);

        const nextOrigin = originSourceIp ?? srcIface.ipv4Address;
        const hop = this.forward(nh.ep.deviceId, targetIp, maxHops - 1, new Set(visited), nextOrigin, trackHops);

        if (trackHops) {
          const hops = [nextHopIp, ...hop.hops];

          if (hop.ok) {
            return {
              ok: true,
              originSourceIp: hop.originSourceIp ?? nextOrigin,
              reachedDeviceId: hop.reachedDeviceId,
              hops
            };
          }

          if (!bestPartial || hops.length > bestPartial.hops.length) {
            bestPartial = {
              ok: false,
              originSourceIp: hop.originSourceIp ?? nextOrigin,
              reachedDeviceId: hop.reachedDeviceId,
              hops
            };
          }
        } else {
          if (hop.ok) return hop;
        }
      }
    }

    if (trackHops && bestPartial) {
      return bestPartial;
    }

    return { ok: false, hops: [] };
  }
}
