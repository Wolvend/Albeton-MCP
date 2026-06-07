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
148 tools
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
- Bridge discovery for arrangement markers, clip notes, envelopes, and device parameter maps
- User-choice UI control consent and production readiness checks
- Screenshot and UI tools
- Legal sample discovery/import
- Plugin/package discovery, validation, and download staging
- Export and stem planning
- Composition helpers
- Developer/evaluation tools
- Runtime/security tools
- Client/device connection profiles

Control-mode tools:

- `ableton_control_mode_status`: reports background bridge default, UI fallback gate, and overlap policy.
- `ableton_bridge_status`: reports loopback host/port, serialized queue state, and last bridge action.
- `ableton_ui_driver_status`: reports the ChromeDriver-style Ableton UI driver endpoint and queue state.
- `ableton_ui_driver_ping`: pings the UI driver when UI control is enabled.
- `ableton_mcp_get_client_connection_profiles`: returns stdio, local HTTP, private-network, and model-provider host-app connection guidance.

Additional MCP context:

- Resources: `ableton://environment`, `ableton://runtime`, `ableton://scan-status`
- Prompts: `ableton-safe-production-session`, `ableton-security-review`

All file tools enforce allowed roots and reject broad or sensitive paths.

Write-capable tools require `ABLETON_MCP_ENABLE_WRITE=1` and should be called with `dry_run=true` first. UI-driver tools require `ABLETON_MCP_ENABLE_UI_CONTROL=1`. Download/import tools require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
