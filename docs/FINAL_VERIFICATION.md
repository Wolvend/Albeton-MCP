# Final Verification Report

Date: 2026-06-13 local runtime checks

This report records the latest verification pass for the Ableton MCP production build.

## Current Surface

```text
Tools: 159
Resources: 3
Prompts: 2
HyperNimbus Docker MCP enabled tools: 104
Default HTTP endpoint: http://127.0.0.1:17366/mcp
```

Default gates remained off during verification:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
ABLETON_MCP_HTTP_ALLOW_REMOTE=0
```

## Commands Run

```powershell
npm run build
```

Result: succeeded.

```powershell
npm test
```

Result: succeeded. Vitest reported 22 test files and 59 tests passed, including typed MIDI/sample tool schema checks, OpenClaw client config documentation checks, concept arrangement checks for plan-derived MIDI, mix, send, staged device-chain and automation actions, approved reference-audio treatment assignment, unapproved reference-audio execution blocking, local sample assignment redaction, sample attribution record checks, bounded attribution-report sidecar scanning, Internet Archive audio file candidate extraction, redirect rejection for sample/plugin downloads, unsupported LiveAPI dry-run behavior for device/automation/quantize controls, and concept execution write-gate rejection.

```powershell
npm run lint
```

Result: succeeded.

```powershell
npm run doctor
```

Result: succeeded. Doctor reported 8 checks, 0 failures, and 2 runtime warnings because the UI driver on `127.0.0.1:17365` and Max for Live bridge on `127.0.0.1:17364` were not loaded. The HTTP transport on `127.0.0.1:17366` was reachable.

```powershell
npm run release:check
```

Result: succeeded. Release check found no missing required files or scripts. It reported working-tree-only folders that must stay excluded from release archives: `node_modules`, `diagnostics/screenshots`, `diagnostics/runtime`, and `data/cache`.

```powershell
npm run sweep:safe
```

Result: succeeded. Safe sweep called 79 read-only and dry-run tools with 0 unexpected failures, including `ableton_list_internet_archive_audio_files`.

```powershell
npm run sweep:all
```

Result: succeeded. All-tool contract sweep called all 159 registered tools exactly once with safe read-only, dry-run, or intentionally gated arguments. It reported 0 missing specs, 0 extra specs, 0 duplicate specs, and 0 unexpected failures. The concept workflow sweep now exercises stored concept plan -> stored arrangement plan -> dry-run execution.

The sweep covers `ableton_insert_midi_notes` with bounded typed note input and `ableton_load_preset_or_sample` with an approved staged audio fixture in dry-run mode. Concept arrangement plans now include created-track placeholders for volume, pan, reverb/delay sends, sparse MIDI motifs, approved local sample assignments, staged device-chain plans, and staged automation metadata; real execution resolves those placeholders from a live snapshot immediately before write-gated bridge calls.

```powershell
npm run verify:mcp
```

Result: succeeded. The verifier reported 159 tools, 3 resources, and 2 prompts. Path security rejected `C:\`, `%USERPROFILE%`, `%USERPROFILE%\.ssh`, and `%USERPROFILE%\AppData\Roaming`.

```powershell
npm audit --audit-level=moderate
```

Result: succeeded. npm reported 0 vulnerabilities.

## Docker MCP

```powershell
npm run docker:hypernimbus:verify
```

Result: succeeded. HyperNimbus still has `ableton-mcp` active as a remote MCP server with the 104-tool safe allowlist.

The profile now includes:

```text
hypernimbus | remote | ableton-mcp
```

Risky tools checked as absent from the enabled list:

```text
ableton_execute_concept_plan
ableton_stage_concept_samples
ableton_download_sample
ableton_click_coordinates
ableton_set_tempo
```

The host HTTP service was started with:

```powershell
.\launch.ps1 docker -SkipSetup
```

The host HTTP service was restarted after the latest build so Docker could query the rebuilt 159-tool server.

Health result:

```text
ok: true
transport: streamable-http
host: 127.0.0.1
port: 17366
authRequired: false
```

MCP initialize over Streamable HTTP succeeded when the request included:

```text
Accept: application/json, text/event-stream
```

Docker gateway dry-run:

```powershell
docker mcp gateway run --profile hypernimbus --dry-run --block-secrets --block-network
```

Result: succeeded. Docker loaded the HyperNimbus profile and listed `ableton-mcp` with 104 tools.

OpenClaw docs/config were updated and tested for Streamable HTTP consumer setup:

```powershell
openclaw mcp add ableton-mcp --url http://127.0.0.1:17366/mcp --transport streamable-http --timeout 30 --connect-timeout 5
openclaw mcp tools ableton-mcp --include "$safeTools"
openclaw mcp doctor ableton-mcp --probe
```

## WSL

```powershell
wsl.exe bash -lc 'cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp && ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify'
```

Result: succeeded under WSL with 159 tools, 3 resources, and 2 prompts. Platform path security rejected `/`, `%USERPROFILE%`, `%USERPROFILE%/.ssh`, and `%USERPROFILE%/AppData/Roaming`.

## Live Bridge Smoke

```powershell
.\launch.ps1 live-smoke -SkipSetup
```

Result: completed with structured setup failure, not fake success:

```text
ok: false
bridgeReachable: false
dryRunWriteConfirmed: true
```

Reason: the Max for Live bridge was not loaded/listening on `127.0.0.1:17364` during this run. Next steps are to open Ableton Live, load the Ableton MCP Bridge Max for Live device, then rerun live-smoke.

## Security Notes

- HTTP remains localhost-only by default.
- HyperNimbus uses the safe tool allowlist.
- Downloads, writes, and UI/mouse control remain disabled by default.
- Remote sample metadata and concept sample preview URLs are sanitized or validated against the approved sample URL policy before being returned.
- Concept reference audio now becomes executable only when it is already under approved sample roots; MCP responses redact the local path while stored plans retain the path for later gated execution.
- `ableton_list_internet_archive_audio_files` extracts bounded Internet Archive audio candidates from item metadata, validates item identifiers, constructs `archive.org/download` URLs, preserves attribution metadata, and recognizes common Creative Commons URL license forms.
- Real staged sample downloads now persist sidecar attribution with source URL, destination name, license policy, creator/title/identifier metadata, checksum, byte count, and staging time.
- `ableton_generate_attribution_report` now reads only bounded `.attribution.json` sidecars from sample staging and Codex Imports, redacts local paths, and sanitizes remote title/creator text for display.
- Docker/OpenClaw/client docs now treat Ableton MCP as the permission owner for write/download/UI gates.
