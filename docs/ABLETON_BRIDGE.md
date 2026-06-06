# Ableton Bridge

The primary bridge is a custom Max for Live device in `bridge/max-for-live`.

Expected behavior:

- Listens only on `127.0.0.1`.
- Accepts JSON requests with `id`, `action`, and optional `payload`.
- Returns JSON with matching request identity, status, errors, and structured data.
- Supports `ping`, `full_snapshot`, `snapshot_diff`, and focused LiveAPI actions.
- Avoids blocking the audio thread.

The v1 bridge is implemented as:

- `bridge/max-for-live/ableton-mcp-http.js`: Node for Max loopback HTTP server.
- `bridge/max-for-live/ableton-mcp-liveapi.js`: Max JavaScript LiveAPI action handler.
- `bridge/max-for-live/ableton-mcp-bridge.maxpat`: patch that wires both scripts together.

Load the `.maxpat` in a Max for Live device with both JS files in the same folder, then run `ableton_bridge_ping`.

AbletonOSC remains a fallback/reference only. It has broad Live Object Model coverage, but the custom bridge is preferred for request IDs, diff snapshots, and tighter safety gates.
