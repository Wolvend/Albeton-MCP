# Verification

Run the local checks before using or publishing changes.

## Check the code

Run:

```powershell
npm run build
npm test
npm run lint
npm audit --audit-level=moderate
```

Then check the MCP surface:

```powershell
npm run inspect
npm run verify:mcp
```

Run first-run diagnostics:

```powershell
npm run doctor
```

Run release packaging checks:

```powershell
npm run release:check
```

Expected current results:

```text
Tests: 15 files, 28 tests passed
MCP verifier: 115 tools, 3 resources, 2 prompts
Audit: 0 vulnerabilities
```

## Check the Max for Live bridge

Bridge runtime checks require Ableton Live to be open with the bridge patch loaded:

```text
bridge\max-for-live\ableton-mcp-bridge.maxpat
```

Then call:

```text
ableton_bridge_ping
ableton_get_live_state
ableton_get_full_snapshot
```

If the bridge is not loaded, these tools should return `BRIDGE_UNREACHABLE` with setup steps.

## Check the UI driver

Run:

```powershell
npm run build
$env:ABLETON_MCP_ENABLE_UI_CONTROL="1"
npm run ui-driver
```

Then call:

```text
ableton_ui_driver_ping
ableton_window_status
```

The driver should bind to `127.0.0.1:17365` and report Ableton windows only.

## Check gated actions

These gates should remain off by default:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Write actions should be tested with `dry_run=true` first. Downloads/imports should stay blocked unless sample licensing and attribution have been reviewed.
