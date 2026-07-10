export type DeviceType = "router" | "switch" | "host" | "pc" | "l3switch" | "firewall" | "server" | "cloud";

export type PortKind = "rj45" | "sfp";

export type CableType = "auto" | "copper_straight" | "copper_crossover" | "fiber";

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
    case "pc":
      return { canBridgeL2: false, canRouteL3: false, defaultAdminUp: true, defaultHostname: "PC" };
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
