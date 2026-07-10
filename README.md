# NetSim

NetSim is a CCNA-first, lab-driven **network simulator** with an IOS-like CLI and a modern drag-and-drop topology UI.

Goals:

- Practice CCNA/CCNP-style labs with realistic workflows.
- Use Cisco-like configuration modes and commands (incrementally implemented).
- Save/share labs and run validations with hints.

## Roadmap (near-term)

- Interface-level link attachment (choose ports, not just devices).
- Cable types (copper straight/crossover, fiber) with compatibility validation.
- Visual link status (up/down) and per-interface state indicators.

Non-goals:

- Shipping proprietary Cisco images/firmware. NetSim is a simulator. If later we add “real image” integration, you’ll provide the images yourself.

## Quick start (local)

Prereqs:

- Node.js 20+

Run:

- `npm install`
- `npm run dev`

Then open:

- Web UI: `http://localhost:5173`
- API: `http://localhost:3001/api/health`

## CLI interfaces

NetSim exposes an IOS-like CLI over a WebSocket endpoint, and a localhost-only TCP RPC endpoint intended for a future C-based CLI sidecar.

- **WebSocket CLI**: `ws://localhost:3001/ws/cli`
  - Backwards compatible JSON protocol:
    - `{ "type": "attach", "deviceId": "R1" }`
    - `{ "type": "input", "line": "show running-config" }`
  - Optional raw keystroke mode:
    - `{ "type": "mode", "mode": "raw" }`
    - then send text frames containing keystrokes (e.g. `enable\r`)
    - or send `{ "type": "raw", "data": "enable\r" }`

- **Local TCP NDJSON RPC (sidecar)**: `tcp://127.0.0.1:3002`
  - Config: set `NETSIM_RPC_PORT` to override the port (set to `0` to disable).
  - Wire format: newline-delimited JSON (NDJSON), JSON-RPC-ish request/response.
  - Methods:
    - `health`
    - `world.listDevices`, `world.listLinks`, `world.exportSnapshot`
    - `world.ensureDevice`, `world.getDevice`, `world.getLinkPeer`
    - `world.isInterfaceOperUp`, `world.canPing`
    - `device.setHostname`, `device.setInterface`
    - `device.addStaticRoute`, `device.removeStaticRoute`

### CLI smoke tests

WebSocket (JSON protocol) using `wscat`:

- `npx wscat -c ws://localhost:3001/ws/cli`
- Send:
  - `{ "type": "attach", "deviceId": "R1" }`
  - `{ "type": "input", "line": "enable" }`
  - `{ "type": "input", "line": "show running-config" }`

RPC health check using netcat (if available):

- `echo {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"health\"} | nc 127.0.0.1 3002`

RPC health check using PowerShell:

- `$tcp = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 3002)`
- `$stream = $tcp.GetStream()`
- `$writer = New-Object System.IO.StreamWriter($stream)`
- `$writer.AutoFlush = $true`
- `$writer.WriteLine('{"jsonrpc":"2.0","id":1,"method":"health"}')`
- `$reader = New-Object System.IO.StreamReader($stream)`
- `$reader.ReadLine()`
- `$tcp.Close()`

## Quick start (Docker)

- `docker compose up --build`

Open:

- Web UI: `http://localhost:5173`

## Repo layout

- `apps/api`: simulation engine + IOS-like CLI over WebSocket/HTTP
  - `src/sim/`: modular sim engine (`world.ts` facade, `arp.ts`, `l2.ts`, `routing.ts`, `mac.ts`, `eventBus.ts`)
  - `src/regression/`: Vitest regression tests (next-hop reachability, cable compatibility)
- `apps/web`: React UI (drag/drop topology + in-browser terminal)
  - `src/components/`: extracted UI components (`PortsPanel`, `LinkWizard`, `CableLegend`)
  - `src/hooks/`: custom React hooks (`useLocalStorage`, `useDevices`, `useLabs`, `useDeviceCreation`)
  - `src/utils/`: utility modules (`cableUtils`, `portUtils`)
  - `src/api.ts`: centralized API client
  - `src/types.ts`: shared web types and helpers
- `packages/shared`: shared types and utilities (`@netsim/shared`)
  - `src/types.ts`: device/port/cable type definitions
  - `src/ipUtils.ts`: IPv4 parsing, subnet checks, mask conversion
  - `src/devicePorts.ts`: per-device-type port definitions
- `docs`: spec, architecture, and process docs

## Testing

All packages use [Vitest](https://vitest.dev/) for testing.

Run all tests:

```bash
npm test
```

Run per-package:

```bash
# Shared package (14 unit tests)
cd packages/shared && npx vitest run

# API package (11 regression tests)
cd apps/api && npx vitest run

# Web package (2 smoke tests)
cd apps/web && npx vitest run
```

CI runs automatically via GitHub Actions (`.github/workflows/ci.yml`).

## Documentation

- `docs/SPEC.md` (200+ feature specification)
- `docs/ARCHITECTURE.md`
- `CHANGELOG.md`
