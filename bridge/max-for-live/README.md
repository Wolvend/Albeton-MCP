# Max for Live Bridge

`ableton-mcp-bridge.maxpat` is the v1 bridge source. It uses Node for Max for the loopback HTTP server and a Max `js` object for LiveAPI access.

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

## Files

- `ableton-mcp-bridge.maxpat`: patch wiring.
- `ableton-mcp-http.js`: Node for Max loopback HTTP server on `127.0.0.1:17364`.
- `ableton-mcp-liveapi.js`: Max JS LiveAPI handler.

## Setup

1. Open Ableton Live.
2. Create a MIDI track.
3. Add a Max MIDI Effect device.
4. Open it for editing and load `ableton-mcp-bridge.maxpat`, or copy these three files into a Max device folder and save as an `.amxd`.
5. Watch the Max console for `Ableton MCP HTTP bridge listening on 127.0.0.1:17364`.
6. Run `ableton_bridge_ping` from the MCP server.

## Implemented v1 Actions

- `ping`
- `live_state`
- `transport`
- `tempo`
- `full_snapshot`
- `snapshot_diff`
- `list_tracks`
- `list_scenes`
- `list_clips`
- `list_devices`
- `list_device_parameters`
- `selected_track`
- `selected_device`
- `ableton_set_tempo`
- `ableton_transport_control`
- `ableton_create_audio_track`
- `ableton_create_midi_track`
- `ableton_create_return_track`
- `ableton_arm_track`
- `ableton_mute_track`
- `ableton_solo_track`
- `ableton_rename_track`

Other MCP write tools remain gated and return a structured unsupported-action response until mapped to LiveAPI.
