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

- `Ableton MCP Bridge.amxd`: saved Max for Live MIDI Effect preset for quick install.
- `ableton-mcp-bridge.maxpat`: patch wiring.
- `ableton-mcp-http.js`: Node for Max loopback HTTP server on `127.0.0.1:17364`.
- `package.json`: Keeps the Max bridge folder in CommonJS mode, even though the main MCP project is ESM.
- `ableton-mcp-liveapi.js`: Max JS LiveAPI handler.
- `ableton-mcp-status.js`: Max Console status decoder for Node for Max lifecycle errors.

## Setup

Fast path after `npm run build`:

```powershell
npm run bridge:install
```

This copies `Ableton MCP Bridge.amxd`, `ableton-mcp-http.js`, `ableton-mcp-liveapi.js`, `ableton-mcp-status.js`, and `package.json` into the default Ableton User Library Max MIDI Effect preset folder.

1. Open Ableton Live.
2. Create a MIDI track.
3. Add a Max MIDI Effect device.
4. Load `Ableton MCP Bridge` from User Library > Presets > MIDI Effects > Max MIDI Effect. For development, open a Max MIDI Effect for editing and load `ableton-mcp-bridge.maxpat`.
5. Watch the Max console for `Ableton MCP HTTP bridge listening on 127.0.0.1:17364`.
6. Run `ableton_bridge_ping` from the MCP server.

For the persistent local preset, the `.amxd` and companion files are stored under:

`%USERPROFILE%\Documents\Ableton\User Library\Presets\MIDI Effects\Max MIDI Effect`

## Implemented v1 Actions

- `ping`
- `live_state`
- `transport`
- `tempo`
- `full_snapshot`
- `snapshot_diff`
- `list_tracks`
- `list_return_tracks`
- `master_track`
- `track_mixer`
- `list_scenes`
- `list_clips`
- `list_clip_slots`
- `list_devices`
- `list_device_parameters`
- `selected_track`
- `selected_device`
- `ableton_set_tempo`
- `ableton_transport_control`
- `ableton_create_audio_track`
- `ableton_create_midi_track`
- `ableton_create_return_track`
- `ableton_create_scene`
- `ableton_fire_scene`
- `ableton_set_scene_tempo`
- `ableton_set_scene_time_signature`
- `ableton_set_scene_color`
- `ableton_create_clip`
- `ableton_create_midi_clip`
- `ableton_insert_midi_notes`
- `ableton_load_preset_or_sample` in `audio_clip` mode for approved local audio files
- `ableton_set_clip_loop`
- `ableton_set_clip_gain`
- `ableton_transpose_clip`
- `ableton_set_clip_warp`
- `ableton_set_clip_markers`
- `ableton_set_clip_color`
- `ableton_fire_clip`
- `ableton_stop_clip`
- `ableton_arm_track`
- `ableton_mute_track`
- `ableton_solo_track`
- `ableton_set_track_volume`
- `ableton_set_track_pan`
- `ableton_set_track_color`
- `ableton_set_track_send`
- `ableton_set_return_track_color`
- `ableton_set_master_volume`
- `ableton_set_master_pan`
- `ableton_set_device_parameter`
- `ableton_rename_track`
- `ableton_rename_return_track`
- `ableton_rename_scene`
- `ableton_rename_clip`
- `ableton_create_arrangement_marker`
- `ableton_duplicate_scene`
- `ableton_duplicate_clip`
- `ableton_move_clip`
- `ableton_quantize_clip`
- `ableton_humanize_midi_clip`
- `arrangement_markers`
- `clip_notes`
- `clip_envelopes`
- `device_parameter_map`

Automation and device/preset insertion actions are dispatched deliberately, but return structured `unsupported: true` responses unless the current LiveAPI target can be handled reliably. Other MCP write tools remain gated and return a structured unsupported-action response until mapped to LiveAPI.
