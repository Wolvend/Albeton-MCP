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
npm run ready:check
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

Check the selected Docker MCP profile plan:

```powershell
npm run docker:profile:plan
npm run docker:profile:verify
```

Check host readiness, then run the safe Ableton live bridge smoke after Ableton is open and the bridge device is loaded:

```powershell
.\launch.ps1 live-ready -SkipSetup
.\launch.ps1 live-ready -OpenBridge -SkipSetup
.\launch.ps1 live-smoke -SkipSetup
```

From WSL, use the Windows-backed launcher path for Ableton bridge checks:

```bash
./launch.sh live-ready --skip-setup
./launch.sh live-ready --open-bridge --skip-setup
./launch.sh live-smoke --skip-setup
```

Native WSL Node can verify the MCP server, but it may not reach the Windows-only Max for Live bridge while the bridge is bound to Windows `127.0.0.1`.

Expected current results:

```text
Tests: 27 files, 128 tests passed
Ready check: 15 checks, 0 failures, 0 warnings
MCP verifier: 317 tools, 3 resources, 2 prompts
Safe sweep: 201 safe calls, 0 unexpected failures
All-tool contract sweep: 317 registered tools, 317 contract calls
Audit: 0 vulnerabilities
```

`npm run docker:profile:verify` should also report matching `expectedAllowedTools` and `observedAllowedTools`, plus empty `missingSafeTools`, `unexpectedAbletonTools`, and `unexpectedRiskyTools` arrays.

## Check the Max for Live bridge

Bridge runtime checks require Ableton Live to be open with the bridge patch loaded:

```text
bridge\max-for-live\ableton-mcp-bridge.maxpat
```

Then call:

```text
ableton_bridge_ping
ableton_bridge_setup_status
ableton_get_live_state
ableton_list_tracks_compact
ableton_get_track_detail
```

If the bridge is not loaded, these tools should return `BRIDGE_UNREACHABLE` with setup steps.

The live-ready workflow can optionally call `ableton_open_bridge_device` behavior through `-OpenBridge` / `--open-bridge`. This opens the installed `.amxd` preset through the host OS/Ableton association and then re-checks `127.0.0.1:17364`; it does not move the mouse or enable MCP write tools, but Ableton may still prompt or alter the current set by loading the bridge device.

The default live-smoke workflow calls `ableton_mcp_get_objective_readiness_report`, `ableton_mcp_get_launch_readiness_audit`, `ableton_get_bridge_capabilities`, `ableton_live_status`, `ableton_bridge_status`, `ableton_bridge_setup_status` with `check_bridge=true`, `ableton_bridge_ping`, `ableton_get_live_state`, bounded track/detail/scene reads, `ableton_control_mode_status`, and one `dry_run=true` write probe. Device enumeration is a deep probe only: run `npm run live-smoke -- --deep` when you intentionally want to stress-test LiveAPI device reads. If any LiveAPI read times out, live-smoke stops queuing further bridge reads, sets `bridgeNeedsReload: true`, and reports that the Max for Live bridge device should be reloaded before retrying. It should never move the mouse, enable downloads, expose HTTP remotely, or perform real writes.

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
