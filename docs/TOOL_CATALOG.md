# MCP Tool Catalog

The server currently registers 211 MCP tools.

Use this command to inspect the live catalog:

```powershell
npm run inspect
```

Core Live control tools expose field-level schemas for agent planning and validation. For example, tempo uses `tempo`, track/scene creation uses `name` and optional indexes, scene launch and scene tempo/signature tools use explicit scene indexes, clip tools use `track_index` and `clip_slot_index`, track/return/master mixer tools use bounded `value`, color tools use bounded RGB integer values, and device parameter writes use explicit track/device/parameter indexes. Real writes still require `dry_run=false` plus `ABLETON_MCP_ENABLE_WRITE=1`; concept-plan execution additionally requires the matching approval bundle id and preflight success.

Some LiveAPI write requests are intentionally capability-limited until the running Ableton bridge proves a reliable path. Device insertion, macro mapping, groove application, automation writes, clip quantization, and MIDI humanization return structured `unsupported: true` dry-run plans with next-step hints instead of fake success.

## Main tool groups

| Group | Examples |
| --- | --- |
| Environment and setup | `ableton_find_installation`, `ableton_get_environment`, `ableton_validate_config`, `ableton_live_status` |
| Control mode status | `ableton_control_mode_status`, `ableton_bridge_status`, `ableton_get_bridge_capabilities`, `ableton_ui_driver_status` |
| Production readiness | `ableton_get_production_readiness` reports planning/live-read/write-ready status across gates, client profiles, bridge reachability, concept workflow, and safety posture; `ableton_plan_agent_music_session` returns the exact safe agent workflow for turning a brief into concept, sample, arrangement, approval, and delivery calls; `ableton_ui_control_consent_status`, `ableton_plan_ui_control_session` |
| Named UI actions | `ableton_list_safe_ui_actions`, `ableton_plan_ui_action_sequence`, `ableton_run_ui_action_sequence` |
| Library and cache | `ableton_scan_library`, `ableton_search_library`, `ableton_get_scan_status` |
| Ableton set analysis | `ableton_analyze_set`, `ableton_get_set_summary`, `ableton_compare_sets` |
| Live bridge reads | `ableton_get_live_state`, `ableton_list_tracks`, `ableton_get_return_track_mixer`, `ableton_get_transport` |
| Write-gated Live control | `ableton_set_tempo`, `ableton_fire_scene`, `ableton_set_scene_tempo`, `ableton_rename_scene`, `ableton_rename_return_track`, `ableton_set_track_color`, `ableton_set_clip_color`, `ableton_create_clip`, `ableton_set_clip_gain`, `ableton_transpose_clip`, `ableton_set_master_volume`, `ableton_set_device_parameter` |
| Automation and arrangement | `ableton_create_automation_envelope`, `ableton_set_automation_point`, `ableton_create_arrangement_marker`, `ableton_quantize_clip` |
| Bridge discovery | `ableton_get_bridge_capabilities`, `ableton_list_arrangement_markers`, `ableton_get_clip_notes`, `ableton_get_clip_envelopes`, `ableton_get_device_parameter_map`, `ableton_extract_automation_summary` |
| UI driver fallback | `ableton_ui_driver_ping`, `ableton_window_status`, `ableton_focus_window`, `ableton_click_coordinates` |
| Sample discovery/import | `ableton_search_internet_archive_audio`, `ableton_list_internet_archive_audio_files`, `ableton_search_freesound`, `ableton_download_sample`, `ableton_import_sample_to_library` |
| Concept-to-music | `ableton_list_concept_presets`, `ableton_plan_reference_audio_intake`, `ableton_plan_full_concept_production`, `ableton_plan_concept_track`, `ableton_render_concept_timeline`, `ableton_render_concept_mix_plan`, `ableton_render_concept_automation_map`, `ableton_list_concept_plans`, `ableton_get_concept_plan`, `ableton_list_arrangement_plans`, `ableton_get_arrangement_plan`, `ableton_list_concept_execution_journals`, `ableton_get_concept_execution_journal`, `ableton_search_concept_samples`, `ableton_curate_concept_samples`, `ableton_stage_concept_samples`, `ableton_build_layered_arrangement_plan`, `ableton_export_concept_midi_motif`, `ableton_prepare_concept_audio_layers`, `ableton_build_arrangement_from_prepared_audio`, `ableton_preflight_concept_execution`, `ableton_render_concept_execution_action_matrix`, `ableton_render_concept_execution_manifest`, `ableton_render_concept_execution_runbook`, `ableton_render_concept_attribution_bundle`, `ableton_render_concept_production_scorecard`, `ableton_plan_concept_device_automation_readiness`, `ableton_render_concept_device_chain_spec`, `ableton_render_concept_device_catalog_matches`, `ableton_plan_concept_device_ui_placement`, `ableton_create_concept_execution_approval_bundle`, `ableton_execute_concept_plan`, `ableton_render_delivery_plan` |
| Plugin/package safety | `ableton_validate_plugin_package`, `ableton_scan_vst_folders`, `ableton_check_plugin_license_metadata` |
| Export planning | `ableton_plan_export_audio`, `ableton_validate_export_settings`, `ableton_prepare_stems_plan` |
| Composition helpers | `ableton_generate_session_plan`, `ableton_generate_midi_clip_plan`, `ableton_generate_drum_rack_plan`, `ableton_suggest_instrument_chain`, `ableton_suggest_effect_chain`, `ableton_suggest_arrangement`, `ableton_suggest_mix_actions`, `ableton_validate_production_plan` |
| Client configuration | `ableton_mcp_get_client_connection_profiles`, `ableton_mcp_get_client_bootstrap_bundle`, `ableton_mcp_get_safe_tool_allowlist` |
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

Composition helpers are read-only planning tools. They return tracks, sections, device-chain intentions, percussion pads, mix probes, safety gates, and exact next MCP calls for dry-run review; they do not download samples, insert devices, move the UI, or write Ableton state.
