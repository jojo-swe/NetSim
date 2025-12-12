import http from "node:http";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";

import { CliSession } from "./cli/cliSession.js";
import { labs, validateLab } from "./labs/index.js";
import type { DeviceType, Link } from "./sim/types.js";
import { World } from "./sim/world.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

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

const wss = new WebSocketServer({ server, path: "/ws/cli" });

wss.on("connection", (ws: WebSocket) => {
  let session: CliSession | undefined;

  ws.send(JSON.stringify({ type: "info", message: "NetSim CLI connected" }));

  ws.on("message", (data: unknown) => {
    try {
      const msg = JSON.parse(String(data)) as
        | { type: "attach"; deviceId: string }
        | { type: "input"; line: string };

      if (msg.type === "attach") {
        const device = world.createDevice({ id: msg.deviceId, type: "router" });
        session = new CliSession(device, world);
        ws.send(JSON.stringify({ type: "output", data: `\n${session.getPrompt()}` }));
        return;
      }

      if (msg.type === "input") {
        if (!session) {
          ws.send(JSON.stringify({ type: "output", data: "\n% Not attached to a device.\n" }));
          return;
        }
        const result = session.executeLine(msg.line);
        const combined = `${result.output}${result.prompt ? result.prompt : ""}`;
        ws.send(JSON.stringify({ type: "output", data: combined.startsWith("\n") ? combined : `\n${combined}` }));
        if (!result.prompt) {
          ws.close();
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "output", data: "\n% Error parsing client message.\n" }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`netsim-api listening on http://${HOST}:${PORT}`);
});
