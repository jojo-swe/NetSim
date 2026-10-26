# NetSim

[![CI](https://github.com/jojo-swe/NetSim/actions/workflows/ci.yml/badge.svg)](https://github.com/jojo-swe/NetSim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

NetSim is a CCNA-first, lab-driven **network simulator** with an IOS-like CLI and a modern drag-and-drop topology UI.

Built for students and professionals who want to practice Cisco-style networking labs without proprietary firmware or expensive hardware.

## Features

- **Drag-and-drop topology editor** powered by React Flow
- **IOS-like CLI** over WebSocket with mode-aware commands (exec, privileged, config, interface, router)
- **Linux-style shell** for PC devices
- **Realistic simulation** — ARP, L2 forwarding, static routing, ping with return-path verification
- **OSPF single-area** — adjacencies, link-state database, SPF and AD 110 routes, configured from the CLI (`router ospf`, `network … area`, `ip ospf cost`, `show ip ospf neighbor`)
- **Cable types** — copper straight/crossover, fiber with compatibility validation
- **Per-interface management** — admin up/down, IPv4 addressing, link status indicators
- **Lab system** — save/load/export labs as JSON, validate topologies with actionable feedback
- **Lab verifier** — grade JSON labs from the command line or CI (see below)
- **In-browser terminal** powered by xterm.js
- **Deterministic forwarding** and sorted `show` output, so tests and labs are reproducible

### CLI example

```text
R1>enable
R1#configure terminal
R1(config)#interface g0/0
R1(config-if)#ip address 10.12.0.1 255.255.255.252
R1(config-if)#no shutdown
R1(config-if)#exit
R1(config)#router ospf 1
R1(config-router)#router-id 1.1.1.1
R1(config-router)#network 10.0.0.0 0.255.255.255 area 0
R1(config-router)#end
R1#show ip ospf neighbor
Neighbor ID     Pri   State           Address         Interface
2.2.2.2         1     FULL/  -        10.12.0.2       GigabitEthernet0/0
R1#show ip route
Codes: C - connected, S - static, O - OSPF

Gateway of last resort is not set

C    10.12.0.0/30 is directly connected, GigabitEthernet0/0
O    10.23.0.0/30 [110/11] via 10.12.0.2, GigabitEthernet0/0
```

## Roadmap

- BGP
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
npm run build -w @netsim/shared
npm run dev
```

The shared package must be built before `npm run dev` or `npm test`; both apps import its compiled output. Rebuild it after changing anything under `packages/shared/src`.

Then open:

- **Web UI**: <http://localhost:5173>
- **API health check**: <http://localhost:3001/api/health>

### Environment variables

| Variable | App | Default | Purpose |
|---|---|---|---|
| `PORT` | api | `3001` | HTTP and WebSocket port |
| `HOST` | api | `0.0.0.0` | Bind address |
| `NETSIM_RPC_PORT` | api | `3002` | Local NDJSON RPC port (`0` disables) |
| `VITE_API_ORIGIN` | web | `http://localhost:3001` | REST API origin |
| `VITE_WS_ORIGIN` | web | `ws://localhost:3001` | WebSocket CLI origin |

## REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/devices` | List devices |
| `POST` | `/api/devices` | Create a device |
| `POST` | `/api/devices/:id/interface` | Update an interface |
| `GET` | `/api/links` | List links |
| `POST` | `/api/links` | Create a link |
| `DELETE` | `/api/links/:id` | Delete a link |
| `GET` | `/api/labs` | List built-in labs |
| `POST` | `/api/labs/:id/validate` | Validate the current world against a built-in lab |
| `GET` | `/api/world/snapshot` | Export the world |
| `POST` | `/api/world/snapshot` | Import a world |
| `POST` | `/api/world/reset` | Reset the world |

## Lab verifier

JSON lab files describe a topology plus assertions (`deviceExists`, `hostname`, `interfaceUp`, `ping`, `ospfNeighbor`) and can be graded without the UI, which makes them easy to run in CI:

```bash
npm run lab:check -- examples/basic-connectivity.lab.json
npm run lab:check -- examples/ospf-three-routers.lab.json --json
```

Exit code is `0` when every assertion passes, `1` when any fails, and `2` for an invalid file. See [docs/LAB_VERIFIER.md](docs/LAB_VERIFIER.md).

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

The Docker setup is not exercised in CI and may lag behind the local setup.

## Repo layout

- `apps/api`: simulation engine + IOS-like CLI over WebSocket/HTTP
  - `src/sim/`: modular sim engine (`world.ts` facade, `arp.ts`, `l2.ts`, `routing.ts`, `ospf.ts`, `mac.ts`, `eventBus.ts`)
  - `src/cli/`: IOS-like CLI (`cliSession.ts`) and the Linux-style shell for PCs (`linuxSession.ts`)
  - `src/labs/`: built-in validated labs and the JSON lab verifier (`runner.ts`, `cli.ts`)
  - `src/regression/`: Vitest regression tests (next-hop reachability, cable compatibility, OSPF)
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
- `examples/`: JSON labs for the lab verifier
- `labs/`: lab topology files
- `docs`: spec, architecture, lab verifier, and process docs

## Testing

All packages use [Vitest](https://vitest.dev/) for testing. Build the shared package first:

```bash
npm run build -w @netsim/shared
npm test
```

Run per-package:

```bash
npm run test:shared
npm run test:api
npm run test:web
```

CI runs automatically via GitHub Actions (`.github/workflows/ci.yml`): build, type-check, tests, and the example labs.

## Documentation

- [**SPEC.md**](docs/SPEC.md) — Feature specification (220+ items)
- [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) — Architecture overview and module structure
- [**LAB_VERIFIER.md**](docs/LAB_VERIFIER.md) — JSON lab format and assertions
- [**AGENTS.md**](AGENTS.md) — Build order, layout, and code conventions in one page
- [**CHANGELOG.md**](CHANGELOG.md) — Release history
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — Contribution guide and standards

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and the pull request process.

## License

This project is licensed under the [MIT License](LICENSE).
