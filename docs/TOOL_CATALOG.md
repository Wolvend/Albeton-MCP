# MCP Tool Catalog

The server currently registers 112 MCP tools.

Use this command to inspect the live catalog:

```powershell
npm run inspect
```

## Main tool groups

| Group | Examples |
| --- | --- |
| Environment and setup | `ableton_find_installation`, `ableton_get_environment`, `ableton_validate_config`, `ableton_live_status` |
| Control mode status | `ableton_control_mode_status`, `ableton_bridge_status`, `ableton_ui_driver_status` |
| Library and cache | `ableton_scan_library`, `ableton_search_library`, `ableton_get_scan_status` |
| Ableton set analysis | `ableton_analyze_set`, `ableton_get_set_summary`, `ableton_compare_sets` |
| Live bridge reads | `ableton_get_live_state`, `ableton_list_tracks`, `ableton_list_devices`, `ableton_get_transport` |
| Write-gated Live control | `ableton_set_tempo`, `ableton_create_clip`, `ableton_set_device_parameter`, `ableton_rename_track` |
| UI driver fallback | `ableton_ui_driver_ping`, `ableton_window_status`, `ableton_focus_window`, `ableton_click_coordinates` |
| Sample discovery/import | `ableton_search_internet_archive_audio`, `ableton_search_freesound`, `ableton_download_sample`, `ableton_import_sample_to_library` |
| Composition helpers | `ableton_generate_session_plan`, `ableton_suggest_effect_chain`, `ableton_validate_production_plan` |
| Runtime and evaluation | `ableton_mcp_health`, `ableton_mcp_security_report`, `ableton_mcp_run_eval_suite` |

## Context exposed through MCP

Resources:

- `ableton://environment`
- `ableton://runtime`
- `ableton://scan-status`

Prompts:

- `ableton-safe-production-session`
- `ableton-security-review`

All file tools enforce the configured path allowlist. All mutating tools are gated and should be run with `dry_run=true` before execution.
