# Contributing to NetSim

Thank you for your interest in contributing to NetSim! This document outlines the process and standards for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Architecture Rules](#architecture-rules)
- [Simulation Correctness](#simulation-correctness)
- [Testing Standards](#testing-standards)
- [CLI Standards](#cli-standards)
- [Web Frontend Standards](#web-frontend-standards)
- [Change Management](#change-management)
- [Security](#security)
- [Definition of Done](#definition-of-done)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

Be respectful, constructive, and welcoming. We're building a tool for learning networking — help others learn too.

## Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** 10+ (ships with Node 20)
- **Git**

### Setup

```bash
git clone https://github.com/jojo-swe/NetSim.git
cd NetSim
npm install
```

### Run the development servers

```bash
npm run dev
```

This starts both the API server and the web UI concurrently:

- **Web UI**: http://localhost:5173
- **API**: http://localhost:3001/api/health

### Run tests

```bash
# All packages
npm test

# Per-package
npm run test:shared   # 14 unit tests (IP utilities)
npm run test:api      # 11 regression tests (routing, cables)
npm run test:web      # 2 smoke tests (shared re-exports)
```

### Type checking

```bash
npx tsc -p packages/shared/tsconfig.json --noEmit
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
```

## Development Workflow

1. **Fork** the repository and create your branch from `main`.
2. **Write tests first** for bug fixes — a regression test that fails before your fix and passes after.
3. **Make small, coherent commits** — one behavioral change per commit when possible.
4. **Ensure all tests and type checks pass** before pushing.
5. **Open a pull request** with a clear description of what and why.

## Project Structure

```
netsim/
├── apps/
│   ├── api/                    # Simulation engine + IOS-like CLI
│   │   ├── src/
│   │   │   ├── sim/            # Core simulation (world, ARP, L2, routing, MAC, events)
│   │   │   ├── cli/            # CLI command parsing and modes
│   │   │   ├── rpc/            # NDJSON RPC endpoint (localhost-only)
│   │   │   ├── labs/           # Lab storage and validation
│   │   │   ├── regression/     # Vitest regression tests
│   │   │   └── index.ts        # Express + WebSocket transport wiring
│   │   └── tsconfig.json
│   └── web/                    # React UI (topology editor + terminal)
│       ├── src/
│       │   ├── components/      # Extracted UI components (PortsPanel, LinkWizard, CableLegend)
│       │   ├── hooks/           # Custom React hooks (useDevices, useLabs, useDeviceCreation, useLocalStorage)
│       │   ├── utils/           # Utility modules (cableUtils, portUtils)
│       │   ├── api.ts           # Centralized API client
│       │   ├── types.ts         # Web-specific types
│       │   ├── App.tsx          # Root component + React Flow canvas
│       │   ├── DeviceNode.tsx   # Custom React Flow node
│       │   ├── DevicePalette.tsx
│       │   ├── LabControls.tsx
│       │   └── FloatingTerminal.tsx
│       └── tsconfig.json
├── packages/
│   └── shared/                 # @netsim/shared — shared types and utilities
│       ├── src/
│       │   ├── types.ts         # Device/port/cable type definitions
│       │   ├── ipUtils.ts       # IPv4 parsing, subnet checks, mask conversion
│       │   ├── devicePorts.ts   # Per-device-type port definitions
│       │   └── ipUtils.test.ts  # Unit tests
│       └── tsconfig.json
├── docs/
│   ├── SPEC.md                 # Feature specification (220+ items)
│   └── ARCHITECTURE.md         # Architecture overview
├── .github/workflows/ci.yml    # GitHub Actions CI
└── .windsurf/rules/rules.md    # AI-assisted development rules
```

## Architecture Rules

### Separation of Concerns

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Simulation truth | `apps/api/src/sim/*` | Devices, links, interfaces, ARP, routing |
| CLI command parsing | `apps/api/src/cli/*` | User intent → sim calls + output formatting |
| Transport adapters | `apps/api/src/index.ts`, `apps/api/src/rpc/*` | HTTP, WebSocket, NDJSON RPC |
| UI state | `apps/web/src/*` | Topology rendering, terminal, lab management |

### Authoritative State

The **World** (sim state owner) is the single authoritative place for devices, links, interface state, ARP, and routing behavior. The UI must not predict outcomes the sim hasn't confirmed — optimistic rendering that can be rolled back is acceptable.

## Simulation Correctness

These rules have the **highest priority**.

### Fidelity Over Convenience

If behavior differs between a real device and a simplified model, implement the real rule unless you explicitly document the simplification in `docs/SPEC.md` or `docs/ARCHITECTURE.md`.

### Forwarding Rules

Define clear invariants for:

- Which devices can forward transit traffic (routers vs. hosts/switches)
- Next-hop reachability requirements
- ARP/neighbor resolution behavior during forwarding and local delivery

### Determinism

- Use deterministic MAC/interface identifiers and stable ordering so tests and labs are reproducible
- Avoid `Math.random()` in sim logic unless it is seeded and controlled

### Input Validation

Parse and validate IPs, masks, interface names, and device IDs at the CLI/RPC boundary. The sim core should be resilient, but invalid commands must be rejected before mutating state.

## Testing Standards

### Regression Tests

- When you fix a bug, add a regression test that **fails before the fix and passes after**
- Prefer scenario-driven tests (topology + config + expected pings/traces)
- Most critical correctness tests belong in `apps/api/src/regression/*`

### Deterministic Tests

- Ensure ordering and generated identifiers are stable
- Test the sim core, not the UI

### Running Tests

```bash
npm test                                    # All packages
npx vitest run --coverage                   # With coverage report
```

## CLI Standards

### Mode-Aware Commands

- Commands must respect current mode (exec, privileged, config, interface)
- Tab completion must only suggest commands valid in the current mode

### Idempotency

- `no <cmd>` should cleanly revert configuration without leaving partial state
- `show` commands must never mutate sim state

### Output Stability

Keep `show` outputs deterministic (sorted interfaces/routes/ARP entries) so tests and labs don't flap.

## Web Frontend Standards

### Backend is Authoritative

The UI renders topology and device state, but the backend decides behavior (ping/traceroute, ARP learning, routes).

### ReactFlow Data

- Store nodes and edges with stable IDs
- Avoid embedding large derived state inside node data if it can be derived from a central store

### Performance

- Avoid re-rendering the full graph on terminal keystrokes
- Memoize heavy node components (`DeviceNode`) and keep props stable

### Terminal UX

- Treat terminal input as a stream; avoid coupling UI state tightly to transport
- If supporting both JSON-framed input and raw mode, ensure mode transitions are explicit and reversible

## Change Management

### Commits

- **Small, coherent commits**: one behavioral change per commit when possible
- **No drive-by refactors**: do not rename/move modules during feature work unless it directly supports the feature
- **Document intentional deviations**: if you simplify compared to real networking, record it in `docs/SPEC.md` or `docs/ARCHITECTURE.md`

### Backwards Compatibility

- If you change RPC payloads, version them or add fields non-breakingly
- Keep old fields until the web app is updated
- Lab files must carry a schema version; add new fields backwards-compatibly

## Security

- Keep NDJSON RPC bound to **localhost only** unless you add authentication
- **Never** execute shell commands from CLI input
- Treat lab JSON and any external inputs as untrusted
- Never throw raw errors over RPC/WS; convert to structured `{ ok: false, error }` responses

## Definition of Done

A change is complete when all of the following are satisfied:

- [ ] **Correctness**: Sim behavior matches expected real-world behavior for the feature scope
- [ ] **Tests**: Added/updated regression test(s) for the scenario
- [ ] **UX**: CLI output and UI state updates are consistent and deterministic
- [ ] **Compatibility**: RPC/UI changes are coordinated; no silent breaking changes
- [ ] **Performance**: No obvious O(N²) blowups in graph rendering or sim forwarding loops
- [ ] **Type check**: `tsc --noEmit` passes for all packages
- [ ] **Tests pass**: `npm test` is green

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Ensure all tests and type checks pass
3. Write a clear PR description:
   - **What** changed
   - **Why** it changed
   - **How** it was tested
4. Link any related issues
5. Request review when ready

For bug fixes, include a regression test in the same PR.

For new features, consider opening an issue first to discuss the approach.

---

By contributing, you agree that your contributions will be licensed under the MIT License.
