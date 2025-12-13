import net from "node:net";

import type { Device, DeviceType, Link, LinkEndpoint, StaticRouteConfig } from "../sim/types.js";

type WorldLike = {
  createDevice(input: { id?: string; type?: DeviceType; hostname?: string }): Device;
  getDevice(id: string): Device | undefined;
  listDevices(): Device[];
  listLinks(): Link[];
  exportSnapshot(): { devices: Device[]; links: Link[] };
  importSnapshot(snapshot: { devices: Device[]; links?: Link[] }): void;
  reset(): void;
  isInterfaceOperUp(deviceId: string, interfaceName: string): boolean;
  canPing(fromDeviceId: string, targetIp: string): boolean;
  getLinkPeer(endpoint: LinkEndpoint): LinkEndpoint | null;
};

type JsonRpcId = string | number | null;

type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
};

type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

function asObject(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("Invalid params");
  }
  return params as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid params: ${field}`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid params");
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error("Invalid params");
  return value;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function createNdjsonRpcServer(world: WorldLike): net.Server {
  const handlers: Record<string, RpcHandler> = {
    "health": async () => ({ ok: true, name: "netsim-rpc" }),

    "world.listDevices": async () => ({ devices: world.listDevices() }),
    "world.listLinks": async () => ({ links: world.listLinks() }),
    "world.exportSnapshot": async () => ({ snapshot: world.exportSnapshot() }),

    "world.ensureDevice": async (params) => {
      const p = asObject(params);
      const deviceId = asOptionalString(p.deviceId);
      const type = asOptionalString(p.type) as DeviceType | undefined;
      const hostname = asOptionalString(p.hostname);
      const device = world.createDevice({ id: deviceId, type, hostname });
      return { device };
    },

    "world.getDevice": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const device = world.getDevice(deviceId);
      return { device: device ?? null };
    },

    "world.getLinkPeer": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const interfaceName = asString(p.interfaceName, "interfaceName");
      return { peer: world.getLinkPeer({ deviceId, interfaceName }) };
    },

    "world.isInterfaceOperUp": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const interfaceName = asString(p.interfaceName, "interfaceName");
      return { operUp: world.isInterfaceOperUp(deviceId, interfaceName) };
    },

    "world.canPing": async (params) => {
      const p = asObject(params);
      const fromDeviceId = asString(p.fromDeviceId, "fromDeviceId");
      const targetIp = asString(p.targetIp, "targetIp");
      return { ok: world.canPing(fromDeviceId, targetIp) };
    },

    "device.setHostname": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const hostname = asString(p.hostname, "hostname");

      const device = world.getDevice(deviceId);
      if (!device) throw new Error("Unknown device");

      device.config.hostname = hostname;
      return { ok: true, device };
    },

    "device.setInterface": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const interfaceName = asString(p.interfaceName, "interfaceName");

      const device = world.getDevice(deviceId);
      if (!device) throw new Error("Unknown device");

      const iface = device.config.interfaces[interfaceName] ?? { name: interfaceName, adminUp: false };
      device.config.interfaces[interfaceName] = iface;

      const adminUp = asOptionalBoolean(p.adminUp);
      if (adminUp !== undefined) iface.adminUp = adminUp;

      if (hasOwn(p, "ipv4Address")) {
        const v = p.ipv4Address;
        if (v === null || v === undefined) {
          delete iface.ipv4Address;
        } else {
          iface.ipv4Address = asString(v, "ipv4Address");
        }
      }

      if (hasOwn(p, "ipv4Mask")) {
        const v = p.ipv4Mask;
        if (v === null || v === undefined) {
          delete iface.ipv4Mask;
        } else {
          iface.ipv4Mask = asString(v, "ipv4Mask");
        }
      }

      return { ok: true, device };
    },

    "device.addStaticRoute": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const destination = asString(p.destination, "destination");
      const mask = asString(p.mask, "mask");
      const nextHop = asString(p.nextHop, "nextHop");

      const device = world.getDevice(deviceId);
      if (!device) throw new Error("Unknown device");

      if (!Array.isArray((device.config as any).staticRoutes)) {
        (device.config as any).staticRoutes = [];
      }

      const route: StaticRouteConfig = { destination, mask, nextHop };
      const exists = device.config.staticRoutes.some(
        (r) => r.destination === destination && r.mask === mask && r.nextHop === nextHop
      );
      if (!exists) device.config.staticRoutes.push(route);

      return { ok: true, device };
    },

    "device.removeStaticRoute": async (params) => {
      const p = asObject(params);
      const deviceId = asString(p.deviceId, "deviceId");
      const destination = asString(p.destination, "destination");
      const mask = asString(p.mask, "mask");
      const nextHop = asString(p.nextHop, "nextHop");

      const device = world.getDevice(deviceId);
      if (!device) throw new Error("Unknown device");

      if (!Array.isArray((device.config as any).staticRoutes)) {
        (device.config as any).staticRoutes = [];
      }

      device.config.staticRoutes = device.config.staticRoutes.filter(
        (r) => !(r.destination === destination && r.mask === mask && r.nextHop === nextHop)
      );

      return { ok: true, device };
    }
  };

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");

    let buf = "";
    let chain = Promise.resolve();

    const send = (msg: JsonRpcResponse) => {
      socket.write(JSON.stringify(msg) + "\n");
    };

    const sendError = (id: JsonRpcId, code: number, message: string, data?: unknown) => {
      const error: JsonRpcError = { code, message };
      if (data !== undefined) error.data = data;
      send({ jsonrpc: "2.0", id, error });
    };

    const handleLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let req: JsonRpcRequest;
      try {
        req = JSON.parse(trimmed) as JsonRpcRequest;
      } catch {
        sendError(null, -32700, "Parse error");
        return;
      }

      const hasId = Object.prototype.hasOwnProperty.call(req, "id");
      const id = hasId ? (req.id as JsonRpcId) : undefined;
      const isNotification = id === undefined;

      const method = req.method;
      if (!method || typeof method !== "string") {
        if (!isNotification) sendError(id ?? null, -32600, "Invalid Request");
        return;
      }

      const handler = handlers[method];
      if (!handler) {
        if (!isNotification) sendError(id ?? null, -32601, "Method not found", { method });
        return;
      }

      try {
        const result = await handler(req.params);
        if (!isNotification) send({ jsonrpc: "2.0", id: id ?? null, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        if (!isNotification) sendError(id ?? null, -32603, message);
      }
    };

    socket.on("data", (chunk) => {
      buf += chunk;

      while (true) {
        const nl = buf.indexOf("\n");
        if (nl === -1) break;

        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);

        chain = chain.then(() => handleLine(line));
      }
    });

    socket.on("error", () => {});
  });

  return server;
}
