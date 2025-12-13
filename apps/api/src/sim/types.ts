export type DeviceType = "router" | "switch" | "host";

export type InterfaceName = string;

export interface LinkEndpoint {
  deviceId: string;
  interfaceName: InterfaceName;
}

export interface Link {
  id: string;
  a: LinkEndpoint;
  b: LinkEndpoint;
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
