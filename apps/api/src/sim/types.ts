export type DeviceType = "router" | "switch" | "host" | "l3switch" | "firewall" | "server" | "cloud";

export type PortKind = "rj45" | "sfp";

export type CableType = "copper_straight" | "copper_crossover" | "fiber";

export type DeviceCapabilities = {
  canBridgeL2: boolean;
  canRouteL3: boolean;
  defaultAdminUp: boolean;
  defaultHostname: string;
};

export function deviceCapabilities(type: DeviceType): DeviceCapabilities {
  switch (type) {
    case "router":
      return { canBridgeL2: false, canRouteL3: true, defaultAdminUp: false, defaultHostname: "Router" };
    case "switch":
      return { canBridgeL2: true, canRouteL3: false, defaultAdminUp: true, defaultHostname: "Switch" };
    case "host":
      return { canBridgeL2: false, canRouteL3: false, defaultAdminUp: true, defaultHostname: "Host" };
    case "l3switch":
      return { canBridgeL2: true, canRouteL3: true, defaultAdminUp: true, defaultHostname: "L3Switch" };
    case "firewall":
      return { canBridgeL2: false, canRouteL3: true, defaultAdminUp: false, defaultHostname: "Firewall" };
    case "server":
      return { canBridgeL2: false, canRouteL3: false, defaultAdminUp: true, defaultHostname: "Server" };
    case "cloud":
      return { canBridgeL2: false, canRouteL3: true, defaultAdminUp: true, defaultHostname: "Cloud" };
  }
}

export type InterfaceName = string;

export type DevicePort = {
  name: InterfaceName;
  kind: PortKind;
};

function rangePorts(prefix: string, start: number, count: number, kind: PortKind): DevicePort[] {
  const ports: DevicePort[] = [];
  for (let i = start; i < start + count; i++) {
    ports.push({ name: `${prefix}${i}`, kind });
  }
  return ports;
}

export function devicePorts(type: DeviceType): DevicePort[] {
  // We keep interface names IOS-ish (GigabitEthernet0/x) across device types.
  // Port kinds are used for validating cable media (RJ45 vs SFP).
  switch (type) {
    case "switch":
      return [...rangePorts("GigabitEthernet0/", 0, 24, "rj45"), ...rangePorts("GigabitEthernet0/", 24, 4, "sfp")];
    case "l3switch":
      return [...rangePorts("GigabitEthernet0/", 0, 24, "rj45"), ...rangePorts("GigabitEthernet0/", 24, 4, "sfp")];
    case "router":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "firewall":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "server":
      return [...rangePorts("GigabitEthernet0/", 0, 2, "rj45")];
    case "host":
      return [...rangePorts("GigabitEthernet0/", 0, 1, "rj45")];
    case "cloud":
      return [...rangePorts("GigabitEthernet0/", 0, 8, "rj45"), ...rangePorts("GigabitEthernet0/", 8, 2, "sfp")];
  }
}

export function devicePortKind(type: DeviceType, interfaceName: InterfaceName): PortKind | null {
  const p = devicePorts(type).find((x) => x.name === interfaceName);
  return p?.kind ?? null;
}

export function deviceIsMdix(type: DeviceType): boolean {
  // For cable selection: switches are traditionally MDI-X; endpoints/routers are MDI.
  // This is intentionally simplified.
  return type === "switch" || type === "l3switch";
}

export interface LinkEndpoint {
  deviceId: string;
  interfaceName: InterfaceName;
}

export interface Link {
  id: string;
  a: LinkEndpoint;
  b: LinkEndpoint;
  cableType: CableType;
}

export interface StaticRouteConfig {
  destination: string;
  mask: string;
  nextHop: string;
}

export interface InterfaceConfig {
  name: InterfaceName;
  description?: string;
  adminUp: boolean;
  ipv4Address?: string;
  ipv4Mask?: string;
}

export interface DeviceConfig {
  hostname: string;
  interfaces: Record<InterfaceName, InterfaceConfig>;
  staticRoutes: StaticRouteConfig[];
  defaultGateway?: string;
}

export interface Device {
  id: string;
  type: DeviceType;
  config: DeviceConfig;
}
