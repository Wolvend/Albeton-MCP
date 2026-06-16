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
317 tools
3 resources
2 prompts
```

Primary groups:

- Environment and setup
- Control mode and bridge status
- Library and cache
- Live Set analysis
- Fast live session view
- Compact large-set bridge reads
- Write-gated Live control
- Automation, groove, and arrangement workflows
- Professional arrangement/effect/automation/export dry-run tools
- Offline LUFS, clipping, spectrum, reference checks, and sample musical intelligence
- Bridge capability reporting plus discovery for Browser trees/items, arrangement markers/clips, clip notes, envelopes, and device parameter maps
- User-choice UI control consent and production readiness checks
- Named safe UI actions and dry-run action sequences
- Screenshot and UI tools
- Legal sample discovery/import
- Source usage mode for private experiments and release candidates
- Producer workflow facade and smaller tool packs for default agents
- Producer-brain planning for briefs, mood, tempo, harmony, hooks, layer stacks, moments, and negative space
- Sound-design brain for synth, Operator, Wavetable, Drift, Sampler, granular, rack macro, and patch scoring plans
- Render/revision/mix analysis for render quality, masking, mud/harshness/sibilance, phase/mono risk, low-end control, balance, translation, stereo depth, and revision passes
- Capability honesty and handoff tools
- Plugin/package discovery, validation, and download staging
- Concept-to-music preset catalog, planning, source-audio transformation plans, mix planning, device-chain specs, indexed device catalog match reports, user-gated UI placement plans, attribution bundles, production scorecards, sample staging, execution action matrices, execution manifests, execution runbooks, arrangement execution, and delivery planning
- Export and stem planning
- Composition helpers
- Developer/evaluation tools
- Runtime/security tools
- Client/device connection profiles and safe tool allowlists

Control-mode tools:

- `ableton_control_mode_status`: reports background bridge default, UI fallback gate, and overlap policy.
- `ableton_get_production_readiness`: reports current planning/live-control status across gates, Docker/OpenClaw/Codex client profiles, bridge reachability, concept-to-music readiness, safety posture, and exact next calls. Use `check_bridge=false` for a non-probing report.
- `ableton_mcp_get_objective_readiness_report`: returns the objective-level readiness report for default client safety, Docker/OpenClaw profile state, multi-client bootstrap support, concept-to-music workflow readiness, LiveAPI bridge reachability, live-control coverage, real-execution gates, optional UI/mouse control, verification commands, and remaining blockers.
- `ableton_mcp_get_launch_readiness_audit`: returns a compact read-only checklist covering safe defaults, client profile allowlist state, concept workflow readiness, bridge reachability, optional UI-driver gating, LiveAPI music-control coverage, dry-run smoke calls, and exact next calls.
- `ableton_plan_agent_music_session`: returns a side-effect-free phase plan for Codex, Docker MCP, OpenClaw, Claude, OpenRouter host apps, Gemini host apps, llama.cpp wrappers, and Antigravity to turn a mood/place brief into concept, sample, arrangement, approval, and delivery calls.
- `ableton_bridge_status`: reports loopback host/port, serialized queue state, and last bridge action.
- `ableton_bridge_setup_status`: reports installed bridge file freshness using SHA-256 source/target comparisons, Ableton process state, and optional listener reachability when `check_bridge=true`.
- `ableton_open_bridge_device`: dry-runs or, when explicitly write-gated, opens the installed `Ableton MCP Bridge.amxd` preset through the host OS/Ableton association so the bridge can be loaded without mouse driving.
- `ableton_get_bridge_capabilities`: reports read-only, write-gated, unsupported, and diagnostic bridge actions; `check_bridge=true` compares against the loaded Max for Live bridge when available.
- `ableton_list_tracks_compact`, `ableton_get_track_detail`, and `ableton_get_clip_detail`: inspect large Live Sets through bounded targeted reads instead of requesting the full snapshot.
- `ableton_list_track_sends`: reads selected or indexed track send parameters and return-track names so agents can route layers before using write-gated send changes.
- `ableton_get_routing_overview`: reads tracks, returns, master state, and the send matrix in one call so agents can plan layered reverb/delay/texture routing quickly.
- `ableton_plan_concept_routing_readiness`: maps a stored concept arrangement's planned sends to routing-overview discovery calls and exact dry-run send templates.
- `ableton_plan_concept_device_automation_readiness`: maps staged concept device chains and automation lanes to device discovery, `ableton_extract_automation_summary`, and dry-run write templates.
- `ableton_browse_live_devices`: returns an offline Ableton-native device browser plan by default; with `check_bridge=true`, reads bounded `live_app browser` BrowserItem metadata through the Max for Live bridge without loading or inserting devices. `max_items` is a total per-category item budget and `max_depth` is capped at 2.
- `ableton_get_browser_tree` and `ableton_get_browser_items_at_path`: reference-compatible, read-only Browser discovery calls. They return bounded BrowserItem metadata and path hints only; they never call Browser `load_item`.
- `ableton_render_concept_device_chain_spec`: renders the staged device chains as a production-ready review spec with layer roles, device order, conservative parameter hints, automation links, discovery calls, and dry-run templates.
- `ableton_render_concept_device_catalog_matches`: matches staged device-chain names against already-indexed Ableton presets, Max devices, and optional plugin presets without scanning, writing, or exposing local paths.
- `ableton_plan_concept_device_ui_placement`: plans explicit user-gated foreground UI placement for staged concept devices without moving the mouse, typing, inserting devices, or using raw coordinates.
- `ableton_begin_concept_device_ui_session`: dry-run-first foreground readiness session for staged concept devices; when `ABLETON_MCP_ENABLE_UI_CONTROL=1`, it only focuses Ableton and captures Browser/Detail regions, with no clicks, typing, or device insertion.
- `ableton_plan_reference_audio_intake`: classifies a local reference-audio path as ready, needing staging/import, or unsupported without reading unapproved paths.
- `ableton_plan_source_audio_transformation`: maps approved or not-yet-staged source audio into liminal concept treatments, layer roles, dry-run conversion templates, and exact next calls without reading unapproved paths or writing files.
- `ableton_render_concept_execution_action_matrix`: renders each stored arrangement action with bridge capability status, write gates, placeholder dependencies, staged-only notes, and direct dry-run availability.
- `ableton_render_concept_execution_runbook`: renders a read-only execution rehearsal with ordered phases, gates, dependencies, expected postconditions, and inspection calls before approval or real writes.
- `ableton_extract_automation_summary`: reads live mixer/device automation target candidates with bounded parameter output; breakpoint writes remain unsupported unless a bridge reports support.
- `ableton_write_track_volume_automation`, `ableton_write_send_automation`, and `ableton_write_device_parameter_automation`: create explicit dry-run automation lane plans and return unsupported for real breakpoint writes until the bridge can prove support.
- `ableton_get_arrangement_clips`: reads Arrangement View clips for one track when Live exposes `arrangement_clips`.
- `ableton_switch_to_arrangement_view`, `ableton_set_arrangement_time`, and `ableton_duplicate_session_clip_to_arrangement`: reference-inspired Arrangement helpers. They are dry-run first and write-gated because they change the visible Live view, playhead, or arrangement content.
- `ableton_place_sample_on_arrangement`, `ableton_create_arrangement_audio_clip`, `ableton_move_arrangement_clip`, and `ableton_set_arrangement_loop`: typed Arrangement View planning tools; direct sample placement/edit/export calls remain unsupported by the current background bridge.
- `ableton_load_drum_kit`: plans Drum Rack/kit Browser loading from typed paths but returns unsupported for real execution until Browser `load_item` insertion has a proven safe path.
- `ableton_insert_stock_audio_effect`, `ableton_apply_effect_chain_preset`, and `ableton_create_return_effect_bus`: professional device-chain/bus planning tools that avoid partial side effects while named device insertion remains unsupported.
- `ableton_reverse_clip_to_sample` and `ableton_crop_clip`: write-gated local ffmpeg transforms for approved source audio into staging/import paths; dry-run by default and never overwrite.
- `ableton_analyze_lufs`, `ableton_analyze_spectrum`, `ableton_detect_clipping`, and `ableton_compare_reference`: read-only ffmpeg-backed mix checks for rendered masters and references.
- `ableton_analyze_sample_musical_features`: reads an allowed local sample and returns heuristic BPM/key candidates, loudness, transient density, energy balance, hiss/noise estimate, vocal likelihood, loopability, and texture tags.
- `ableton_detect_key_bpm_confidence`: returns BPM/key candidates with confidence and ambiguity warnings instead of a single overconfident answer.
- `ableton_find_best_loop_points`: finds zero-crossing loop candidates with crossfade suggestions and warnings without writing files.
- `ableton_match_samples_to_concept`: ranks local or metadata-only candidates against a concept and role list, sanitizing remote text and avoiding URL fetches.
- `ableton_build_sample_intelligence_index`: builds a bounded SQLite-backed index under `ABLETON_MCP_SAMPLE_LIBRARY_ROOT` only; it never runs on startup and skips excluded/generated folders by default.
- `ableton_search_sample_intelligence`: searches the local sample index by query, source pack, role hints, and page with redacted paths.
- `ableton_get_sample_intelligence_item`: reads one indexed sample row by id with path redaction and attribution state.
- `ableton_plan_sample_chop_map`: creates a dry-run chop/slicing plan from an indexed sample or allowed local path without writing files.
- `ableton_render_concept_automation_map`: renders deterministic concept automation lanes with section times, beat positions, target hints, candidate devices, and dry-run templates without writes.
- `ableton_list_free_sample_sources`: reports the approved free/sample-source registry, license rules, host boundaries, search modes, and download modes for agent source selection.
- `ableton_search_free_sample_sources`: searches live API-backed sources where possible and returns manual search plans for sources that require item-page review.
- `ableton_plan_free_sample_download`: creates a dry-run-first staging plan for a selected source URL or `source_url`; YouTube and SoundCloud remain manual-proof only and are never stream-ripped.
- `ableton_curate_concept_samples`: maps stored concept layers to licensed sample-search candidates, layer review notes, and dry-run staging templates without downloads.
- `ableton_render_concept_attribution_bundle`: reports attribution sidecars for one stored concept arrangement without broad scans or path exposure.
- `ableton_render_concept_production_scorecard`: scores a stored concept arrangement for layer coverage, sample readiness, routing, staged device/automation readiness, execution safety, and delivery readiness.
- `ableton_list_concept_execution_journals` and `ableton_get_concept_execution_journal`: inspect redacted real-execution diagnostics after write-gated concept runs.
- `ableton_ui_driver_status`: reports the ChromeDriver-style Ableton UI driver endpoint and queue state.
- `ableton_ui_driver_ping`: pings the UI driver when UI control is enabled.
- `ableton_mcp_get_client_connection_profiles`: returns stdio, local HTTP, private-network, and model-provider host-app connection guidance.
- `ableton_mcp_get_client_bootstrap_bundle`: returns a one-call safe bootstrap bundle for Codex, Claude, Docker MCP, OpenClaw, OpenRouter host apps, Gemini host apps, llama.cpp wrappers, and Antigravity.
- `ableton_mcp_get_safe_tool_allowlist`: returns the Docker/OpenClaw safe tool allowlist as structured data plus CSV without changing client configuration.
- `ableton_mcp_get_tool_packs`: returns smaller recommended tool packs for `minimal_producer`, `immersive_producer`, `sound_designer`, `mix_engineer`, `live_operator`, and `developer_debug` clients.
- `ableton_set_project_usage_mode` and `ableton_get_project_usage_mode`: switch or read source-review mode. `private_experiment` records unverified sources without blocking iteration; `release_candidate` treats unverified sources as release blockers or warnings.
- `ableton_create_source_manifest`, `ableton_mark_source_as_user_provided`, `ableton_mark_source_as_experiment_only`, and `ableton_check_release_source_readiness`: create bounded source manifests and distinguish private experimentation from release packaging.
- `ableton_create_production_session`, `ableton_produce_track_from_brief`, `ableton_get_production_session`, and `ableton_list_production_sessions`: create and inspect bounded producer-facade sessions under `diagnostics/runtime/production-sessions`; the one-call facade composes existing internal modules, returns exact next calls, and stays dry-run/read-only by default.
- `ableton_generate_song_blueprint`, `ableton_design_signature_sound_palette`, `ableton_prepare_production_assets`, and `ableton_create_execution_plan`: move a session from brief to blueprint, sound design, source strategy, and dry-run Ableton action planning without executing writes.
- `ableton_advance_production_session`, `ableton_review_render_and_revise`, and `ableton_score_track_professionalism`: advance one bounded workflow phase, analyze allowed local renders/stems, store one focused revision pass, and score planning/audio readiness.
- `ableton_parse_music_brief`, `ableton_compile_mood_palette`, `ableton_plan_tempo_grid`, `ableton_generate_harmonic_palette`, `ableton_generate_motif_system`, `ableton_score_hook_memorability`, `ableton_plan_layer_stack`, `ableton_create_moment_map`, and `ableton_plan_negative_space`: turn a user brief into executable producer decisions before adding tracks.
- `ableton_design_synth_patch`, `ableton_design_operator_patch`, `ableton_design_wavetable_patch`, `ableton_design_drift_patch`, `ableton_design_sampler_instrument`, `ableton_design_granular_texture`, `ableton_design_rack_macros`, `ableton_score_sound_design_maturity`, and `ableton_score_patch_against_concept`: plan and score professional sound design without pretending to insert devices.
- `ableton_score_arrangement_arc`, `ableton_score_arrangement_motion`, `ableton_score_density_curve`, `ableton_generate_automation_curves`, `ableton_generate_revision_pass`, `ableton_generate_next_revision_pass`, and `ableton_compare_render_versions`: keep arrangement and revision work focused on one measurable improvement pass at a time.
- `ableton_analyze_render_quality`, `ableton_detect_frequency_masking`, `ableton_detect_mud_harshness_sibilance`, `ableton_detect_phase_mono_issues`, `ableton_score_low_end_control`, `ableton_score_mix_balance`, `ableton_score_mix_translation`, `ableton_plan_stereo_depth_stage`, and `ableton_score_depth_image`: analyze renders and stems with ffmpeg-backed facts plus conservative heuristic findings.
- `ableton_get_capability_matrix`, `ableton_classify_render_failure`, `ableton_create_song_runbook`, `ableton_plan_session_handoff`, `ableton_validate_project_organization`, and `ableton_create_delivery_package`: report capability classes, failure types, handoff state, delivery packaging, and honest limitations.

Additional MCP context:

- Resources: `ableton://environment`, `ableton://runtime`, `ableton://scan-status`
- Prompts: `ableton-safe-production-session`, `ableton-security-review`

All file tools enforce allowed roots and reject broad or sensitive paths.

Write-capable tools require `ABLETON_MCP_ENABLE_WRITE=1` and should be called with `dry_run=true` first. `ableton_execute_concept_plan` also requires the matching approval bundle `approval_id`, `approval_confirmed=true`, and a successful bridge preflight before real writes. Real stored-plan execution writes a redacted diagnostic journal under `diagnostics\runtime\concept-executions`. If the bridge returns `unsupported: true` during stored-plan execution, the executor stops with `CONCEPT_EXECUTION_UNSUPPORTED_ACTION` instead of reporting a successful run. LiveAPI operations that are not proven reliable for the current Ableton bridge return `unsupported: true` in dry-run mode with setup hints. UI-driver tools require `ABLETON_MCP_ENABLE_UI_CONTROL=1`. Download/import tools require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.

Use [Producer brain](PRODUCER_BRAIN.md) for the current source-mode, brief parsing, sound-design, render-review, revision, mix, and handoff tool layer.

Use [Music production skills](MUSIC_PRODUCTION_SKILLS.md) when an agent needs to choose tools by musical job instead of reading the raw tool list.

Use [Natural language to music](NATURAL_LANGUAGE_TO_MUSIC.md) when Codex needs to translate a user's plain-language brief into a careful tool sequence.

Planned professional music, synthesis, timing, mix, and revision-loop tools are tracked in [Future patches](FUTURE_PATCHES.md). Names listed in [Producer brain](PRODUCER_BRAIN.md) are current runtime features because they are implemented and reported by `npm run verify:mcp`.
