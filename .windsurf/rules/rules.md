NetSim Best Practices Guide (Rule Sets)
1) Repo + Architecture Rules
[Keep concerns separated]
Put simulation truth in apps/api/src/sim/*.
Put operator UX / command parsing in apps/api/src/cli/*.
Put transport/adapters in apps/api/src/index.ts (HTTP/WS) and apps/api/src/rpc/* (NDJSON RPC).
Put UI-only state in apps/web/src/* and treat backend as the source of truth for network behavior.
[Design around “authoritative state”]
World (or equivalent sim state owner) should be the single authoritative place for devices, links, interface state, ARP, routing behavior, etc.
UI must not “predict” outcomes that the sim hasn’t confirmed (except for optimistic rendering that can be rolled back).
2) Simulation Correctness Rules (Highest Priority)
(Aligned with “real behaviour no matter the effort”)

[Prefer fidelity over convenience]
If behavior differs between a real device and a simplified model, implement the real rule unless you explicitly document the simplification.
[Make forwarding rules explicit]
Define clear invariants for:
Which devices can forward transit traffic (routers vs hosts/switches).
Next-hop reachability requirements.
ARP/neighbor resolution behavior during forwarding and local delivery.
[Determinism by default]
Use deterministic MAC/interface identifiers and stable ordering so tests and labs are reproducible.
Avoid Math.random() in sim logic unless it is seeded and controlled.
[Validate inputs at boundaries]
Parse/validate IPs, masks, interface names, device IDs at the CLI/RPC boundary.
The sim core should be resilient, but invalid commands should be rejected before mutating state.
3) API Backend Rules (apps/api)
[Keep src/index.ts thin]
index.ts should wire transports (Express, WS, RPC) and delegate to modules.
Avoid putting networking logic directly in route/WS handlers.
[Single-purpose modules]
sim/* contains logic and state transitions.
cli/* translates user intent → sim calls + returns strings/output formatting.
rpc/* exposes sim calls in a stable contract (method names, params, return types).
[Strong typing as a contract]
Treat TypeScript types in sim/types.ts as public contracts.
Prefer discriminated unions for RPC responses ({ ok: true, ... } | { ok: false, error: ... }) to avoid ambiguous failure modes.
[Error handling rules]
Never throw raw errors over RPC/WS; convert to structured { ok:false, error }.
Include enough context to debug (deviceId, interface, IP) but avoid leaking internal stack traces to the UI by default.
[Backwards-compatible RPC]
If you change RPC payloads, either:
version them, or
add fields non-breakingly and keep old fields until the web app is updated.
4) Web Frontend Rules (apps/web)
[Backend is authoritative]
The UI renders topology and device state, but the backend decides behavior (ping/traceroute, ARP learning, routes).
[ReactFlow: keep data normalized]
Store nodes and edges in stable IDs.
Avoid embedding large derived state inside node data if it can be derived from a central store.
[Terminal UX rules]
Treat terminal input as a stream; avoid coupling UI state tightly to transport.
If supporting both JSON-framed input and raw mode, ensure mode transitions are explicit and reversible.
[Performance rules]
Avoid re-rendering the full graph on keystrokes in the terminal.
Memoize heavy node components (DeviceNode) and keep props stable.
5) CLI Rules (Cisco-like UX)
[Mode-aware commands]
Commands must respect current mode (exec, privileged, config, interface).
Tab completion must only suggest commands valid in the current mode.
[Idempotency where expected]
no <cmd> should cleanly revert configuration without leaving partial state.
“show” commands must never mutate sim state.
[Output stability]
Keep “show” outputs deterministic (sorted interfaces/routes/arp entries), so tests and labs don’t flap.
6) Labs Rules (apps/api/src/labs/* + labs/*.json)
[Lab files are data, not behavior]
Labs define topology/devices/config snapshots; the sim defines behavior.
[Schema versioning]
Every lab format should carry a version.
Add new fields in a backwards-compatible way; avoid breaking older labs.
[Strict validation]
Validate lab JSON on load:
node IDs unique
edges reference existing nodes
interface references valid
Fail fast with actionable messages.
7) Testing + Regression Rules
[Regression tests represent real-world invariants]
When you fix a bug, add a regression test that fails before the fix and passes after.
Prefer scenario-driven tests (topology + config + expected pings/traces).
[Make tests deterministic]
Ensure ordering and generated identifiers are stable.
[Test the sim core, not the UI]
Most critical correctness tests belong in apps/api/src/regression/*.
8) Change Management Rules
[Small, coherent commits]
One behavioral change per commit when possible (ARP change separate from UI polish).
[Avoid “drive-by” refactors]
Do not rename/move modules during feature work unless it directly supports the feature.
[Document intentional deviations]
If you intentionally simplify compared to real networking, record it in docs/SPEC.md or docs/ARCHITECTURE.md.
9) Security + Safety Rules
[Local-only privileged endpoints]
Keep NDJSON RPC bound to localhost (as it is now) unless you add auth.
[Input sanitation]
Never execute shell commands from CLI input.
Treat lab JSON and any external inputs as untrusted.
10) Practical “Definition of Done” Checklist
[Correctness]
Sim behavior matches expected real-world behavior for the feature scope.
[Tests]
Added/updated regression test(s) for the scenario.
[UX]
CLI output and UI state updates are consistent and deterministic.
[Compatibility]
RPC/UI changes are coordinated; no silent breaking changes.
[Performance]
No obvious O(N²) blowups in graph rendering or sim forwarding loops.---
trigger: manual
---

