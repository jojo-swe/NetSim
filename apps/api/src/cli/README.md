# CLI

This folder contains the IOS-like CLI engine.

Implementation notes:

- The CLI is incremental; commands are added as needed for labs.
- Long-term goal is a command registry with mode-aware parsing and help.

Transports:

- WebSocket: `/ws/cli`
  - Backwards compatible JSON messages:
    - `{ "type": "attach", "deviceId": "R1" }`
    - `{ "type": "input", "line": "show ip route" }`
  - Optional raw keystroke mode:
    - `{ "type": "mode", "mode": "raw" }`, then send raw text frames containing keystrokes (CR/LF submits, `\u007f` backspace)
    - or `{ "type": "raw", "data": "enable\r" }`

- Local TCP NDJSON RPC (sidecar): `tcp://127.0.0.1:${NETSIM_RPC_PORT}` (default `3002`)
  - Intended for a future C-based CLI sidecar integration.
