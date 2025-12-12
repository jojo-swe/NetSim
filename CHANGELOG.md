# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo scaffold (`apps/api`, `apps/web`)
- Basic simulation world model (devices, interfaces, links)
- IOS-like CLI session over WebSocket (minimal command set)
- CLI static routes (`ip route`, `no ip route`) and `show ip route` (connected + static)
- Routing-aware `ping` (connected + static routes with basic return-path check)
- Drag-and-drop topology UI scaffold (React Flow)
- In-browser terminal scaffold (xterm.js)
- Lab save/load/reset (JSON lab file) and world snapshot endpoints

### Fixed

- CLI `ping` output formatting
- Lab load edge/link ID drift by rehydrating edges from backend links after snapshot import
- Lab load without a snapshot now recreates backend devices/links before rehydrating edges

## [0.1.0] - 2025-12-12

### Added

- Initial project scaffold and docs (spec + architecture)
