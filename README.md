# NetSim

[![CI](https://github.com/jojo-swe/NetSim/actions/workflows/ci.yml/badge.svg)](https://github.com/jojo-swe/NetSim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-27%20passing-brightgreen.svg)](#testing)

NetSim is a CCNA-first, lab-driven **network simulator** with an IOS-like CLI and a modern drag-and-drop topology UI.

Built for students and professionals who want to practice Cisco-style networking labs without proprietary firmware or expensive hardware.

## Features

- **Drag-and-drop topology editor** powered by React Flow
- **IOS-like CLI** over WebSocket with mode-aware commands (exec, privileged, config, interface)
- **Realistic simulation** — ARP, L2 forwarding, static routing, ping with return-path verification
- **Cable types** — copper straight/crossover, fiber with compatibility validation
- **Per-interface management** — admin up/down, IPv4 addressing, link status indicators
- **Lab system** — save/load/export labs as JSON, validate topologies with actionable feedback
- **In-browser terminal** powered by xterm.js
- **Deterministic mode** for reproducible labs and tests

## Roadmap

- Dynamic routing protocols (OSPF, BGP)
- VLAN and trunk configuration
- ACLs and NAT
- Lab sharing and community labs
- C-based CLI sidecar via NDJSON RPC

## Non-goals

NetSim is a **simulator**, not an emulator. It does not ship proprietary Cisco images or firmware. IOS-like syntax is implemented incrementally with a focus on CCNA/CCNP lab commands.

## Quick Start (Local)

### Prerequisites

- **Node.js** 20+
- **npm** 10+ (ships with Node 20)

### Install and run

```bash
git clone https://github.com/jojo-swe/NetSim.git
cd NetSim
npm install
npm run dev
```

Then open:

- **Web UI**: <http://localhost:5173>
- **API health check**: <http://localhost:3001/api/health>

## CLI Interfaces

NetSim exposes an IOS-like CLI over a WebSocket endpoint, and a localhost-only TCP RPC endpoint for CLI sidecar integration.

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

## Quick Start (Docker)

```bash
docker compose up --build
```

Open <http://localhost:5173> in your browser.

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

- [**SPEC.md**](docs/SPEC.md) — Feature specification (220+ items)
- [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) — Architecture overview and module structure
- [**CHANGELOG.md**](CHANGELOG.md) — Release history
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — Contribution guide and standards

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and the pull request process.

## License

This project is licensed under the [MIT License](LICENSE).
