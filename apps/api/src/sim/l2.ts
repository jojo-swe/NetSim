import {
  deviceCapabilities,
  type Device,
  type Link,
  type LinkEndpoint
} from "@netsim/shared";

export class L2Engine {
  constructor(
    private getDevice: (id: string) => Device | undefined,
    private links: Map<string, Link>
  ) {}

  private endpointKey(ep: LinkEndpoint): string {
    return `${ep.deviceId}::${ep.interfaceName}`;
  }

  private endpointAdminUp(ep: LinkEndpoint): boolean {
    const dev = this.getDevice(ep.deviceId);
    if (!dev) return false;
    const iface = dev.config.interfaces[ep.interfaceName];
    return Boolean(iface?.adminUp);
  }

  findLinkByEndpoint(ep: LinkEndpoint): Link | undefined {
    for (const link of this.links.values()) {
      if (link.a.deviceId === ep.deviceId && link.a.interfaceName === ep.interfaceName) return link;
      if (link.b.deviceId === ep.deviceId && link.b.interfaceName === ep.interfaceName) return link;
    }
    return undefined;
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
    const device = this.getDevice(deviceId);
    if (!device) return false;
    const iface = device.config.interfaces[interfaceName];
    if (!iface?.adminUp) return false;

    const peer = this.getLinkPeer({ deviceId, interfaceName });
    if (!peer) return false;
    const peerDevice = this.getDevice(peer.deviceId);
    if (!peerDevice) return false;
    const peerIface = peerDevice.config.interfaces[peer.interfaceName];
    if (!peerIface?.adminUp) return false;

    return true;
  }

  physicalNeighbors(ep: LinkEndpoint): LinkEndpoint[] {
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

  l2Reachable(start: LinkEndpoint, goal: LinkEndpoint): boolean {
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

      const curDevice = this.getDevice(cur.deviceId);
      if (!curDevice) continue;
      const curIface = curDevice.config.interfaces[cur.interfaceName];
      if (!curIface?.adminUp) continue;

      for (const n of this.physicalNeighbors(cur)) {
        if (!this.endpointAdminUp(n)) continue;
        queue.push(n);
      }

      if (deviceCapabilities(curDevice.type).canBridgeL2) {
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
}
