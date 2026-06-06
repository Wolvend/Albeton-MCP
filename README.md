# Ableton MCP

Local Windows MCP server for Ableton Live 12 visibility, library indexing, legal sample discovery, and gated Ableton control.

## Local Setup

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
npm install
npm run build
npm test
npm run lint
```

Run the server:

```powershell
npm start
```

Inspect tools:

```powershell
npm run inspect
```

## Verified Local Paths

```text
Ableton Live: C:\ProgramData\Ableton\Live 12 Trial\Program\Ableton Live 12 Trial.exe
Bundled Max: C:\ProgramData\Ableton\Live 12 Trial\Resources\Max\Max.exe
User Library: C:\Users\LIZ\Documents\Ableton\User Library
Factory Packs: C:\Users\LIZ\Documents\Ableton\Factory Packs
Live Recordings: C:\Users\LIZ\Documents\Ableton\Live Recordings
```

## Safety Defaults

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Allowed roots:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp
C:\Users\LIZ\Documents\Ableton
C:\ProgramData\Ableton\Live 12 Trial
```

The Ableton install root is read-only. Broad user folders, broad AppData, browser profiles, password stores, and credential folders are rejected.

## Ableton Bridge

The MCP server uses stdio for Codex. Live control is routed through the Max for Live bridge on `127.0.0.1:17364`. Until Ableton Live is open and the bridge device is loaded, bridge tools return actionable connection errors.

Bridge source and contract docs are under `bridge/max-for-live`.

## Control Modes

Default control is background bridge mode: MCP tool calls go to the Max for Live bridge, use fixed action IDs, and are serialized through one local command queue. This mode does not focus Ableton or touch the cursor.

Foreground UI/mouse control is a fallback mode for workflows that cannot be expressed through LiveAPI yet. It is disabled by default, requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`, and still needs an explicit external UI operator at action time. Do not run foreground UI automation while bridge write commands are active.

Use `ableton_control_mode_status` and `ableton_bridge_status` to see the active policy and queue state.

## Sample Policy

Freesound and Internet Archive tools search public/licensed metadata. Downloads and imports are disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`. Imports stage under `samples\staging` and copy into:

```text
C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
```

Each imported sample writes an attribution sidecar.
