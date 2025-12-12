# NetSim

NetSim is a CCNA-first, lab-driven **network simulator** with an IOS-like CLI and a modern drag-and-drop topology UI.

Goals:

- Practice CCNA/CCNP-style labs with realistic workflows.
- Use Cisco-like configuration modes and commands (incrementally implemented).
- Save/share labs and run validations with hints.

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

## Quick start (Docker)

- `docker compose up --build`

Open:

- Web UI: `http://localhost:5173`

## Repo layout

- `apps/api`: simulation engine + IOS-like CLI over WebSocket/HTTP
- `apps/web`: React UI (drag/drop topology + in-browser terminal)
- `docs`: spec, architecture, and process docs

## Documentation

- `docs/SPEC.md` (200+ feature specification)
- `docs/ARCHITECTURE.md`
- `CHANGELOG.md`
