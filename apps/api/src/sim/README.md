# Simulation Engine

Modular simulation engine for NetSim's network world state.

## Modules

- `world.ts` — slim facade: owns `devices[]` and `links[]`, delegates to modules below
- `arp.ts` — ARP table management and resolution
- `l2.ts` — L2 forwarding, MAC learning, broadcast domains
- `routing.ts` — routing table management, next-hop selection, `ping`/`traceroute` logic
- `mac.ts` — MAC address generation and validation
- `eventBus.ts` — internal event pub/sub for sim state changes
- `types.ts` — shared sim-engine type definitions

## Testing

Regression tests live in `apps/api/src/regression/`:

- `nextHopReachability.ts` — verifies routing table next-hop selection
- `cableCompatibility.ts` — verifies cable type compatibility rules
- `ospf.test.ts` — verifies OSPF adjacency, SPF and route installation

Run: `npx vitest run` from `apps/api/`
