# Architecture

## Summary

NetSim is a CCNA-first network simulator with a modern GUI and an IOS-like CLI.

The design goal is to start simple (L1/L2/L3 basics + lab validation) while keeping the codebase **module-friendly** so higher-level features (OSPF/BGP, VRF, IPsec/IKE, DMVPN/FlexVPN, AAA/RADIUS/ISE, SD-WAN, DNS, etc.) can be added without rewriting core components.

## Components

### 1) Web app (`apps/web`)

Responsibilities:

- Drag-and-drop topology editor
- Device inventory and properties UI
- Embedded terminal per device
- Lab management UI (save/load/export)
- Lab validation UI (score, hints, diffs)

Interfaces:

- HTTP (REST) to manage labs/topologies
- WebSocket for interactive CLI sessions

### 2) API + Simulation engine (`apps/api`)

Responsibilities:

- Authoritative world state:
  - Devices, interfaces, links
  - Addressing, admin state, (later) L2 domains
  - Device configuration database
- IOS-like CLI:
  - Modes (user/priv/config/interface/...)
  - Command registry with help + auto-complete hooks
  - Per-session output stream over WebSocket
- Lab storage:
  - Persist topology + device configs
- Validation engine:
  - Evaluate lab objectives and return actionable feedback

Interfaces:

- HTTP (REST) for topology/labs
- WebSocket for interactive CLI sessions (`/ws/cli`)
  - Backwards compatible JSON messages (`attach`, `input`)
  - Optional raw keystroke mode for sidecar-style input streaming
- Localhost-only TCP NDJSON RPC endpoint for CLI sidecar integration
  - Binds to `tcp://127.0.0.1:${NETSIM_RPC_PORT}` (default `3002`)

## Core abstractions

### World

- Owns `devices[]` and `links[]`
- Provides deterministic operations (create/remove/update)
- Emits events (future: for UI streaming, protocol timers)

### Device

- Type (router/switch/host/etc)
- Ports/interfaces
- Configuration tree:
  - `hostname`
  - `interfaces`
  - (future) `vrfs`, `routing`, `crypto`, `aaa`, `services`, ...

### CLI session

- Bound to a `deviceId`
- Tracks current mode + context (e.g., current interface)
- Mutates device configuration via a typed API

## Extensibility strategy (future-proofing)

NetSim will evolve by adding feature modules that plug into:

- CLI command tree (e.g., `router ospf 1`, `router bgp 65000`, `crypto ikev2 ...`)
- Simulation behaviors (timers, protocol state machines, route calculation)
- Validation rules (expected adjacencies, routes, crypto SAs, reachability)

## Realism and legality

- NetSim is a **simulator**; it does not ship Cisco firmware or proprietary images.
- IOS-like syntax will be implemented incrementally with a compatibility focus on CCNA/CCNP lab commands.
