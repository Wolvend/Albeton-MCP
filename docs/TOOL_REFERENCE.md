# Tool Reference

Use MCP Inspector to list the current tool schemas:

```powershell
npm run build
npm run inspect
```

Run the local verifier:

```powershell
npm run verify:mcp
```

Current catalog size:

```text
206 tools
3 resources
2 prompts
```

Primary groups:

- Environment and setup
- Control mode and bridge status
- Library and cache
- Live Set analysis
- Fast live session view
- Write-gated Live control
- Automation, groove, and arrangement workflows
- Bridge capability reporting plus discovery for arrangement markers, clip notes, envelopes, and device parameter maps
- User-choice UI control consent and production readiness checks
- Named safe UI actions and dry-run action sequences
- Screenshot and UI tools
- Legal sample discovery/import
- Plugin/package discovery, validation, and download staging
- Concept-to-music preset catalog, planning, mix planning, attribution bundles, production scorecards, sample staging, execution action matrices, execution manifests, arrangement execution, and delivery planning
- Export and stem planning
- Composition helpers
- Developer/evaluation tools
- Runtime/security tools
- Client/device connection profiles and safe tool allowlists

Control-mode tools:

- `ableton_control_mode_status`: reports background bridge default, UI fallback gate, and overlap policy.
- `ableton_get_production_readiness`: reports current planning/live-control status across gates, HyperNimbus/OpenClaw/Codex client profiles, bridge reachability, concept-to-music readiness, safety posture, and exact next calls. Use `check_bridge=false` for a non-probing report.
- `ableton_plan_agent_music_session`: returns a side-effect-free phase plan for Codex, HyperNimbus, OpenClaw, Claude, OpenRouter host apps, Gemini host apps, llama.cpp wrappers, and Antigravity to turn a mood/place brief into concept, sample, arrangement, approval, and delivery calls.
- `ableton_bridge_status`: reports loopback host/port, serialized queue state, and last bridge action.
- `ableton_get_bridge_capabilities`: reports read-only, write-gated, unsupported, and diagnostic bridge actions; `check_bridge=true` compares against the loaded Max for Live bridge when available.
- `ableton_list_track_sends`: reads selected or indexed track send parameters and return-track names so agents can route layers before using write-gated send changes.
- `ableton_get_routing_overview`: reads tracks, returns, master state, and the send matrix in one call so agents can plan layered reverb/delay/texture routing quickly.
- `ableton_plan_concept_routing_readiness`: maps a stored concept arrangement's planned sends to routing-overview discovery calls and exact dry-run send templates.
- `ableton_plan_concept_device_automation_readiness`: maps staged concept device chains and automation lanes to device discovery, `ableton_extract_automation_summary`, and dry-run write templates.
- `ableton_render_concept_execution_action_matrix`: renders each stored arrangement action with bridge capability status, write gates, placeholder dependencies, staged-only notes, and direct dry-run availability.
- `ableton_extract_automation_summary`: reads live mixer/device automation target candidates with bounded parameter output; breakpoint writes remain unsupported unless a bridge reports support.
- `ableton_render_concept_automation_map`: renders deterministic concept automation lanes with section times, beat positions, target hints, candidate devices, and dry-run templates without writes.
- `ableton_curate_concept_samples`: maps stored concept layers to licensed sample-search candidates, layer review notes, and dry-run staging templates without downloads.
- `ableton_render_concept_attribution_bundle`: reports attribution sidecars for one stored concept arrangement without broad scans or path exposure.
- `ableton_render_concept_production_scorecard`: scores a stored concept arrangement for layer coverage, sample readiness, routing, staged device/automation readiness, execution safety, and delivery readiness.
- `ableton_list_concept_execution_journals` and `ableton_get_concept_execution_journal`: inspect redacted real-execution diagnostics after write-gated concept runs.
- `ableton_ui_driver_status`: reports the ChromeDriver-style Ableton UI driver endpoint and queue state.
- `ableton_ui_driver_ping`: pings the UI driver when UI control is enabled.
- `ableton_mcp_get_client_connection_profiles`: returns stdio, local HTTP, private-network, and model-provider host-app connection guidance.
- `ableton_mcp_get_client_bootstrap_bundle`: returns a one-call safe bootstrap bundle for Codex, Claude, Docker MCP, OpenClaw, OpenRouter host apps, Gemini host apps, llama.cpp wrappers, and Antigravity.
- `ableton_mcp_get_safe_tool_allowlist`: returns the HyperNimbus/OpenClaw safe tool allowlist as structured data plus CSV without changing client configuration.

Additional MCP context:

- Resources: `ableton://environment`, `ableton://runtime`, `ableton://scan-status`
- Prompts: `ableton-safe-production-session`, `ableton-security-review`

All file tools enforce allowed roots and reject broad or sensitive paths.

Write-capable tools require `ABLETON_MCP_ENABLE_WRITE=1` and should be called with `dry_run=true` first. `ableton_execute_concept_plan` also requires the matching approval bundle `approval_id`, `approval_confirmed=true`, and a successful bridge preflight before real writes. Real stored-plan execution writes a redacted diagnostic journal under `diagnostics\runtime\concept-executions`. If the bridge returns `unsupported: true` during stored-plan execution, the executor stops with `CONCEPT_EXECUTION_UNSUPPORTED_ACTION` instead of reporting a successful run. LiveAPI operations that are not proven reliable for the current Ableton bridge return `unsupported: true` in dry-run mode with setup hints. UI-driver tools require `ABLETON_MCP_ENABLE_UI_CONTROL=1`. Download/import tools require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
