# Ableton Bridge

The primary bridge is a custom Max for Live device in `bridge/max-for-live`.

Expected behavior:

- Listens only on `127.0.0.1`.
- Accepts JSON requests with `id`, `action`, and optional `payload`.
- Returns JSON with matching request identity, status, errors, and structured data.
- Supports `ping`, `full_snapshot`, `snapshot_diff`, and focused LiveAPI actions.
- Avoids blocking the audio thread.

AbletonOSC remains a fallback/reference only. It has broad Live Object Model coverage, but the custom bridge is preferred for request IDs, diff snapshots, and tighter safety gates.
