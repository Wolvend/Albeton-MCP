# Max for Live Bridge

`ableton-mcp-bridge.maxpat` is the v1 bridge source placeholder and contract document. The MCP server already implements the loopback client contract on `127.0.0.1:17364`.

Required bridge message contract:

```json
{
  "id": "uuid",
  "action": "ping",
  "payload": {}
}
```

Response:

```json
{
  "id": "uuid",
  "ok": true,
  "data": {}
}
```

The Max device should use LiveAPI for session snapshots and keep long work off the audio thread.
