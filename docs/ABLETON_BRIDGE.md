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

The bridge currently covers broad read visibility plus common write-gated operations: track/return/master summaries, scenes, clip slots, clips, devices, parameters, mixer volume/pan, clip creation/launch/stop/loop/rename, scene creation, track creation, track arm/mute/solo/rename, tempo, and transport.

MCP bridge calls are queued locally before they reach the loopback bridge. This prevents overlapping background commands when Codex or another MCP client issues concurrent tool calls.

Foreground UI/mouse automation is not the default bridge. It is a separate fallback for UI-only workflows, requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`, and should not be run at the same time as bridge write commands.

AbletonOSC remains a fallback/reference only. It has broad Live Object Model coverage, but the custom bridge is preferred for request IDs, diff snapshots, and tighter safety gates.
