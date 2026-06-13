# Ableton MCP

Production-grade local MCP server for Ableton Live 12 on Windows.

Ableton MCP gives Codex and other MCP clients a secure local control surface for Ableton projects, libraries, samples, and runtime diagnostics. It is read-only by default, uses explicit feature gates for risky actions, and separates background LiveAPI control from foreground mouse/keyboard automation.

```text
MCP client -> stdio server -> Max for Live bridge -> Ableton LiveAPI
                         \-> UI driver fallback -> Ableton window
```

## Control Model

| Lane | Default | Use it for | User choice required |
| --- | --- | --- | --- |
| Background LiveAPI bridge | Enabled for reads, write-gated for changes | Session state, tracks, scenes, clips, devices, mixer, safe production automation | Writes require `ABLETON_MCP_ENABLE_WRITE=1` and `dry_run=false`. |
| Foreground UI/mouse driver | Disabled | Ableton-only screenshots, focus, clicks, and typing when LiveAPI cannot reach a control | Start `.\launch.ps1 ui-driver` or set `ABLETON_MCP_ENABLE_UI_CONTROL=1`. |

Use `ableton_get_production_readiness`, `ableton_control_mode_status`, and `ableton_ui_control_consent_status` before enabling write or UI control.

Named UI actions are preferred over raw coordinates. Use `ableton_list_safe_ui_actions` and `ableton_plan_ui_action_sequence` before any foreground click/type workflow. Raw coordinate clicks remain available only for explicit user-chosen fallback sessions.

## What this server can do

| Area | What is available |
| --- | --- |
| Environment | Find Ableton, Max, toolchain, allowed roots, flags, and process status. |
| Library index | Scan allowed Ableton folders on demand and search indexed samples, presets, clips, templates, and MIDI files. |
| Set analysis | Read `.als` files as gzip/XML summaries without modifying the original file. |
| Live session view | Read tracks, scenes, clips, devices, transport, tempo, mixer, and snapshots when the Max for Live bridge is loaded. |
| Live control | Run write-gated bridge commands with `dry_run` support and serialized queueing. |
| Automation and arrangement | Plan or write-gate automation envelopes, markers, clip moves, duplication, quantize, groove, and humanization. |
| UI fallback | Use a ChromeDriver-style local UI driver for Ableton-window focus, screenshots, clicks, and text only when foreground control is intentionally enabled. |
| Samples | Search Internet Archive and Freesound metadata, normalize license data, and gate downloads/imports behind explicit flags. |
| Concept-to-music | Turn a feeling, place, or liminal brief into a staged production plan, sample-search plan, arrangement skeleton, and delivery plan. |
| Plugins | Search curated plugin/package sources, plan downloads, validate staged packages, and stage approved downloads without running installers. |
| Export planning | Validate export settings and prepare stem/export plans without rendering or touching files. |
| Safety/evals | Run security checks, runtime reports, bridge mock checks, sample license tests, and full MCP verification. |

## Start locally

For first-time setup, generate ready-to-use client configs:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 setup
```

This builds the server, installs the Max for Live bridge files, and writes Codex, Claude Desktop, Cursor, WSL, local HTTP, and Tailscale HTTP configs under `config/generated/`. Remote HTTP configs use the default Tailscale URL `http://100.84.223.22:17366/mcp` with a generated bearer token stored only in the ignored generated config folder.

One command is enough for normal use:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 stdio
```

For Git Bash or another Unix-style shell on Windows:

```bash
./launch.sh stdio
```

The launcher installs dependencies if needed, builds the TypeScript output, installs the Max for Live bridge preset files, and then starts the MCP server. Setup logs go to stderr so stdio MCP clients still receive clean JSON-RPC on stdout.

Use these launch modes:

| Mode | Command | Purpose |
| --- | --- | --- |
| Regular MCP | `.\launch.ps1 stdio` | Starts the local stdio MCP server for Codex, Claude Desktop, Cursor, or another regular MCP client. |
| Docker MCP | `.\launch.ps1 docker` | Starts the local Streamable HTTP MCP transport at `http://127.0.0.1:17366/mcp` for Docker MCP catalogs. |
| Bridge install | `.\launch.ps1 install` | Installs the Ableton Max for Live preset and companion files without starting a server. |
| Setup | `.\launch.ps1 setup` | Generates ready-to-use client configs with secure defaults. |
| Verify | `.\launch.ps1 verify` | Builds, installs the bridge files, then runs the MCP verifier. |
| Full check | `.\launch.ps1 check` | Runs build, tests, lint, doctor, release check, safe and all-tool sweeps, MCP verifier, and npm audit. |
| Live smoke | `.\launch.ps1 live-smoke` | Confirms Ableton Live bridge readiness with read-only and dry-run calls only. |
| UI driver | `.\launch.ps1 ui-driver` | Starts the foreground Ableton UI driver with UI control enabled. |

Pass `-SkipSetup` after first setup when you want fast startup from existing `dist` and installed bridge files. Generated client configs use this fast path by default, so rerun `.\launch.ps1 setup` after code updates that need a rebuild or bridge reinstall.

Manual development commands still work:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
npm install
npm run build
npm run bridge:install
npm test
npm run lint
```

Start the MCP server through the launcher, not `npm start`, when an MCP client is attached:

```powershell
.\launch.ps1 stdio -SkipSetup
```

Inspect the MCP tool surface:

```powershell
npm run inspect
```

Run the verifier:

```powershell
npm run verify:mcp
```

Regular MCP clients can use [.mcp.json](.mcp.json), which now points at `launch.cmd stdio`. Docker MCP clients can use [docker/ableton-mcp.catalog.yaml](docker/ableton-mcp.catalog.yaml) after the host HTTP launcher is running.

## Use the two control lanes

Ableton MCP has two control lanes. Use the background bridge first; use the UI driver only for UI-only workflows.

| Mode | Port | Default | Purpose |
| --- | --- | --- | --- |
| Max for Live bridge | `127.0.0.1:17364` | Preferred | Background LiveAPI reads and write-gated Ableton actions. |
| Ableton UI driver | `127.0.0.1:17365` | Disabled | Foreground Ableton-window focus, clicks, and text input. |

### Run background bridge control

Load the bridge patch in Ableton:

```text
bridge\max-for-live\ableton-mcp-bridge.maxpat
```

Keep these files in the same folder:

```text
Ableton MCP Bridge.amxd
ableton-mcp-bridge.maxpat
ableton-mcp-http.js
ableton-mcp-liveapi.js
ableton-mcp-status.js
package.json
```

The companion files can be installed automatically into the Ableton User Library preset folder with:

```powershell
npm run bridge:install
```

Then call:

```text
ableton_bridge_ping
ableton_get_live_state
ableton_get_full_snapshot
```

For a fast end-to-end bridge confidence check that does not write to the Live Set:

```powershell
.\launch.ps1 live-smoke -SkipSetup
```

### Run foreground UI driver control

Run:

```powershell
.\launch.ps1 ui-driver
```

Then use:

```text
ableton_ui_driver_ping
ableton_window_status
ableton_focus_window
ableton_capture_screenshot
ableton_capture_region
ableton_click_coordinates
ableton_type_text
```

`click_coordinates` and `capture_region` use Ableton-window-relative coordinates. Screenshots are saved as PNG diagnostics under `diagnostics\screenshots` after the driver focuses the Ableton window and verifies bounded window coordinates.

## Configure feature gates

The server is conservative by default:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Turn on a gate only for the workflow that needs it:

| Flag | Enables |
| --- | --- |
| `ABLETON_MCP_ENABLE_WRITE=1` | Launching Ableton and sending write-gated LiveAPI bridge actions. |
| `ABLETON_MCP_ENABLE_UI_CONTROL=1` | UI-driver ping, focus, click, type, and capture requests. |
| `ABLETON_MCP_ENABLE_DOWNLOADS=1` | Approved sample downloads and imports with attribution metadata. |

## File access policy

Only these roots are allowed:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp
C:\Users\LIZ\Documents\Ableton
C:\ProgramData\Ableton\Live 12 Trial
```

The Ableton install root is read-only. Broad user folders, broad AppData, browser profiles, password stores, credential folders, raw private network URLs, and arbitrary shell execution are rejected.

## Verified local paths

```text
Ableton Live: C:\ProgramData\Ableton\Live 12 Trial\Program\Ableton Live 12 Trial.exe
Bundled Max: C:\ProgramData\Ableton\Live 12 Trial\Resources\Max\Max.exe
User Library: C:\Users\LIZ\Documents\Ableton\User Library
Factory Packs: C:\Users\LIZ\Documents\Ableton\Factory Packs
Live Recordings: C:\Users\LIZ\Documents\Ableton\Live Recordings
```

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System layers, runtime middleware, queues, and control model. |
| [Ableton bridge](docs/ABLETON_BRIDGE.md) | Max for Live bridge setup and LiveAPI capability notes. |
| [Ableton UI driver](docs/ABLETON_UI_DRIVER.md) | ChromeDriver-style foreground UI driver contract and runtime behavior. |
| [Launch modes](docs/LAUNCH.md) | One-command stdio, Docker MCP HTTP, installer, verifier, and UI-driver workflows. |
| [Docker MCP](docs/DOCKER_MCP.md) | How to connect Docker MCP to the local Windows Ableton host service. |
| [HyperNimbus Docker MCP](docs/HYPERNIMBUS_DOCKER_MCP.md) | Safe local-only HyperNimbus Docker MCP profile activation and OpenClaw registry notes. |
| [Concept to music](docs/CONCEPT_TO_MUSIC.md) | Staged concept, sample, arrangement, execution, and delivery workflow. |
| [Platform compatibility](docs/PORTABILITY.md) | Windows, WSL, macOS, and Linux support model with environment overrides. |
| [Client compatibility](docs/CLIENTS.md) | Codex, Claude, Docker MCP, WSL, remote devices, and model-provider host apps. |
| [Config templates](config) | Ready-made starting configs for Codex, Claude Desktop, Cursor, WSL, OpenClaw, and remote HTTP clients. |
| [Security](SECURITY.md) | Feature gates, path policy, network rules, runtime guardrails, and subprocess policy. |
| [Tool reference](docs/TOOL_REFERENCE.md) | Tool groups, MCP resources, prompts, and verification commands. |
| [Sample policy](docs/SAMPLE_POLICY.md) | Licensing, attribution, and import metadata rules. |
| [Sample sources](docs/SAMPLE_SOURCES.md) | Approved remote sources and download/import paths. |
| [Plugin policy](docs/PLUGIN_POLICY.md) | Plugin/package discovery, download staging, and no-install safety policy. |
| [Local paths](docs/LOCAL_PATHS.md) | Verified Ableton, Max, library, and database paths. |
| [Verification](docs/FINAL_VERIFICATION.md) | Latest build, test, MCP, audit, and runtime sweep results. |

## Current verification status

Latest local verification:

```text
Build: passed
Tests: 22 files, 63 tests passed
Lint: passed
Doctor: passed with 0 failures; runtime listener checks may warn when bridge/UI/HTTP services are not currently loaded
Release check: passed
Safe sweep: passed
Live smoke: structured setup failure when the Max for Live bridge is not loaded; dry-run write confirmed
Launcher install: launch.ps1, launch.cmd, and launch.sh passed
MCP verifier: 164 tools, 3 resources, 2 prompts
All-tool contract sweep: 164 registered tools, 164 safe calls
Docker-mode HTTP: existing node dist/src/http.js returned MCP initialize 200 on 127.0.0.1:17366
WSL native verifier: passed with ABLETON_MCP_USE_BASH_NODE=1 and ABLETON_MCP_SKIP_SETUP=1
Client profiles: Codex, Claude, Docker MCP, WSL, remote-device, OpenRouter, Gemini, llama.cpp, and Antigravity guidance available through ableton_mcp_get_client_connection_profiles
Audit: 0 vulnerabilities
```

Expected runtime gaps:

- Max for Live bridge calls return `BRIDGE_UNREACHABLE` until the bridge device is loaded in Ableton.
- Freesound search returns HTTP 401 without `FREESOUND_API_KEY`.
- Downloads and imports stay blocked while `ABLETON_MCP_ENABLE_DOWNLOADS=0`.
