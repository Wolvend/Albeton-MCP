# Producer Brain

Ableton MCP now includes a producer-brain layer: read-only and dry-run-first tools that help an agent turn a plain-language music brief into concrete musical decisions, then review renders and generate focused revision passes. These tools do not replace the Max for Live bridge. They sit before it, so agents can plan better before asking Ableton to change anything.

## Producer Facade

Default agents should start with the facade instead of choosing from the full raw catalog:

1. `ableton_create_production_session`
2. `ableton_generate_song_blueprint`
3. `ableton_design_signature_sound_palette`
4. `ableton_prepare_production_assets`
5. `ableton_create_execution_plan`
6. `ableton_review_render_and_revise`
7. `ableton_score_track_professionalism`

Sessions are stored under `diagnostics/runtime/production-sessions` with redacted local paths. The facade may write bounded diagnostics, but it does not write Ableton state, download files, use UI/mouse control, or bypass approval gates. Use `ableton_mcp_get_tool_packs` to retrieve the smaller `minimal_producer`, `sound_designer`, `mix_engineer`, `live_operator`, and `developer_debug` surfaces.

## Private Experiment Vs Release Candidate

Source checks use two modes:

| Mode | Meaning | Agent Behavior |
| --- | --- | --- |
| `private_experiment` | The user is exploring privately. Missing license or source details are allowed, but every source must still be recorded as `unverified`, `experiment_only`, or a known status in a manifest. | Do not block creative iteration. Keep attribution notes and source status honest. Do not package as release-ready. |
| `release_candidate` | The user wants a deliverable that can be shared or published. Unverified sources become blockers or warnings in the release-readiness report. | Run source readiness before packaging. Fix blockers or mark the package as not release-ready. |

This does not weaken the MCP security model. Downloads still require `ABLETON_MCP_ENABLE_DOWNLOADS=1`, Ableton writes still require `ABLETON_MCP_ENABLE_WRITE=1`, UI/mouse control still requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`, and arbitrary URL scraping, arbitrary shell execution, broad scans, and fake bridge success remain out of scope.

## Source Usage Tools

| Tool | Use |
| --- | --- |
| `ableton_set_project_usage_mode` | Dry-run or persist the current source-review mode. |
| `ableton_get_project_usage_mode` | Read the current mode; defaults to `private_experiment`. |
| `ableton_create_source_manifest` | Create a bounded manifest under the approved diagnostics area. |
| `ableton_mark_source_as_user_provided` | Add a user-provided source entry with optional local path and notes. |
| `ableton_mark_source_as_experiment_only` | Add an experiment-only source entry that is allowed for private work but not release-ready. |
| `ableton_check_release_source_readiness` | Report release blockers and warnings from a manifest. |

## Producer Planning Tools

| Tool | Use |
| --- | --- |
| `ableton_parse_music_brief` | Convert a user brief into mood tags, avoid rules, tempo assumptions, and first tool calls. |
| `ableton_compile_mood_palette` | Turn concept language into instrumentation, texture, space, and color decisions. |
| `ableton_plan_tempo_grid` | Suggest BPM, feel, swing, drift, and grid strategy. |
| `ableton_generate_harmonic_palette` | Generate key, mode, chord vocabulary, tension rules, and avoid notes. |
| `ableton_generate_motif_system` | Create a main motif plus transformations and role assignments. |
| `ableton_score_hook_memorability` | Score a motif for repetition, contour, contrast, singability, and weakness points. |
| `ableton_plan_layer_stack` | Assign purposeful layers by register, role, stereo position, and risk. |
| `ableton_create_moment_map` | Place standout moments, transitions, silences, impacts, and hook returns. |
| `ableton_plan_negative_space` | Decide where the arrangement should remove layers instead of adding more. |

## Sound Design Tools

| Tool | Use |
| --- | --- |
| `ableton_design_synth_patch` | Device-agnostic patch plan for bass, lead, pad, drone, bell, pulse, or texture roles. |
| `ableton_design_operator_patch` | Operator/FM oscillator ratio, envelope, modulation, filter, and macro plan. |
| `ableton_design_wavetable_patch` | Wavetable oscillator, unison, filter, envelope, LFO, and modulation plan. |
| `ableton_design_drift_patch` | Drift analog-style warmth, age, detune, filter, and macro plan. |
| `ableton_design_sampler_instrument` | Sampler/Simpler zoning, loop, pitch range, and velocity-layer plan. |
| `ableton_design_granular_texture` | Granular smear/freeze/cloud plan from an approved source. |
| `ableton_design_rack_macros` | Eight macro controls mapped to musical performance intent. |
| `ableton_score_sound_design_maturity` | Score whether a sound palette has role clarity, motion, depth, and restraint. |
| `ableton_score_patch_against_concept` | Score a patch plan against concept fit and mix risk. |

## Arrangement, Revision, Mix, And Handoff Tools

| Tool | Use |
| --- | --- |
| `ableton_score_arrangement_arc` | Score the long-form emotional and section arc. |
| `ableton_score_arrangement_motion` | Detect static sections, missing contrast, and weak payoffs. |
| `ableton_score_density_curve` | Judge whether density changes support the song. |
| `ableton_generate_automation_curves` | Generate musical automation points for filters, sends, volume, width, pitch, and macros. |
| `ableton_analyze_render_quality` | Run ffprobe/ffmpeg-backed render review and produce quality findings. |
| `ableton_detect_frequency_masking` | Find likely collisions across stems or grouped layers. |
| `ableton_detect_mud_harshness_sibilance` | Flag common tonal-balance risk bands. |
| `ableton_detect_phase_mono_issues` | Check channel/format facts and report mono/phase risks honestly. |
| `ableton_score_low_end_control` | Score sub, rumble, headroom, and low-end translation. |
| `ableton_score_mix_balance` | Score balance, dynamics, width, and role clarity. |
| `ableton_score_mix_translation` | Estimate playback risks across phone, laptop, headphones, car, and club systems. |
| `ableton_plan_stereo_depth_stage` | Plan center, width, front-back depth, and return-space strategy. |
| `ableton_score_depth_image` | Score a proposed stereo/depth stage for clarity and translation. |
| `ableton_generate_revision_pass` | Create one focused set of next changes from findings. |
| `ableton_generate_next_revision_pass` | Continue an iterative revision loop with stop criteria. |
| `ableton_compare_render_versions` | Compare before/after renders for improvements and regressions. |
| `ableton_get_capability_matrix` | Report read-only, dry-run/write-gated, UI-gated, download-gated, bridge-backed, offline-only, and unsupported classes. |
| `ableton_classify_render_failure` | Classify a bad render as hook, arrangement, sound, mix, source, technical, or safety failure. |
| `ableton_create_song_runbook` | Produce a complete safe song-production runbook from brief to delivery. |
| `ableton_plan_session_handoff` | Generate a handoff checklist for a human or another agent. |
| `ableton_validate_project_organization` | Check naming, stems, manifests, source notes, and project organization. |
| `ableton_create_delivery_package` | Dry-run or create a bounded delivery-package manifest; release mode checks source readiness. |

## Recommended Agent Loop

```text
ableton_get_production_readiness
ableton_get_project_usage_mode
ableton_parse_music_brief
ableton_compile_mood_palette
ableton_plan_tempo_grid
ableton_generate_harmonic_palette
ableton_generate_motif_system
ableton_score_hook_memorability
ableton_plan_layer_stack
ableton_create_moment_map
ableton_plan_negative_space
ableton_design_synth_patch / ableton_design_sampler_instrument
ableton_design_rack_macros
ableton_generate_automation_curves
ableton_create_song_runbook
dry-run Live execution tools
render or import review audio
ableton_analyze_render_quality
ableton_score_mix_balance
ableton_generate_revision_pass
ableton_check_release_source_readiness
ableton_create_delivery_package
```

If Ableton is closed or the bridge is unavailable, this loop still produces useful plans and honest setup steps. It must not claim that Live was edited unless a bridge or UI driver action confirms the change.
