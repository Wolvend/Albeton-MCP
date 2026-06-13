# Ableton Bridge

The primary Ableton control lane is a custom Max for Live device in `bridge/max-for-live`.

Expected behavior:

- Listens only on `127.0.0.1`.
- Accepts JSON requests with `id`, `action`, and optional `payload`.
- Returns JSON with matching request identity, status, errors, and structured data.
- Supports `ping`, `full_snapshot`, `snapshot_diff`, and focused LiveAPI actions.
- Newer deep bridge actions use typed MCP schemas and return explicit `unsupported: true` responses when an Ableton LiveAPI operation is not reliable in the current bridge context.
- Avoids blocking the audio thread.

## Bridge files

- `bridge/max-for-live/ableton-mcp-http.js`: Node for Max loopback HTTP server.
- `bridge/max-for-live/package.json`: local CommonJS marker required by Node for Max.
- `bridge/max-for-live/ableton-mcp-liveapi.js`: Max JavaScript LiveAPI action handler.
- `bridge/max-for-live/ableton-mcp-bridge.maxpat`: patch that wires both scripts together.

Load the `.maxpat` in a Max for Live device with both JS files and `package.json` in the same folder, then run `ableton_bridge_ping`.

## Permanent local install

After `npm run build`, copy the saved `.amxd` preset and bridge companion files automatically:

```powershell
npm run bridge:install
```

Preview the same install without writing files:

```powershell
npm run bridge:install:dry-run
```

The working local preset is saved at:

`%USERPROFILE%\Documents\Ableton\User Library\Presets\MIDI Effects\Max MIDI Effect\Ableton MCP Bridge.amxd`

Keep these companion files in that same preset folder so Node for Max resolves the bridge after Ableton restarts:

- `Ableton MCP Bridge.amxd`
- `ableton-mcp-http.js`
- `ableton-mcp-liveapi.js`
- `ableton-mcp-status.js`
- `package.json`

The current saved Live Set is:

`%USERPROFILE%\Documents\Ableton\Ableton MCP Bridge Set\Ableton MCP Bridge Set Project\Ableton MCP Bridge Set.als`

When that set is open, lock the Max device patcher and click `script start` if `ableton_bridge_ping` is not reachable. In normal operation the `node.script ... @autostart 1` object should start the loopback bridge.

MCP clients can call `ableton_bridge_install_plan` for the same dry-run report. `ableton_install_bridge_files` copies the same files when called with `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`.

## Current LiveAPI coverage

The bridge currently covers broad read visibility plus common write-gated operations:

- Transport, tempo, play/stop/record state, and full/diff snapshots.
- Track, return, master, scene, clip slot, clip, device, parameter, arrangement locator, and selected-object summaries.
- Track creation, scene creation, clip creation, clip launch/stop, loop changes, renaming, track arm/mute/solo, mixer volume/pan/send changes, and scene/clip duplication or movement.
- Audio clip creation from an approved local sample path with `ableton_load_preset_or_sample` in `audio_clip` mode.
- MIDI note insertion with `ableton_insert_midi_notes` when the loaded Ableton/Max LiveAPI context supports the modern note API.

The bridge returns explicit `unsupported: true` results for operations that are not reliable in the current LiveAPI context, including generic device/preset insertion and automation writes that cannot be proven for the selected target. MCP dry-runs for `ableton_insert_instrument` and `ableton_insert_effect` also report this limitation up front, because named device insertion needs a verified Browser or hot-swap target for the running Ableton version. MCP clients should treat those responses as setup or capability limits, not as success.

## Queueing and fallback

MCP bridge calls are queued locally before they reach the loopback bridge. This prevents overlapping background commands when Codex or another MCP client issues concurrent tool calls.

Foreground UI/mouse automation is not the default bridge. It is a separate fallback for UI-only workflows, runs through the Ableton UI Driver on `127.0.0.1:17365`, requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`, and should not be run at the same time as bridge write commands.

AbletonOSC remains a fallback/reference only. It has broad Live Object Model coverage, but the custom bridge is preferred for request IDs, diff snapshots, and tighter safety gates.
