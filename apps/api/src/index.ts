import http from "node:http";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";

import { CliSession } from "./cli/cliSession.js";
import { createNdjsonRpcServer } from "./rpc/ndjsonRpcServer.js";
import { labs, validateLab } from "./labs/index.js";
import type { DeviceType, Link } from "./sim/types.js";
import { World } from "./sim/world.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const RPC_PORT = Number(process.env.NETSIM_RPC_PORT ?? 3002);
const RPC_HOST = "127.0.0.1";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

const world = new World();

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, name: "netsim-api" });
});

app.get("/api/devices", (_req: Request, res: Response) => {
  res.json({ devices: world.listDevices() });
});

app.get("/api/labs", (_req: Request, res: Response) => {
  res.json({ labs });
});

app.post("/api/labs/:labId/validate", (req: Request, res: Response) => {
  const labId = req.params.labId;
  const result = validateLab(labId, world);
  if (!result) {
    res.status(404).json({ error: "Unknown lab" });
    return;
  }
  res.json({ result });
});

app.post("/api/devices", (req: Request, res: Response) => {
  const body = req.body as { id?: string; type?: DeviceType; hostname?: string };
  const device = world.createDevice({ id: body?.id, type: body?.type, hostname: body?.hostname });
  res.status(201).json({ device });
});

app.post("/api/world/reset", (_req: Request, res: Response) => {
  world.reset();
  res.json({ ok: true });
});

app.get("/api/links", (_req: Request, res: Response) => {
  res.json({ links: world.listLinks() });
});

function allocateInterfaceName(deviceId: string): string {
  for (let i = 0; i < 32; i++) {
    const name = `GigabitEthernet0/${i}`;
    const peer = world.getLinkPeer({ deviceId, interfaceName: name });
    if (!peer) return name;
  }
  return `GigabitEthernet0/${Math.floor(Math.random() * 1000) + 32}`;
}

app.post("/api/links", (req: Request, res: Response) => {
  const body = req.body as {
    a?: { deviceId?: string; interfaceName?: string };
    b?: { deviceId?: string; interfaceName?: string };
  };

  const aDeviceId = body?.a?.deviceId;
  const bDeviceId = body?.b?.deviceId;

  if (!aDeviceId || !bDeviceId) {
    res.status(400).json({ error: "Invalid link endpoints" });
    return;
  }

  const aIf = body.a?.interfaceName ?? allocateInterfaceName(aDeviceId);
  const bIf = body.b?.interfaceName ?? allocateInterfaceName(bDeviceId);

  try {
    const link = world.createLink({
      a: { deviceId: aDeviceId, interfaceName: aIf },
      b: { deviceId: bDeviceId, interfaceName: bIf }
    });
    res.status(201).json({ link });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create link";
    res.status(400).json({ error: message });
  }
});

app.delete("/api/links/:id", (req: Request, res: Response) => {
  const ok = world.deleteLink(req.params.id);
  res.json({ ok });
});

app.get("/api/world/snapshot", (_req: Request, res: Response) => {
  res.json({ snapshot: world.exportSnapshot() });
});

app.post("/api/world/snapshot", (req: Request, res: Response) => {
  const body = req.body as { snapshot?: { devices?: unknown; links?: unknown } };
  if (!body?.snapshot || !Array.isArray(body.snapshot.devices)) {
    res.status(400).json({ error: "Invalid snapshot" });
    return;
  }
  world.importSnapshot(body.snapshot as { devices: unknown[]; links?: Link[] } as any);
  res.json({ ok: true });
});

const server = http.createServer(app);
const rpcServer = createNdjsonRpcServer(world);

const wss = new WebSocketServer({ server, path: "/ws/cli" });

wss.on("connection", (ws: WebSocket) => {
  let session: CliSession | undefined;
  let rawLineBuf = "";
  let inputMode: "json" | "raw" = "json";

  const sendOutput = (data: string) => {
    ws.send(JSON.stringify({ type: "output", data }));
  };

  const handleLine = (line: string) => {
    if (!session) {
      sendOutput("\n% Not attached to a device.\n");
      return;
    }
    const result = session.executeLine(line);
    const combined = `${result.output}${result.prompt ? result.prompt : ""}`;
    sendOutput(combined.startsWith("\n") ? combined : `\n${combined}`);
    if (!result.prompt) {
      ws.close();
    }
  };

  const handleRawInput = (chunk: string) => {
    for (const ch of chunk) {
      if (ch === "\r" || ch === "\n") {
        const toSend = rawLineBuf;
        rawLineBuf = "";
        handleLine(toSend);
        continue;
      }
      if (ch === "\u007f") {
        if (rawLineBuf.length > 0) {
          rawLineBuf = rawLineBuf.slice(0, -1);
        }
        continue;
      }
      if (ch >= " ") {
        rawLineBuf += ch;
      }
    }
  };

  const rawDataToString = (data: unknown): string => {
    if (typeof data === "string") return data;
    if (Buffer.isBuffer(data)) return data.toString("utf8");
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
    return String(data);
  };

  ws.send(JSON.stringify({ type: "info", message: "NetSim CLI connected" }));

  ws.on("message", (data: unknown) => {
    const text = rawDataToString(data);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (inputMode === "raw") {
        handleRawInput(text);
        return;
      }
      sendOutput("\n% Error parsing client message.\n");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      if (inputMode === "raw") {
        handleRawInput(text);
        return;
      }
      sendOutput("\n% Error parsing client message.\n");
      return;
    }

    const msg = parsed as any;

    if (msg.type === "mode") {
      if (msg.mode === "raw") inputMode = "raw";
      if (msg.mode === "json") inputMode = "json";
      return;
    }

    if (msg.type === "attach") {
      const deviceId = typeof msg.deviceId === "string" ? msg.deviceId.trim() : "";
      if (!deviceId) {
        sendOutput("\n% Invalid device id.\n");
        return;
      }
      const upper = deviceId.toUpperCase();
      let type: DeviceType = "router";
      if (upper.startsWith("L3SW")) type = "l3switch";
      else if (upper.startsWith("SW")) type = "switch";
      else if (upper.startsWith("FW")) type = "firewall";
      else if (upper.startsWith("SRV")) type = "server";
      else if (upper.startsWith("CLOUD")) type = "cloud";
      else if (upper.startsWith("H")) type = "host";
      const device = world.createDevice({ id: deviceId, type });
      session = new CliSession(device, world);
      sendOutput(`\n${session.getPrompt()}`);
      return;
    }

    if (msg.type === "input") {
      const line = typeof msg.line === "string" ? msg.line : "";
      handleLine(line);
      return;
    }

    if (msg.type === "complete") {
      const line = typeof msg.line === "string" ? msg.line : "";
      if (!session) {
        ws.send(JSON.stringify({ type: "complete", insert: "", candidates: [], prompt: "" }));
        return;
      }
      const result = session.complete(line);
      ws.send(
        JSON.stringify({
          type: "complete",
          insert: result.insert,
          candidates: result.candidates,
          prompt: result.prompt
        })
      );
      return;
    }

    if (msg.type === "raw") {
      const chunk = typeof msg.data === "string" ? msg.data : "";
      handleRawInput(chunk);
    }
  });
});

rpcServer.on("error", (err) => {
  console.error("netsim-rpc error", err);
});

if (Number.isFinite(RPC_PORT) && RPC_PORT > 0) {
  rpcServer.listen(RPC_PORT, RPC_HOST, () => {
    console.log(`netsim-rpc listening on tcp://${RPC_HOST}:${RPC_PORT}`);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`netsim-api listening on http://${HOST}:${PORT}`);
});

const shutdownRpc = () => {
  if (!rpcServer.listening) return;
  rpcServer.close();
};

process.on("SIGINT", shutdownRpc);
process.on("SIGTERM", shutdownRpc);
