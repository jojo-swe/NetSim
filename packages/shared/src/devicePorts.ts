import type { DeviceType, DevicePort, PortKind } from "./types.js";

export function rangePorts(prefix: string, start: number, count: number, kind: PortKind): DevicePort[] {
  const ports: DevicePort[] = [];
  for (let i = start; i < start + count; i++) {
    ports.push({ name: `${prefix}${i}`, kind });
  }
  return ports;
}

export function devicePorts(type: DeviceType): DevicePort[] {
  switch (type) {
    case "switch":
      return [...rangePorts("GigabitEthernet0/", 0, 48, "rj45"), ...rangePorts("GigabitEthernet0/", 48, 4, "sfp")];
    case "l3switch":
      return [...rangePorts("GigabitEthernet0/", 0, 48, "rj45"), ...rangePorts("GigabitEthernet0/", 48, 4, "sfp")];
    case "router":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "firewall":
      return [...rangePorts("GigabitEthernet0/", 0, 4, "rj45"), ...rangePorts("GigabitEthernet0/", 4, 2, "sfp")];
    case "server":
      return [...rangePorts("GigabitEthernet0/", 0, 2, "rj45")];
    case "host":
      return [...rangePorts("GigabitEthernet0/", 0, 1, "rj45")];
    case "pc":
      return [...rangePorts("GigabitEthernet0/", 0, 1, "rj45")];
    case "cloud":
      return [...rangePorts("GigabitEthernet0/", 0, 8, "rj45"), ...rangePorts("GigabitEthernet0/", 8, 2, "sfp")];
  }
}

export function devicePortKind(type: DeviceType, interfaceName: string): PortKind | null {
  const p = devicePorts(type).find((x) => x.name === interfaceName);
  return p?.kind ?? null;
}

export function deviceIsMdix(type: DeviceType): boolean {
  return type === "switch" || type === "l3switch";
}
