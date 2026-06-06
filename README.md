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

The MCP server uses stdio for Codex. Live control is routed through a future Max for Live bridge on `127.0.0.1:17364`. Until Ableton Live is open and the bridge device is loaded, bridge tools return actionable connection errors.

Bridge source and contract docs are under `bridge/max-for-live`.

## Sample Policy

Freesound and Internet Archive tools search public/licensed metadata. Downloads and imports are disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`. Imports stage under `samples\staging` and copy into:

```text
C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
```

Each imported sample writes an attribution sidecar.
