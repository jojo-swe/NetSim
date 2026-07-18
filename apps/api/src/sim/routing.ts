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
import type { OspfRoute } from "./ospf.js";

type BestRoute =
  | { kind: "connected"; interfaceName: string; prefixLen: number; distance: 0; metric: 0 }
  | { kind: "static"; nextHop: string; prefixLen: number; distance: 1; metric: 0 }
  | { kind: "ospf"; nextHop: string; prefixLen: number; distance: 110; metric: number };

type ForwardResult = {
  ok: boolean;
  originSourceIp?: string;
  reachedDeviceId?: string;
  hops: string[];
};

function routeIsBetter(candidate: BestRoute, current: BestRoute | null): boolean {
  if (!current) return true;
  if (candidate.prefixLen !== current.prefixLen) return candidate.prefixLen > current.prefixLen;
  if (candidate.distance !== current.distance) return candidate.distance < current.distance;
  return candidate.metric < current.metric;
}

export class RoutingEngine {
  constructor(
    private getDevice: (id: string) => Device | undefined,
    private allDevices: () => Iterable<Device>,
    private l2: L2Engine,
    private arp: ArpStore,
    private getOspfRoutes: (deviceId: string) => OspfRoute[] = () => []
  ) {}

  canPing(fromDeviceId: string, targetIp: string): boolean {
    if (ipv4ToInt(targetIp) === null) return false;
    const forward = this.forward(fromDeviceId, targetIp, 32, new Set<string>(), undefined, false);
    if (!forward.ok || !forward.originSourceIp || !forward.reachedDeviceId) return false;
    const reverse = this.forward(
      forward.reachedDeviceId,
      forward.originSourceIp,
      32,
      new Set<string>(),
      undefined,
      false
    );
    return reverse.ok;
  }

  traceRoute(fromDeviceId: string, targetIp: string): { ok: boolean; hops: string[] } {
    if (ipv4ToInt(targetIp) === null) return { ok: false, hops: [] };
    const result = this.forward(fromDeviceId, targetIp, 32, new Set<string>(), undefined, true);
    return { ok: result.ok, hops: result.hops };
  }

  private findActiveIpEndpoints(ip: string): Array<{ ep: LinkEndpoint; mask: string }> {
    const out: Array<{ ep: LinkEndpoint; mask: string }> = [];
    for (const device of this.allDevices()) {
      for (const iface of Object.values(device.config.interfaces)) {
        if (!iface.ipv4Address || !iface.ipv4Mask || !iface.adminUp) continue;
        if (iface.ipv4Address !== ip) continue;
        if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;
        out.push({ ep: { deviceId: device.id, interfaceName: iface.name }, mask: iface.ipv4Mask });
      }
    }
    return out;
  }

  private nextHopReachable(device: Device, nextHop: string): boolean {
    if (ipv4ToInt(nextHop) === null) return false;
    return Object.values(device.config.interfaces).some(
      (iface) =>
        iface.adminUp &&
        Boolean(iface.ipv4Address) &&
        Boolean(iface.ipv4Mask) &&
        this.l2.isInterfaceOperUp(device.id, iface.name) &&
        inSameSubnet(iface.ipv4Address!, iface.ipv4Mask!, nextHop)
    );
  }

  private bestRoute(device: Device, targetIp: string): BestRoute | null {
    let best: BestRoute | null = null;

    for (const iface of Object.values(device.config.interfaces)) {
      if (!iface.adminUp || !iface.ipv4Address || !iface.ipv4Mask) continue;
      if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;
      if (!inSameSubnet(iface.ipv4Address, iface.ipv4Mask, targetIp)) continue;
      const candidate: BestRoute = {
        kind: "connected",
        interfaceName: iface.name,
        prefixLen: maskToPrefixLen(iface.ipv4Mask) ?? 0,
        distance: 0,
        metric: 0
      };
      if (routeIsBetter(candidate, best)) best = candidate;
    }

    for (const route of device.config.staticRoutes) {
      if (!ipMatchesDestination(targetIp, route.destination, route.mask)) continue;
      if (!this.nextHopReachable(device, route.nextHop)) continue;
      const candidate: BestRoute = {
        kind: "static",
        nextHop: route.nextHop,
        prefixLen: maskToPrefixLen(route.mask) ?? 0,
        distance: 1,
        metric: 0
      };
      if (routeIsBetter(candidate, best)) best = candidate;
    }

    for (const route of this.getOspfRoutes(device.id)) {
      if (!ipMatchesDestination(targetIp, route.destination, route.mask)) continue;
      if (!this.nextHopReachable(device, route.nextHop)) continue;
      const candidate: BestRoute = {
        kind: "ospf",
        nextHop: route.nextHop,
        prefixLen: maskToPrefixLen(route.mask) ?? 0,
        distance: 110,
        metric: route.metric
      };
      if (routeIsBetter(candidate, best)) best = candidate;
    }

    const defaultGateway = device.config.defaultGateway;
    if (defaultGateway && this.nextHopReachable(device, defaultGateway)) {
      const candidate: BestRoute = {
        kind: "static",
        nextHop: defaultGateway,
        prefixLen: 0,
        distance: 1,
        metric: 0
      };
      if (routeIsBetter(candidate, best)) best = candidate;
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
    if (maxHops <= 0 || visited.has(fromDeviceId)) return { ok: false, hops: [] };
    visited.add(fromDeviceId);

    const fromDevice = this.getDevice(fromDeviceId);
    if (!fromDevice) return { ok: false, hops: [] };
    if (originSourceIp && !deviceCapabilities(fromDevice.type).canRouteL3) {
      return { ok: false, hops: [] };
    }

    const targets = this.findActiveIpEndpoints(targetIp);
    if (targets.length === 0) return { ok: false, hops: [] };
    const best = this.bestRoute(fromDevice, targetIp);
    if (!best) return { ok: false, hops: [] };

    if (best.kind === "connected") {
      for (const srcIface of Object.values(fromDevice.config.interfaces)) {
        if (!srcIface.adminUp || !srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
        if (!this.l2.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
        if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, targetIp)) continue;
        const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };
        for (const target of targets) {
          if (!inSameSubnet(targetIp, target.mask, srcIface.ipv4Address)) continue;
          if (!this.l2.l2Reachable(srcEp, target.ep)) continue;
          this.arp.learn(fromDevice.id, targetIp, macForEndpoint(target.ep), srcIface.name);
          this.arp.learn(
            target.ep.deviceId,
            srcIface.ipv4Address,
            macForEndpoint(srcEp),
            target.ep.interfaceName
          );
          return {
            ok: true,
            originSourceIp: originSourceIp ?? srcIface.ipv4Address,
            reachedDeviceId: target.ep.deviceId,
            hops: trackHops ? [targetIp] : []
          };
        }
      }
      return { ok: false, hops: [] };
    }

    const nextHopIp = best.nextHop;
    const nextHops = this.findActiveIpEndpoints(nextHopIp);
    if (nextHops.length === 0) return { ok: false, hops: [] };
    let bestPartial: ForwardResult | null = null;

    for (const srcIface of Object.values(fromDevice.config.interfaces)) {
      if (!srcIface.adminUp || !srcIface.ipv4Address || !srcIface.ipv4Mask) continue;
      if (!this.l2.isInterfaceOperUp(fromDevice.id, srcIface.name)) continue;
      if (!inSameSubnet(srcIface.ipv4Address, srcIface.ipv4Mask, nextHopIp)) continue;
      const srcEp: LinkEndpoint = { deviceId: fromDevice.id, interfaceName: srcIface.name };

      for (const nextHop of nextHops) {
        if (!inSameSubnet(nextHopIp, nextHop.mask, srcIface.ipv4Address)) continue;
        if (!this.l2.l2Reachable(srcEp, nextHop.ep)) continue;
        this.arp.learn(fromDevice.id, nextHopIp, macForEndpoint(nextHop.ep), srcIface.name);
        this.arp.learn(
          nextHop.ep.deviceId,
          srcIface.ipv4Address,
          macForEndpoint(srcEp),
          nextHop.ep.interfaceName
        );

        const nextOrigin = originSourceIp ?? srcIface.ipv4Address;
        const hop = this.forward(
          nextHop.ep.deviceId,
          targetIp,
          maxHops - 1,
          new Set(visited),
          nextOrigin,
          trackHops
        );
        if (!trackHops && hop.ok) return hop;

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
        }
      }
    }

    return trackHops && bestPartial ? bestPartial : { ok: false, hops: [] };
  }
}
