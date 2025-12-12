# NetSim Specification (Living Document)

This spec is intentionally **broad**: NetSim starts as a CCNA-first simulator, but the architecture and feature plan must support growth toward CCNP and beyond (VPNs, segmentation, security, overlays, data center, automation, and assessment tooling).

Notes:

- NetSim is a **simulator**; it does not ship proprietary Cisco images.
- Cisco-like syntax will be implemented **incrementally**. Where a command is supported, the intent is that it matches real IOS/IOS-XE behavior closely enough to build correct muscle memory.

Legend:

- `[MVP]` first working milestone
- `[CCNA]` CCNA-focused scope
- `[CCNP]` CCNP-focused scope
- `[DC]` data center / advanced scope
- `[PLAT]` platform / UX / tooling

## Feature list (220+)

### Platform, reliability, and UX

- **F-001** [PLAT] Runs locally on Windows with optional Docker-based deployment.
- **F-002** [PLAT] Single-command dev start (API + Web).
- **F-003** [PLAT] Deterministic simulation mode for repeatable labs.
- **F-004** [PLAT] Non-deterministic mode to introduce realistic variability.
- **F-005** [PLAT] Project/workspace concept for organizing multiple labs.
- **F-006** [PLAT] Autosave and crash recovery.
- **F-007** [PLAT] Import/export labs as a single file.
- **F-008** [PLAT] Versioned lab schema with migration.
- **F-009** [PLAT] Local-first storage with optional sync later.
- **F-010** [PLAT] Snapshot/restore of a lab state.
- **F-011** [PLAT] Undo/redo for topology edits.
- **F-012** [PLAT] Keyboard shortcuts for common actions.
- **F-013** [PLAT] Dark theme (default).
- **F-014** [PLAT] Light theme.
- **F-015** [PLAT] Responsive layout for ultrawide + laptop screens.
- **F-016** [PLAT] Accessibility: keyboard navigation and ARIA basics.
- **F-017** [PLAT] Device search/filter in UI.
- **F-018** [PLAT] Global command palette (quick actions).
- **F-019** [PLAT] Built-in update notification system.
- **F-020** [PLAT] Telemetry opt-in (privacy-preserving) with clear controls.
- **F-021** [PLAT] Offline operation by default.
- **F-022** [PLAT] Per-lab settings (timers, realism level, validation strictness).
- **F-023** [PLAT] Performance profiler view (event loop/ticks/protocol timers).
- **F-024** [PLAT] Export diagnostic bundle for troubleshooting.
- **F-025** [PLAT] Structured logs with severity + filtering.
- **F-026** [PLAT] Replayable event log (timeline).
- **F-027** [PLAT] Safe mode (disables heavy protocol timers).
- **F-028** [PLAT] Plugin/module system for new features.
- **F-029** [PLAT] Feature flags for experimental functions.
- **F-030** [PLAT] Seeded randomness per lab.
- **F-031** [PLAT] Multi-language UI framework readiness (i18n).
- **F-032** [PLAT] In-app documentation browser.
- **F-033** [PLAT] Contextual help links from UI panels.
- **F-034** [PLAT] Error messages designed for learning (actionable).
- **F-035** [PLAT] Consistent “what changed” diffs for configs.

### Topology editor (drag-and-drop)

- **F-036** [MVP] Drag-and-drop device placement on a canvas.
- **F-037** [MVP] Connect devices with links.
- **F-038** [MVP] Select a device to open its CLI.
- **F-039** [CCNA] Device palette with routers, switches, hosts.
- **F-040** [CCNA] Link types (copper, fiber, serial).
- **F-041** [CCNA] Interface-level link attachment (choose ports).
- **F-042** [CCNA] Visual indication of link up/down.
- **F-043** [CCNA] Visual indication of interface admin state.
- **F-044** [CCNA] Visual indication of STP blocking/forwarding.
- **F-045** [CCNA] Label links with interface names.
- **F-046** [PLAT] Grid + snap-to-grid.
- **F-047** [PLAT] Align/distribute selected nodes.
- **F-048** [PLAT] Pan/zoom and fit-to-view.
- **F-049** [PLAT] Mini-map overview.
- **F-050** [PLAT] Multi-select devices.
- **F-051** [PLAT] Group/ungroup objects.
- **F-052** [PLAT] Notes/annotations on canvas.
- **F-053** [PLAT] Export topology diagram (PNG/SVG).
- **F-054** [PLAT] Import a topology diagram background.
- **F-055** [CCNA] Cable validation (wrong cable types cause link down).
- **F-056** [CCNA] Auto-layout for quick start.
- **F-057** [PLAT] Context menus for devices/links.
- **F-058** [PLAT] Copy/paste topology elements.
- **F-059** [PLAT] Topology templates (starter labs).
- **F-060** [PLAT] Topology diff viewer between snapshots.

### Device inventory and templates

- **F-061** [CCNA] Router device model with Ethernet ports.
- **F-062** [CCNA] Switch device model with access/trunk ports.
- **F-063** [CCNA] Host device model (PC).
- **F-064** [CCNA] Prebuilt device “families” (e.g., ISR-like, Catalyst-like).
- **F-065** [PLAT] Device templates (clone base config).
- **F-066** [PLAT] Bulk rename devices.
- **F-067** [PLAT] Bulk apply template to selected devices.
- **F-068** [PLAT] Device inspector showing ports/config summary.
- **F-069** [PLAT] Device health panel (CPU/timers/events).
- **F-070** [PLAT] Device console history.
- **F-071** [PLAT] Device config export as text.
- **F-072** [PLAT] Device config import as text.
- **F-073** [PLAT] Wipe device config (erase startup-config).
- **F-074** [CCNA] Startup-config vs running-config distinction.
- **F-075** [PLAT] Reload device behavior (simulated reboot).

### Cisco-like CLI engine

- **F-076** [MVP] User EXEC mode prompt (`>`).
- **F-077** [MVP] Privileged EXEC mode prompt (`#`).
- **F-078** [MVP] Global configuration mode (`(config)#`).
- **F-079** [MVP] Interface configuration mode (`(config-if)#`).
- **F-080** [MVP] `enable` / `disable`.
- **F-081** [MVP] `configure terminal` / `conf t`.
- **F-082** [MVP] `hostname <name>`.
- **F-083** [MVP] `interface <name>`.
- **F-084** [MVP] `shutdown` / `no shutdown`.
- **F-085** [MVP] `ip address <ip> <mask>`.
- **F-086** [MVP] `show running-config` / `show run`.
- **F-087** [MVP] `show ip interface brief`.
- **F-088** [CCNA] IOS-style error messages (invalid/incomplete/ambiguous).
- **F-089** [CCNA] Command abbreviation handling (e.g., `conf t`).
- **F-090** [CCNA] Contextual help (`?`) at end of line.
- **F-091** [CCNA] Tab completion.
- **F-092** [CCNA] Command history (up/down arrows).
- **F-093** [CCNA] `do` command from config modes.
- **F-094** [CCNA] `end` and Ctrl+Z behavior.
- **F-095** [CCNA] `write memory` / `copy run start`.
- **F-096** [CCNA] `show startup-config`.
- **F-097** [CCNA] `show version`.
- **F-098** [CCNA] `show interfaces`.
- **F-099** [CCNA] `description <text>` under interface.
- **F-100** [CCNA] `no ip address`.
- **F-101** [CCNA] `ip default-gateway` for L2 switch management.
- **F-102** [CCNA] `banner motd` support.
- **F-103** [CCNA] Line configuration modes (`line con 0`, `line vty 0 4`).
- **F-104** [CCNA] `service password-encryption` (simulated).
- **F-105** [CCNA] `enable secret`.
- **F-106** [CCNA] Local user database (`username <u> secret <p>`).
- **F-107** [PLAT] Consistent internal config tree with text rendering.
- **F-108** [PLAT] Config diff engine (before/after per command).
- **F-109** [PLAT] `show running-config` renders in canonical order.
- **F-110** [PLAT] Per-command validation hooks (syntax + semantics).

### Simulation engine core

- **F-111** [MVP] World model: devices + links.
- **F-112** [MVP] Deterministic device IDs.
- **F-113** [PLAT] Event bus (link up/down, config changes).
- **F-114** [CCNA] Interface admin state affects link state.
- **F-115** [CCNA] Interface operational state depends on peer.
- **F-116** [CCNA] IPv4 addressing attached to interfaces.
- **F-117** [CCNA] ARP table per device.
- **F-118** [CCNA] ICMP echo simulation (`ping`).
- **F-119** [CCNA] `traceroute` simulation.
- **F-120** [CCNA] Routing table per router.
- **F-121** [CCNA] Connected routes auto-installed.
- **F-122** [CCNA] Static routes (`ip route`).
- **F-123** [CCNA] Default route support.
- **F-124** [PLAT] Simulation “tick” with protocol timers.
- **F-125** [PLAT] Packet capture view (logical, not PCAP at first).
- **F-126** [PLAT] Per-hop packet path visualization.
- **F-127** [PLAT] Drop reason visibility (ACL/route missing/ARP failed).
- **F-128** [PLAT] Deterministic random packet loss (optional).
- **F-129** [PLAT] Link latency model.
- **F-130** [PLAT] Link bandwidth model.
- **F-131** [PLAT] MTU model.
- **F-132** [PLAT] Fragmentation behavior (later).

### Layer 2 switching (CCNA)

- **F-133** [CCNA] VLAN database.
- **F-134** [CCNA] Access ports (`switchport mode access`).
- **F-135** [CCNA] Trunk ports (`switchport mode trunk`).
- **F-136** [CCNA] Allowed VLAN list (`switchport trunk allowed vlan`).
- **F-137** [CCNA] Native VLAN (`switchport trunk native vlan`).
- **F-138** [CCNA] SVI (`interface vlan X`).
- **F-139** [CCNA] MAC address table.
- **F-140** [CCNA] Ethernet learning + flooding.
- **F-141** [CCNA] STP (802.1D) simulation.
- **F-142** [CCNA] RSTP (802.1w) simulation.
- **F-143** [CCNA] Per-VLAN STP (PVST-like behavior).
- **F-144** [CCNA] PortFast.
- **F-145** [CCNA] BPDU Guard.
- **F-146** [CCNA] EtherChannel (LACP) basics.
- **F-147** [CCNA] `show vlan brief`.
- **F-148** [CCNA] `show spanning-tree`.
- **F-149** [CCNA] `show etherchannel summary`.

### Layer 3 routing (CCNA)

- **F-150** [CCNA] Router-on-a-stick subinterfaces.
- **F-151** [CCNA] `encapsulation dot1q <vlan>`.
- **F-152** [CCNA] Inter-VLAN routing via SVIs.
- **F-153** [CCNA] IPv4 forwarding between interfaces.
- **F-154** [CCNA] Administrative distance model.
- **F-155** [CCNA] Longest prefix match routing.
- **F-156** [CCNA] `show ip route`.
- **F-157** [CCNA] `show arp`.
- **F-158** [CCNA] ICMP unreachable/time-exceeded where appropriate.

### OSPF

- **F-159** [CCNA] OSPFv2 single-area (`router ospf <pid>`).
- **F-160** [CCNA] `network <ip> <wildcard> area <n>`.
- **F-161** [CCNA] Passive interfaces.
- **F-162** [CCNA] Neighbor adjacencies.
- **F-163** [CCNA] DR/BDR on broadcast networks.
- **F-164** [CCNA] OSPF cost calculations.
- **F-165** [CCNP] Multi-area OSPF.
- **F-166** [CCNP] OSPF stub/NSSA.
- **F-167** [CCNP] OSPF authentication.
- **F-168** [CCNA] `show ip ospf neighbor`.
- **F-169** [CCNA] `show ip ospf interface`.

### BGP

- **F-170** [CCNP] eBGP + iBGP basics.
- **F-171** [CCNP] `router bgp <asn>`.
- **F-172** [CCNP] `neighbor <ip> remote-as <asn>`.
- **F-173** [CCNP] Network advertisement (`network <prefix> mask <mask>`).
- **F-174** [CCNP] Next-hop handling.
- **F-175** [CCNP] Local preference, MED.
- **F-176** [CCNP] AS-PATH selection.
- **F-177** [CCNP] BGP communities (standard).
- **F-178** [CCNP] Community lists.
- **F-179** [CCNP] Route-maps for policy.
- **F-180** [CCNP] Prefix-lists.
- **F-181** [CCNP] `show ip bgp`.
- **F-182** [CCNP] `show ip bgp neighbors`.

### ACL, NAT, and basic security

- **F-183** [CCNA] Standard IPv4 ACLs.
- **F-184** [CCNA] Extended IPv4 ACLs.
- **F-185** [CCNA] Named ACLs.
- **F-186** [CCNA] ACL application inbound/outbound (`ip access-group`).
- **F-187** [CCNA] `show access-lists`.
- **F-188** [CCNA] NAT overload (PAT).
- **F-189** [CCNA] Static NAT.
- **F-190** [CCNA] NAT inside/outside interface roles.
- **F-191** [CCNA] `show ip nat translations`.
- **F-192** [CCNA] Zone-based firewall (future baseline).

### AAA, RADIUS, TACACS+, ISE (learning-focused)

- **F-193** [CCNP] AAA new-model.
- **F-194** [CCNP] Local authentication fallback.
- **F-195** [CCNP] RADIUS server objects.
- **F-196** [CCNP] RADIUS authentication for VTY.
- **F-197** [CCNP] RADIUS authorization (exec).
- **F-198** [CCNP] TACACS+ authentication.
- **F-199** [CCNP] TACACS+ command authorization (simulated).
- **F-200** [CCNP] ISE-like policy simulation (learning mode).
- **F-201** [CCNP] Downloadable ACL (DACL) concept simulation.
- **F-202** [CCNP] CoA (Change of Authorization) concept simulation.

### VRF / segmentation

- **F-203** [CCNP] VRF definition (`vrf definition <name>`).
- **F-204** [CCNP] Interface VRF assignment.
- **F-205** [CCNP] Per-VRF routing tables.
- **F-206** [CCNP] VRF-aware OSPF instances.
- **F-207** [CCNP] VRF-aware BGP address-families.

### IPsec / IKE / tunnels (D-VTI, mGRE, FlexVPN)

- **F-208** [CCNP] IKEv2 proposals/policies (syntax-compatible).
- **F-209** [CCNP] IPsec transform-sets / proposals.
- **F-210** [CCNP] Crypto maps (baseline).
- **F-211** [CCNP] D-VTI tunnels.
- **F-212** [CCNP] mGRE tunnel interfaces.
- **F-213** [CCNP] NHRP (DMVPN) conceptual simulation.
- **F-214** [CCNP] DMVPN Phase 1/2/3 behaviors (learning-focused).
- **F-215** [CCNP] FlexVPN client/server roles.
- **F-216** [CCNP] FlexVPN IKEv2 profiles.
- **F-217** [CCNP] `show crypto ikev2 sa`.
- **F-218** [CCNP] `show crypto ipsec sa`.

### Services (DNS/DHCP/NTP)

- **F-219** [CCNA] DHCP server pools (basic).
- **F-220** [CCNA] DNS client/server simulation (basic).

## Ongoing process

- Add new features here before implementing them.
- Every implemented feature should be recorded in `CHANGELOG.md` under **Unreleased**.
