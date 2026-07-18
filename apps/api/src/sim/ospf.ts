import {
  inSameSubnet,
  maskToPrefixLen,
  networkAddress,
  type Device,
  type Link,
  type LinkEndpoint
} from "@netsim/shared";

import type { L2Engine } from "./l2.js";

export type OspfNeighborState = "down" | "init" | "two-way" | "full";

export type OspfNeighbor = {
  localDeviceId: string;
  localInterface: string;
  neighborDeviceId: string;
  neighborInterface: string;
  area: number;
  cost: number;
  state: OspfNeighborState;
};

export type OspfLsa = {
  advertisingRouter: string;
  sequence: number;
  area: number;
  links: Array<{ neighborRouter: string; cost: number }>;
  prefixes: Array<{ network: string; mask: string; cost: number }>;
};

export type OspfRoute = {
  destination: string;
  mask: string;
  nextHop: string;
  outgoingInterface: string;
  metric: number;
  area: number;
  learnedFrom: string;
};

export type OspfSnapshot = {
  routerId: string;
  processId: number;
  neighbors: OspfNeighbor[];
  lsdb: OspfLsa[];
  routes: OspfRoute[];
};

type EnabledInterface = {
  deviceId: string;
  routerId: string;
  processId: number;
  area: number;
  interfaceName: string;
  address: string;
  mask: string;
  network: string;
  cost: number;
};

type Edge = {
  from: string;
  to: string;
  cost: number;
  localInterface: string;
  remoteInterface: string;
  nextHop: string;
  area: number;
};

function wildcardToMask(wildcard: string): string | null {
  const parts = wildcard.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.map((part) => 255 - part).join(".");
}

function interfaceMatchesNetwork(
  address: string,
  statement: { network: string; wildcard: string }
): boolean {
  const mask = wildcardToMask(statement.wildcard);
  return mask !== null && inSameSubnet(statement.network, mask, address);
}

function stableRouterId(device: Device): string {
  const configured = device.config.ospf?.routerId;
  if (configured) return configured;

  const addresses = Object.values(device.config.interfaces)
    .map((iface) => iface.ipv4Address)
    .filter((value): value is string => Boolean(value))
    .sort();
  return addresses.at(-1) ?? device.id;
}

function prefixKey(network: string, mask: string): string {
  return `${network}/${maskToPrefixLen(mask) ?? 0}`;
}

export class OspfEngine {
  constructor(
    private getDevice: (id: string) => Device | undefined,
    private allDevices: () => Iterable<Device>,
    private allLinks: () => Iterable<Link>,
    private l2: L2Engine
  ) {}

  getSnapshot(deviceId: string): OspfSnapshot | null {
    const device = this.getDevice(deviceId);
    if (!device?.config.ospf?.enabled) return null;

    const topology = this.buildTopology();
    const routerId = stableRouterId(device);
    return {
      routerId,
      processId: device.config.ospf.processId,
      neighbors: topology.neighbors.filter((neighbor) => neighbor.localDeviceId === deviceId),
      lsdb: topology.lsdb,
      routes: this.computeRoutes(deviceId, topology.interfaces, topology.edges)
    };
  }

  getRoutes(deviceId: string): OspfRoute[] {
    const topology = this.buildTopology();
    return this.computeRoutes(deviceId, topology.interfaces, topology.edges);
  }

  private enabledInterfaces(): EnabledInterface[] {
    const out: EnabledInterface[] = [];
    for (const device of this.allDevices()) {
      const ospf = device.config.ospf;
      if (!ospf?.enabled) continue;

      for (const iface of Object.values(device.config.interfaces)) {
        if (!iface.adminUp || !iface.ipv4Address || !iface.ipv4Mask) continue;
        if (!this.l2.isInterfaceOperUp(device.id, iface.name)) continue;

        const statement = ospf.networks.find((candidate) =>
          interfaceMatchesNetwork(iface.ipv4Address!, candidate)
        );
        if (!statement) continue;

        out.push({
          deviceId: device.id,
          routerId: stableRouterId(device),
          processId: ospf.processId,
          area: statement.area,
          interfaceName: iface.name,
          address: iface.ipv4Address,
          mask: iface.ipv4Mask,
          network: networkAddress(iface.ipv4Address, iface.ipv4Mask) ?? iface.ipv4Address,
          cost: Math.max(1, Math.trunc(iface.ospfCost ?? 1))
        });
      }
    }
    return out;
  }

  private buildTopology(): {
    interfaces: EnabledInterface[];
    edges: Edge[];
    neighbors: OspfNeighbor[];
    lsdb: OspfLsa[];
  } {
    const interfaces = this.enabledInterfaces();
    const byEndpoint = new Map<string, EnabledInterface>();
    for (const iface of interfaces) {
      byEndpoint.set(`${iface.deviceId}:${iface.interfaceName}`, iface);
    }

    const edges: Edge[] = [];
    const neighbors: OspfNeighbor[] = [];

    for (const link of this.allLinks()) {
      const a = byEndpoint.get(`${link.a.deviceId}:${link.a.interfaceName}`);
      const b = byEndpoint.get(`${link.b.deviceId}:${link.b.interfaceName}`);
      if (!a || !b) continue;
      if (a.area !== b.area) continue;
      if (!inSameSubnet(a.address, a.mask, b.address)) continue;
      if (!inSameSubnet(b.address, b.mask, a.address)) continue;

      edges.push({
        from: a.deviceId,
        to: b.deviceId,
        cost: a.cost,
        localInterface: a.interfaceName,
        remoteInterface: b.interfaceName,
        nextHop: b.address,
        area: a.area
      });
      edges.push({
        from: b.deviceId,
        to: a.deviceId,
        cost: b.cost,
        localInterface: b.interfaceName,
        remoteInterface: a.interfaceName,
        nextHop: a.address,
        area: b.area
      });

      neighbors.push({
        localDeviceId: a.deviceId,
        localInterface: a.interfaceName,
        neighborDeviceId: b.deviceId,
        neighborInterface: b.interfaceName,
        area: a.area,
        cost: a.cost,
        state: "full"
      });
      neighbors.push({
        localDeviceId: b.deviceId,
        localInterface: b.interfaceName,
        neighborDeviceId: a.deviceId,
        neighborInterface: a.interfaceName,
        area: b.area,
        cost: b.cost,
        state: "full"
      });
    }

    const routerSequence = new Map<string, number>();
    const lsdb: OspfLsa[] = [];
    for (const device of this.allDevices()) {
      if (!device.config.ospf?.enabled) continue;
      const deviceInterfaces = interfaces.filter((iface) => iface.deviceId === device.id);
      const deviceEdges = edges.filter((edge) => edge.from === device.id);
      const routerId = stableRouterId(device);
      const sequence = (routerSequence.get(routerId) ?? 0x80000000) + 1;
      routerSequence.set(routerId, sequence);

      const prefixes = new Map<string, { network: string; mask: string; cost: number }>();
      for (const iface of deviceInterfaces) {
        prefixes.set(prefixKey(iface.network, iface.mask), {
          network: iface.network,
          mask: iface.mask,
          cost: iface.cost
        });
      }

      lsdb.push({
        advertisingRouter: routerId,
        sequence,
        area: deviceInterfaces[0]?.area ?? 0,
        links: deviceEdges
          .map((edge) => ({
            neighborRouter: stableRouterId(this.getDevice(edge.to)!),
            cost: edge.cost
          }))
          .sort((x, y) => x.neighborRouter.localeCompare(y.neighborRouter)),
        prefixes: [...prefixes.values()].sort((x, y) =>
          prefixKey(x.network, x.mask).localeCompare(prefixKey(y.network, y.mask))
        )
      });
    }

    neighbors.sort((a, b) =>
      `${a.localDeviceId}:${a.localInterface}:${a.neighborDeviceId}`.localeCompare(
        `${b.localDeviceId}:${b.localInterface}:${b.neighborDeviceId}`
      )
    );
    lsdb.sort((a, b) => a.advertisingRouter.localeCompare(b.advertisingRouter));
    return { interfaces, edges, neighbors, lsdb };
  }

  private computeRoutes(
    sourceDeviceId: string,
    interfaces: EnabledInterface[],
    edges: Edge[]
  ): OspfRoute[] {
    const source = this.getDevice(sourceDeviceId);
    if (!source?.config.ospf?.enabled) return [];

    const distances = new Map<string, number>([[sourceDeviceId, 0]]);
    const firstHop = new Map<string, Edge>();
    const visited = new Set<string>();
    const routerIds = new Map<string, string>();
    for (const device of this.allDevices()) routerIds.set(device.id, stableRouterId(device));

    while (true) {
      let current: string | null = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const [deviceId, distance] of distances) {
        if (visited.has(deviceId)) continue;
        if (distance < currentDistance) {
          current = deviceId;
          currentDistance = distance;
        } else if (
          distance === currentDistance &&
          current !== null &&
          (routerIds.get(deviceId) ?? deviceId) < (routerIds.get(current) ?? current)
        ) {
          current = deviceId;
        }
      }
      if (current === null) break;
      visited.add(current);

      for (const edge of edges.filter((candidate) => candidate.from === current)) {
        if (visited.has(edge.to)) continue;
        const candidateDistance = currentDistance + edge.cost;
        const existing = distances.get(edge.to) ?? Number.POSITIVE_INFINITY;
        const inheritedFirstHop = current === sourceDeviceId ? edge : firstHop.get(current);
        if (!inheritedFirstHop) continue;

        const shouldReplace =
          candidateDistance < existing ||
          (candidateDistance === existing &&
            inheritedFirstHop.nextHop < (firstHop.get(edge.to)?.nextHop ?? "~"));
        if (shouldReplace) {
          distances.set(edge.to, candidateDistance);
          firstHop.set(edge.to, inheritedFirstHop);
        }
      }
    }

    const connected = new Set(
      interfaces
        .filter((iface) => iface.deviceId === sourceDeviceId)
        .map((iface) => prefixKey(iface.network, iface.mask))
    );
    const bestByPrefix = new Map<string, OspfRoute>();

    for (const iface of interfaces) {
      if (iface.deviceId === sourceDeviceId) continue;
      const routeFirstHop = firstHop.get(iface.deviceId);
      const distance = distances.get(iface.deviceId);
      if (!routeFirstHop || distance === undefined) continue;

      const key = prefixKey(iface.network, iface.mask);
      if (connected.has(key)) continue;

      const candidate: OspfRoute = {
        destination: iface.network,
        mask: iface.mask,
        nextHop: routeFirstHop.nextHop,
        outgoingInterface: routeFirstHop.localInterface,
        metric: distance + iface.cost,
        area: iface.area,
        learnedFrom: iface.routerId
      };
      const existing = bestByPrefix.get(key);
      if (
        !existing ||
        candidate.metric < existing.metric ||
        (candidate.metric === existing.metric && candidate.nextHop < existing.nextHop)
      ) {
        bestByPrefix.set(key, candidate);
      }
    }

    return [...bestByPrefix.values()].sort((a, b) => {
      const prefixDiff = (maskToPrefixLen(b.mask) ?? 0) - (maskToPrefixLen(a.mask) ?? 0);
      if (prefixDiff !== 0) return prefixDiff;
      const destinationDiff = a.destination.localeCompare(b.destination);
      if (destinationDiff !== 0) return destinationDiff;
      return a.metric - b.metric;
    });
  }
}
