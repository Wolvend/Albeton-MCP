# Final Verification Report

Date: 2026-06-06 / 2026-06-07 local runtime checks

This report records the latest local verification pass for the Ableton MCP production build.

## Commands run

```powershell
npm run build
```

Result: succeeded.

```powershell
npm test
```

Result: succeeded. Latest pass reported 15 test files and 28 tests passed.

```powershell
npm run lint
```

Result: succeeded.

```powershell
npm run doctor
```

Result: succeeded. Doctor reported 8 checks, 0 failures, and 0 warnings: tool catalog, Node, ffprobe, Ableton User Library, bridge sources, HTTP transport, UI driver, and Max for Live bridge.

```powershell
npm run release:check
```

Result: succeeded. Release check found all required files and scripts. It reported working-tree-only folders that must stay excluded from release archives: `node_modules`, `diagnostics/screenshots`, `diagnostics/runtime`, and `data/cache`.

```powershell
npm run verify:mcp
```

Result: succeeded. The verifier reported 115 tools, 3 resources, and 2 prompts. It called path security, runtime report, security report, bridge mock, and Internet Archive sample metadata checks.

```powershell
wsl.exe bash -lc 'cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp && ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify'
```

Result: succeeded under WSL2 Ubuntu with native WSL Node. The verifier reported 115 tools, 3 resources, and 2 prompts. Platform path security rejected `/`, `%USERPROFILE%`, `%USERPROFILE%/.ssh`, and `%USERPROFILE%/AppData/Roaming`.

```powershell
# Temporary localhost auth smoke on port 17466
```

Result: succeeded. Without `Authorization`, `/health` returned HTTP 401. With `Authorization: Bearer temporary-test-token-12345`, `/health` returned HTTP 200 and `authRequired: true`.

```powershell
# MCP client smoke for ableton_mcp_get_client_connection_profiles
```

Result: succeeded. The profile tool returned stdio, local HTTP, private-network candidate URLs, required remote auth environment, and model-provider host-app guidance for Codex, Claude, Docker MCP, WSL, OpenRouter, Gemini, llama.cpp, and Antigravity.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1 install
cmd /c launch.cmd install
bash ./launch.sh install
```

Result: succeeded. All three launch entry points built the project and installed the bridge preset files into `%USERPROFILE%\Documents\Ableton\User Library\Presets\MIDI Effects\Max MIDI Effect`.

```powershell
# MCP client smoke test against launch.cmd stdio -SkipSetup
```

Result: succeeded. The stdio client connected through `launch.cmd`, called `tools/list`, and received 115 tools. This verifies launcher setup output does not corrupt MCP stdout.

```powershell
.\launch.ps1 docker -SkipSetup
```

Result: skipped as a new process because `127.0.0.1:17366` was already bound by `"C:\Program Files\nodejs\node.exe" dist/src/http.js`. A Streamable HTTP MCP `initialize` POST to `http://127.0.0.1:17366/mcp` returned HTTP 200 from that existing service.

```powershell
npm run inspect
```

Result: succeeded. MCP Inspector listed the stdio server tools.

```powershell
npm audit --audit-level=moderate
```

Result: succeeded. npm reported 0 vulnerabilities.

## Earlier full MCP sweep

A separate earlier MCP client sweep called every registered tool with safe fixture/default arguments, read every resource, and rendered every prompt. The current verifier confirms the registered surface is now 115 tools, 3 resources, and 2 prompts.

Summary:

```text
Tools: 112
Resources: 3
Prompts: 2
Tool calls with ok result: 91
Expected missing-bridge results: 18
Expected optional-auth result: 1
Expected feature-gate results: 2
Unexpected failures: 0
```

Expected non-OK results:

- 18 LiveAPI bridge tools returned `BRIDGE_UNREACHABLE` because the Max for Live bridge was not loaded/listening on `127.0.0.1:17364`.
- `ableton_search_freesound` returned `FREESOUND_ERROR` with HTTP 401 because no `FREESOUND_API_KEY` was configured.
- `ableton_download_sample` and `ableton_import_sample_to_library` returned `FEATURE_DISABLED` because `ABLETON_MCP_ENABLE_DOWNLOADS=0`.

## UI driver smoke test

The Ableton UI driver was restarted onto the current rebuilt code on `127.0.0.1:17365`.

Verified:

- `ableton_ui_driver_ping` returned `ok: true`.
- `ableton_capture_screenshot` with `dry_run=false` returned `ok: true`, captured `816x683`, and saved `diagnostics\screenshots\ableton-ui-2026-06-07T04-00-57-794Z-window.png`.
- `ableton_capture_region` with `dry_run=false` returned `ok: true`, captured a `320x180` Ableton-window-relative region, and saved `diagnostics\screenshots\ableton-ui-2026-06-07T04-00-59-168Z-region.png`.
- The full-window PNG was visually checked and correctly framed on `Ableton MCP Bridge Set - Ableton Live 12 Trial`.

The UI driver was left listening on `127.0.0.1:17365` for continued local control.

## Runtime state

- Ableton Live was running during the latest UI-driver smoke test.
- The Max for Live bridge was not loaded, so LiveAPI bridge runtime calls were not expected to succeed.
- Downloads/imports were not executed because downloads remain disabled by default.
- Write-gated Ableton tools were tested with `dry_run=true`.

## Current implementation notes

- All registered MCP tools, resources, and prompts were exercised.
- Root launchers support regular stdio MCP, Docker/HTTP MCP, bridge install, verifier, and UI-driver workflows.
- Platform-aware config supports Windows defaults, macOS defaults, and Linux/WSL headless MCP operation with environment path overrides.
- Other-device HTTP mode stays disabled by default and requires explicit remote enablement plus bearer-token auth.
- FastMCP-inspired runtime middleware wraps every tool with error handling, timing metrics, per-tool rate limiting, short read-only cache, and response-size limits.
- MCP resources and prompts are registered for environment, runtime, scan status, safe production planning, and security review.
- File operations enforce explicit allowed roots, realpath checks, and sensitive-path rejection.
- Remote sample tools reject arbitrary URLs and allow only approved Freesound and Internet Archive hosts.
- The Max for Live bridge source includes a Node-for-Max HTTP server and a LiveAPI handler for ping, snapshots, live-state reads, track/return/master/scene/clip-slot/clip/device/parameter/mixer listing, selected objects, tempo/transport, track and scene creation, clip creation/launch/stop/loop/rename, mixer volume/pan, device parameter setting, track arm/mute/solo, and track rename.
- The Ableton UI driver service includes loopback-only ping, status, Ableton window discovery, focus, Ableton-window-only screenshot capture, bounded region capture, window-relative click, and bounded text input.
