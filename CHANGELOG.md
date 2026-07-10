# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Shared types package** (`@netsim/shared`): centralized `types.ts`, `ipUtils.ts`, `devicePorts.ts` shared across API and web
- **Modular simulation engine**: `world.ts` split into `arp.ts`, `l2.ts`, `routing.ts`, `mac.ts`, `eventBus.ts` with `world.ts` as slim facade
- **Vitest test framework**: configured in `packages/shared`, `apps/api`, and `apps/web` with per-package configs
- **Unit tests**: 14 tests for shared IP utilities (`ipv4ToInt`, `intToIpv4`, `maskToPrefixLen`, `prefixLenToMask`, `inSameSubnet`, `networkAddress`, `ipMatchesDestination`)
- **Regression tests**: migrated `nextHopReachability` (5 tests) and `cableCompatibility` (6 tests) to Vitest format
- **Web smoke test**: shared package re-export verification
- **GitHub Actions CI**: `.github/workflows/ci.yml` running type checks and tests across all packages
- **Web UI component extraction**: `PortsPanel`, `LinkWizard`, `CableLegend` extracted from `App.tsx` monolith
- **Web utility modules**: `cableUtils.ts` (cable type labels, edge styles, mask conversion), `portUtils.ts` (device type inference, port lookup, cable suggestion)
- **Web types module**: `types.ts` with shared web-only types and helpers
- **Web API client** (`api.ts`): centralized fetch functions for devices, links, labs, world snapshot
- **Web custom hooks**: `useLocalStorage`, `useDevices`, `useLabs`, `useDeviceCreation`
- **Monorepo scaffold** (`apps/api`, `apps/web`)
- **Basic simulation world model** (devices, interfaces, links)
- **IOS-like CLI** session over WebSocket (minimal command set)
- **CLI static routes** (`ip route`, `no ip route`) and `show ip route` (connected + static)
- **Routing-aware `ping`** (connected + static routes with basic return-path check)
- **Drag-and-drop topology UI** scaffold (React Flow)
- **In-browser terminal** scaffold (xterm.js)
- **Lab save/load/reset** (JSON lab file) and world snapshot endpoints

### Fixed

- CLI `ping` output formatting
- Lab load edge/link ID drift by rehydrating edges from backend links after snapshot import
- Lab load without a snapshot now recreates backend devices/links before rehydrating edges

## [0.1.0] - 2025-12-12

### Added

- Initial project scaffold and docs (spec + architecture)
