# Final Verification Report

Date: 2026-06-13 local runtime checks

This report records the latest verification pass for the Ableton MCP production build.

## Current Surface

```text
Tools: 200
Resources: 3
Prompts: 2
HyperNimbus Docker MCP enabled tools: 125
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

Result: succeeded. Vitest reported 22 test files and 78 tests passed, including bridge capability matrix checks, bridge send-summary source checks, typed MIDI/sample tool schema checks, write-gated local audio conversion into approved staging/import roots, read-only concept preset catalog checks, read-only concept execution manifest checks, read-only concept attribution bundle checks, write-gated concept MIDI motif export planning, write-gated concept reference-audio layer preparation planning, read-only concept mix planning, prepared-audio manifest handoff into arrangement planning, full concept production planning without downloads or Ableton writes, concept execution preflight without bridge side effects, deterministic concept execution approval-id checks, concept execution unsupported-bridge response detection, write-enabled missing-approval rejection before bridge access, prompt argument sanitization checks, non-approving concept execution approval bundle checks, read-only concept device/automation readiness checks, production-readiness reporting across gates, clients, bridge state, concept workflow, and safety posture, track-send discovery schema checks, OpenClaw client config documentation checks, safe HyperNimbus/OpenClaw allowlist reporting checks, Docker MCP profile allowlist parsing checks, risky-tool drift rejection checks, concept arrangement checks for plan-derived MIDI, scene tempo/signature placeholders, clip rename/loop/gain/transpose/warp/marker polish, mix, send, staged device-chain and automation actions, approved reference-audio treatment assignment, unapproved reference-audio execution blocking, stored plan list/get redaction, local sample assignment redaction, sample attribution record checks, bounded attribution-report sidecar scanning, Internet Archive audio file candidate extraction, redirect rejection for sample/plugin downloads, unsupported LiveAPI dry-run behavior for device/automation/quantize controls, and concept execution write-gate rejection.

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

Result: succeeded. Safe sweep called 109 read-only and dry-run tools with 0 unexpected failures, including `ableton_mcp_get_safe_tool_allowlist`, `ableton_get_production_readiness` with non-probing bridge mode, `ableton_get_bridge_capabilities`, `ableton_list_track_sends`, `ableton_get_routing_overview`, `ableton_plan_concept_routing_readiness`, `ableton_render_concept_automation_map`, `ableton_get_return_track_mixer`, return/track color dry-runs, return-track rename dry-run, `ableton_set_return_track_volume` dry-run, master mixer dry-runs, scene launch/tempo/signature/color/rename dry-runs, audio clip shaping/color dry-runs, `ableton_list_internet_archive_audio_files`, `ableton_list_concept_presets`, `ableton_render_concept_execution_manifest`, `ableton_render_concept_attribution_bundle`, `ableton_render_concept_production_scorecard`, `ableton_list_concept_plans`, and `ableton_list_arrangement_plans`.

```powershell
npm run sweep:all
```

Result: succeeded. All-tool contract sweep called all 200 registered tools exactly once with safe read-only, dry-run, or intentionally gated arguments. It reported 0 missing specs, 0 extra specs, 0 duplicate specs, and 0 unexpected failures. The sweep now exercises safe allowlist reporting, production-readiness reporting, read-only bridge capability reporting, track-send discovery, a full routing overview, concept attribution bundle, concept production scorecard, concept routing readiness, and concept automation map rendering before live bridge writes. The concept workflow sweep exercises the read-only concept preset catalog -> stored concept plan with approved reference audio -> full concept production plan with scorecard -> read-only concept timeline -> read-only concept mix plan -> read-only concept automation map -> stored arrangement plan with scene tempo/signature/color setup, return-track mixer/color actions, scene and return-track rename dry-runs, and clip rename/loop/gain/transpose/warp/marker/color polish -> prepared-audio manifest arrangement build -> stored plan retrieval -> read-only execution preflight -> non-approving approval bundle -> read-only execution manifest -> read-only attribution bundle -> read-only production scorecard -> read-only routing readiness -> read-only device/automation readiness -> dry-run MIDI motif export -> dry-run audio-layer preparation -> dry-run execution.

The sweep covers `ableton_insert_midi_notes` with bounded typed note input, `ableton_load_preset_or_sample` with an approved staged audio fixture in dry-run mode, typed scene launch/tempo/signature/color/rename tools, typed track/return/master volume/pan/color tools, typed return-track rename, and the typed `ableton_rename_clip`, `ableton_set_clip_loop`, `ableton_set_clip_gain`, `ableton_transpose_clip`, `ableton_set_clip_warp`, `ableton_set_clip_markers`, and `ableton_set_clip_color` contracts. Concept arrangement plans now include created-track and created-scene placeholders for scene setup, color, volume, pan, reverb/delay sends, sparse MIDI motifs, clip names, loop boundaries, clip colors, approved local sample assignments, audio clip gain, pitch, warp, marker shaping, staged device-chain plans, staged automation metadata, a deterministic approval id, and a read-only readiness handoff for device/automation target discovery; real execution requires approval confirmation, reruns preflight, resolves executable placeholders from a live snapshot immediately before write-gated bridge calls, and stops on bridge-level `unsupported: true` results.

LiveAPI bridge source now includes track mixer send summaries in mixer reads/snapshots, a read-only routing overview with a send matrix, and `send_index` validation before `ableton_set_track_send` writes, so agents can inspect return routing before applying reverb/delay/texture sends.

```powershell
npm run verify:mcp
```

Result: succeeded. The verifier reported 200 tools, 3 resources, and 2 prompts. Path security rejected `C:\`, `%USERPROFILE%`, `%USERPROFILE%\.ssh`, and `%USERPROFILE%\AppData\Roaming`.

```powershell
npm audit --audit-level=moderate
```

Result: succeeded. npm reported 0 vulnerabilities.

## Docker MCP

```powershell
npm run docker:hypernimbus:verify
```

Result: succeeded. HyperNimbus still has `ableton-mcp` active as a remote MCP server. The verifier parsed Docker's enabled tool list and reported `expectedAllowedTools: 125`, `observedAllowedTools: 125`, `missingSafeTools: []`, `unexpectedAbletonTools: []`, and `unexpectedRiskyTools: []`.

The profile now includes:

```text
hypernimbus | remote | ableton-mcp
```

Risky tools checked as absent from the enabled list:

```text
ableton_execute_concept_plan
ableton_stage_concept_samples
ableton_download_sample
ableton_import_sample_to_library
ableton_click_coordinates
ableton_type_text
ableton_set_tempo
ableton_fire_scene
ableton_set_scene_tempo
ableton_set_scene_time_signature
ableton_set_master_volume
ableton_set_master_pan
ableton_set_clip_gain
ableton_transpose_clip
ableton_set_clip_warp
ableton_set_clip_markers
```

The host HTTP service was started with:

```powershell
.\launch.ps1 docker -SkipSetup
```

The host HTTP service was restarted after the latest build so Docker could query the rebuilt 200-tool server. A direct Streamable HTTP MCP probe reported `toolCount: 200`, `hasAttributionBundle: true`, and `hasAutomationMap: true`.

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
docker mcp gateway run --profile hypernimbus --dry-run --block-secrets
```

Result: succeeded. Docker loaded the HyperNimbus profile and listed `ableton-mcp` with 125 tools.

Note: `--block-network` is not used for this gateway check because `ableton-mcp` is configured as a Docker MCP remote server at `http://127.0.0.1:17366/mcp`; blocking network access can prevent Docker Gateway from reaching that local MCP endpoint.

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

Result: succeeded under WSL with 200 tools, 3 resources, and 2 prompts. Platform path security rejected `/`, `%USERPROFILE%`, `%USERPROFILE%/.ssh`, and `%USERPROFILE%/AppData/Roaming`.

```powershell
wsl.exe bash -lc 'cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp && ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh live-smoke'
```

Result: completed with the same structured setup failure as the Windows live-smoke check because the Max for Live bridge was not loaded/listening. The smoke report included the routing overview probe and reported `routingRows: null` because bridge reads were unavailable.

## Live Bridge Smoke

```powershell
.\launch.ps1 live-smoke -SkipSetup
```

Result: completed with structured setup failure, not fake success:

```text
ok: false
bridgeReachable: false
dryRunWriteConfirmed: true
routingRows: null
```

Reason: the Max for Live bridge was not loaded/listening on `127.0.0.1:17364` during this run. The workflow now calls `ableton_get_routing_overview` so a loaded bridge will also prove the send-matrix read path before real routing work. Next steps are to open Ableton Live, load the Ableton MCP Bridge Max for Live device, then rerun live-smoke.

## Security Notes

- HTTP remains localhost-only by default.
- HyperNimbus uses the safe tool allowlist. The bridge capability, safe allowlist, concept preset, concept execution manifest, concept attribution bundle, concept production scorecard, and concept mix-plan tools are read-only and included; color/write tools stay out of that allowlist and still require `dry_run=false` plus `ABLETON_MCP_ENABLE_WRITE=1` for real execution.
- Downloads, writes, and UI/mouse control remain disabled by default.
- Remote sample metadata and concept sample preview URLs are sanitized or validated against the approved sample URL policy before being returned.
- Concept reference audio now becomes executable only when it is already under approved sample roots; MCP responses redact the local path while stored plans retain the path for later gated execution.
- `ableton_list_internet_archive_audio_files` extracts bounded Internet Archive audio candidates from item metadata, validates item identifiers, constructs `archive.org/download` URLs, preserves attribution metadata, and recognizes common Creative Commons URL license forms.
- Real staged sample downloads now persist sidecar attribution with source URL, destination name, license policy, creator/title/identifier metadata, checksum, byte count, and staging time.
- `ableton_generate_attribution_report` now reads only bounded `.attribution.json` sidecars from sample staging and Codex Imports, redacts local paths, and sanitizes remote title/creator text for display.
- `ableton_render_concept_attribution_bundle` reads only exact `.attribution.json` sidecars for one stored concept arrangement's sample assignments, redacts local paths, reports missing sidecars and license warnings, and avoids broad scans.
- Docker/OpenClaw/client docs now treat Ableton MCP as the permission owner for write/download/UI gates.
