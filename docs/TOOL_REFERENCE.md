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
199 tools
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
- Concept-to-music preset catalog, planning, mix planning, attribution bundles, production scorecards, sample staging, execution manifests, arrangement execution, and delivery planning
- Export and stem planning
- Composition helpers
- Developer/evaluation tools
- Runtime/security tools
- Client/device connection profiles and safe tool allowlists

Control-mode tools:

- `ableton_control_mode_status`: reports background bridge default, UI fallback gate, and overlap policy.
- `ableton_bridge_status`: reports loopback host/port, serialized queue state, and last bridge action.
- `ableton_get_bridge_capabilities`: reports read-only, write-gated, unsupported, and diagnostic bridge actions; `check_bridge=true` compares against the loaded Max for Live bridge when available.
- `ableton_list_track_sends`: reads selected or indexed track send parameters and return-track names so agents can route layers before using write-gated send changes.
- `ableton_get_routing_overview`: reads tracks, returns, master state, and the send matrix in one call so agents can plan layered reverb/delay/texture routing quickly.
- `ableton_plan_concept_routing_readiness`: maps a stored concept arrangement's planned sends to routing-overview discovery calls and exact dry-run send templates.
- `ableton_render_concept_attribution_bundle`: reports attribution sidecars for one stored concept arrangement without broad scans or path exposure.
- `ableton_render_concept_production_scorecard`: scores a stored concept arrangement for layer coverage, sample readiness, routing, staged device/automation readiness, execution safety, and delivery readiness.
- `ableton_ui_driver_status`: reports the ChromeDriver-style Ableton UI driver endpoint and queue state.
- `ableton_ui_driver_ping`: pings the UI driver when UI control is enabled.
- `ableton_mcp_get_client_connection_profiles`: returns stdio, local HTTP, private-network, and model-provider host-app connection guidance.
- `ableton_mcp_get_safe_tool_allowlist`: returns the HyperNimbus/OpenClaw safe tool allowlist as structured data plus CSV without changing client configuration.

Additional MCP context:

- Resources: `ableton://environment`, `ableton://runtime`, `ableton://scan-status`
- Prompts: `ableton-safe-production-session`, `ableton-security-review`

All file tools enforce allowed roots and reject broad or sensitive paths.

Write-capable tools require `ABLETON_MCP_ENABLE_WRITE=1` and should be called with `dry_run=true` first. `ableton_execute_concept_plan` also requires the matching approval bundle `approval_id`, `approval_confirmed=true`, and a successful bridge preflight before real writes. LiveAPI operations that are not proven reliable for the current Ableton bridge return `unsupported: true` in dry-run mode with setup hints. UI-driver tools require `ABLETON_MCP_ENABLE_UI_CONTROL=1`. Download/import tools require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
