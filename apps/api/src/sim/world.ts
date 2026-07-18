import { randomUUID } from "node:crypto";
import {
  deviceCapabilities,
  deviceIsMdix,
  devicePortKind,
  type Device,
  type DeviceType,
  type InterfaceConfig,
  type CableType,
  type Link,
  type LinkEndpoint,
  type OspfConfig
} from "@netsim/shared";

import { ArpStore } from "./arp.js";
import { EventBus } from "./eventBus.js";
import { L2Engine } from "./l2.js";
import { OspfEngine, type OspfSnapshot } from "./ospf.js";
import { RoutingEngine } from "./routing.js";

function ensureInterfaceDefaults(name: string, adminUp: boolean): InterfaceConfig {
  return { name, adminUp };
}

function resolveCableType(
  cableType: CableType,
  a: { deviceType: DeviceType; interfaceName: string },
  b: { deviceType: DeviceType; interfaceName: string }
): Exclude<CableType, "auto"> {
  const aKind = devicePortKind(a.deviceType, a.interfaceName) ?? "rj45";
  const bKind = devicePortKind(b.deviceType, b.interfaceName) ?? "rj45";
  if (cableType !== "auto") return cableType;
  if (aKind === "sfp" || bKind === "sfp") return "fiber";
  return deviceIsMdix(a.deviceType) === deviceIsMdix(b.deviceType)
    ? "copper_crossover"
    : "copper_straight";
}

function validateCableType(
  cableType: Exclude<CableType, "auto">,
  a: { deviceType: DeviceType; interfaceName: string },
  b: { deviceType: DeviceType; interfaceName: string }
): void {
  const aKind = devicePortKind(a.deviceType, a.interfaceName) ?? "rj45";
  const bKind = devicePortKind(b.deviceType, b.interfaceName) ?? "rj45";
  if (cableType === "fiber") {
    if (aKind !== "sfp" || bKind !== "sfp") {
      throw new Error("Fiber cable requires SFP ports on both ends");
    }
    return;
  }
  if (aKind !== "rj45" || bKind !== "rj45") {
    throw new Error("Copper cable requires RJ45 ports on both ends");
  }
  const sameRole = deviceIsMdix(a.deviceType) === deviceIsMdix(b.deviceType);
  if (cableType === "copper_straight" && sameRole) {
    throw new Error("Straight-through cable requires one MDI and one MDI-X port");
  }
  if (cableType === "copper_crossover" && !sameRole) {
    throw new Error("Crossover cable requires both ends to be MDI or both ends to be MDI-X");
  }
}

export class World {
  private devices = new Map<string, Device>();
  private links = new Map<string, Link>();
  private arp = new ArpStore();
  private eventBus = new EventBus();
  private l2 = new L2Engine(
    (id) => this.devices.get(id),
    this.links
  );
  private ospf = new OspfEngine(
    (id) => this.devices.get(id),
    () => this.devices.values(),
    () => this.links.values(),
    this.l2
  );
  private routing = new RoutingEngine(
    (id) => this.devices.get(id),
    () => this.devices.values(),
    this.l2,
    this.arp,
    (deviceId) => this.ospf.getRoutes(deviceId)
  );

  getEventBus(): EventBus {
    return this.eventBus;
  }

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
    this.arp.clear();
    for (const device of snapshot.devices) {
      const cloned = JSON.parse(JSON.stringify(device)) as Device;
      if (!Array.isArray(cloned.config.staticRoutes)) cloned.config.staticRoutes = [];
      if (cloned.config.ospf && !Array.isArray(cloned.config.ospf.networks)) {
        cloned.config.ospf.networks = [];
      }
      this.devices.set(device.id, cloned);
      this.arp.ensureDevice(device.id);
    }
    for (const link of snapshot.links ?? []) {
      const cloned = JSON.parse(JSON.stringify(link)) as Link;
      if (!cloned.cableType) cloned.cableType = "auto";
      this.links.set(link.id, cloned);
    }
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  createDevice(input: { id?: string; type?: DeviceType; hostname?: string }): Device {
    const id = input.id ?? randomUUID();
    const type: DeviceType = input.type ?? "router";
    const existing = this.devices.get(id);
    if (existing) {
      this.arp.ensureDevice(id);
      return existing;
    }

    const capabilities = deviceCapabilities(type);
    const device: Device = {
      id,
      type,
      config: {
        hostname: input.hostname ?? (type === "pc" ? id : capabilities.defaultHostname),
        staticRoutes: [],
        interfaces: {
          "GigabitEthernet0/0": ensureInterfaceDefaults(
            "GigabitEthernet0/0",
            capabilities.defaultAdminUp
          ),
          "GigabitEthernet0/1": ensureInterfaceDefaults(
            "GigabitEthernet0/1",
            capabilities.defaultAdminUp
          )
        }
      }
    };
    this.devices.set(id, device);
    this.arp.ensureDevice(id);
    this.eventBus.emit({ type: "device:created", deviceId: id, deviceType: type });
    return device;
  }

  configureOspf(deviceId: string, config: OspfConfig | undefined): void {
    const device = this.getDevice(deviceId);
    if (!device) throw new Error(`Unknown device: ${deviceId}`);
    if (!deviceCapabilities(device.type).canRouteL3) {
      throw new Error(`Device ${deviceId} cannot run OSPF`);
    }
    device.config.ospf = config
      ? {
          enabled: config.enabled,
          processId: Math.max(1, Math.trunc(config.processId)),
          routerId: config.routerId,
          networks: config.networks.map((network) => ({
            network: network.network,
            wildcard: network.wildcard,
            area: Math.max(0, Math.trunc(network.area))
          }))
        }
      : undefined;
  }

  getOspfSnapshot(deviceId: string): OspfSnapshot | null {
    return this.ospf.getSnapshot(deviceId);
  }

  createLink(input: { id?: string; a: LinkEndpoint; b: LinkEndpoint; cableType?: CableType }): Link {
    if (input.a.deviceId === input.b.deviceId && input.a.interfaceName === input.b.interfaceName) {
      throw new Error("Invalid link endpoints");
    }
    const aDevice = this.getDevice(input.a.deviceId) ?? this.createDevice({ id: input.a.deviceId });
    const bDevice = this.getDevice(input.b.deviceId) ?? this.createDevice({ id: input.b.deviceId });
    if (!aDevice.config.interfaces[input.a.interfaceName]) {
      aDevice.config.interfaces[input.a.interfaceName] = ensureInterfaceDefaults(
        input.a.interfaceName,
        deviceCapabilities(aDevice.type).defaultAdminUp
      );
    }
    if (!bDevice.config.interfaces[input.b.interfaceName]) {
      bDevice.config.interfaces[input.b.interfaceName] = ensureInterfaceDefaults(
        input.b.interfaceName,
        deviceCapabilities(bDevice.type).defaultAdminUp
      );
    }
    if (this.l2.findLinkByEndpoint(input.a) || this.l2.findLinkByEndpoint(input.b)) {
      throw new Error("Interface already connected");
    }

    const resolvedCableType = resolveCableType(
      input.cableType ?? "auto",
      { deviceType: aDevice.type, interfaceName: input.a.interfaceName },
      { deviceType: bDevice.type, interfaceName: input.b.interfaceName }
    );
    validateCableType(
      resolvedCableType,
      { deviceType: aDevice.type, interfaceName: input.a.interfaceName },
      { deviceType: bDevice.type, interfaceName: input.b.interfaceName }
    );

    const link: Link = {
      id: input.id ?? randomUUID(),
      a: { ...input.a },
      b: { ...input.b },
      cableType: resolvedCableType
    };
    this.links.set(link.id, link);
    this.eventBus.emit({ type: "link:created", linkId: link.id });
    return link;
  }

  deleteLink(id: string): boolean {
    const deleted = this.links.delete(id);
    if (deleted) this.eventBus.emit({ type: "link:deleted", linkId: id });
    return deleted;
  }

  getLinkPeer(endpoint: LinkEndpoint): LinkEndpoint | null {
    return this.l2.getLinkPeer(endpoint);
  }

  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean {
    return this.l2.isInterfaceOperUp(deviceId, interfaceName);
  }

  canPing(fromDeviceId: string, targetIp: string): boolean {
    return this.routing.canPing(fromDeviceId, targetIp);
  }

  traceRoute(fromDeviceId: string, targetIp: string): { ok: boolean; hops: string[] } {
    return this.routing.traceRoute(fromDeviceId, targetIp);
  }

  getArpTable(
    deviceId: string
  ): Array<{ ip: string; mac: string; interfaceName: string; ageMinutes: number }> {
    return this.arp.getTable(deviceId);
  }

  deleteArpEntry(deviceId: string, ip: string): boolean {
    return this.arp.deleteEntry(deviceId, ip);
  }

  flushArpTable(deviceId: string, interfaceName?: string): number {
    return this.arp.flush(deviceId, interfaceName);
  }

  reset(): void {
    this.devices.clear();
    this.links.clear();
    this.arp.clear();
  }
}
