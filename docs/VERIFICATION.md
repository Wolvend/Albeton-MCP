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

Generate client configs:

```powershell
npm run configure:clients -- --out diagnostics/runtime/generated-config-test
```

Run the safe read-only/dry-run MCP sweep:

```powershell
npm run sweep:safe
```

Run the exhaustive safe contract sweep for every registered tool:

```powershell
npm run sweep:all
```

Check the HyperNimbus Docker MCP profile plan:

```powershell
npm run docker:hypernimbus:plan
npm run docker:hypernimbus:verify
```

Run the safe Ableton live bridge smoke after Ableton is open and the bridge device is loaded:

```powershell
.\launch.ps1 live-smoke -SkipSetup
```

From WSL, use the Windows-backed launcher path for Ableton bridge checks:

```bash
./launch.sh live-smoke --skip-setup
```

Native WSL Node can verify the MCP server, but it may not reach the Windows-only Max for Live bridge while the bridge is bound to Windows `127.0.0.1`.

Expected current results:

```text
Tests: 22 files, 76 tests passed
MCP verifier: 194 tools, 3 resources, 2 prompts
All-tool contract sweep: 194 registered tools, 194 safe calls
Audit: 0 vulnerabilities
```

`npm run docker:hypernimbus:verify` should also report `expectedAllowedTools: 119`, `observedAllowedTools: 119`, and empty `missingSafeTools`, `unexpectedAbletonTools`, and `unexpectedRiskyTools` arrays.

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

The live-smoke workflow calls `ableton_live_status`, `ableton_bridge_status`, `ableton_bridge_ping`, `ableton_get_live_state`, `ableton_get_full_snapshot`, track/scene/device listing, `ableton_control_mode_status`, and one `dry_run=true` write probe. It should never move the mouse, enable downloads, expose HTTP remotely, or perform real writes.

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
