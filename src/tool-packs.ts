export type ToolPackId = "minimal_producer" | "immersive_producer" | "sound_designer" | "mix_engineer" | "live_operator" | "developer_debug";

type ToolPackDefinition = {
  id: ToolPackId;
  description: string;
  defaultForAgents: boolean;
  tools: string[];
  excludedClasses: string[];
};

const facadeTools = [
  "ableton_produce_track_from_brief",
  "ableton_create_production_session",
  "ableton_get_production_session",
  "ableton_list_production_sessions",
  "ableton_generate_song_blueprint",
  "ableton_design_signature_sound_palette",
  "ableton_prepare_production_assets",
  "ableton_create_execution_plan",
  "ableton_advance_production_session",
  "ableton_review_render_and_revise",
  "ableton_score_track_professionalism"
];

const immersiveCreativeTools = [
  ...facadeTools,
  "ableton_get_production_readiness",
  "ableton_control_mode_status",
  "ableton_get_project_usage_mode",
  "ableton_set_project_usage_mode",
  "ableton_check_release_source_readiness",
  "ableton_list_free_sample_sources",
  "ableton_search_free_sample_sources",
  "ableton_plan_free_sample_download",
  "ableton_build_sample_intelligence_index",
  "ableton_search_sample_intelligence",
  "ableton_get_sample_intelligence_item",
  "ableton_plan_sample_chop_map",
  "ableton_analyze_sample_musical_features",
  "ableton_detect_key_bpm_confidence",
  "ableton_find_best_loop_points",
  "ableton_match_samples_to_concept",
  "ableton_parse_music_brief",
  "ableton_compile_mood_palette",
  "ableton_plan_tempo_grid",
  "ableton_generate_harmonic_palette",
  "ableton_generate_motif_system",
  "ableton_score_hook_memorability",
  "ableton_plan_layer_stack",
  "ableton_create_moment_map",
  "ableton_plan_negative_space",
  "ableton_design_synth_patch",
  "ableton_design_operator_patch",
  "ableton_design_wavetable_patch",
  "ableton_design_drift_patch",
  "ableton_design_sampler_instrument",
  "ableton_design_granular_texture",
  "ableton_design_rack_macros",
  "ableton_score_sound_design_maturity",
  "ableton_score_patch_against_concept",
  "ableton_score_arrangement_arc",
  "ableton_score_arrangement_motion",
  "ableton_score_density_curve",
  "ableton_generate_automation_curves",
  "ableton_analyze_render_quality",
  "ableton_detect_frequency_masking",
  "ableton_detect_mud_harshness_sibilance",
  "ableton_detect_phase_mono_issues",
  "ableton_score_low_end_control",
  "ableton_score_mix_balance",
  "ableton_score_mix_translation",
  "ableton_plan_stereo_depth_stage",
  "ableton_score_depth_image",
  "ableton_generate_revision_pass",
  "ableton_compare_render_versions"
];

export const TOOL_PACK_DEFINITIONS: ToolPackDefinition[] = [
  {
    id: "minimal_producer",
    description: "Small default surface for turning a music brief into a stored plan, dry-run execution plan, review loop, and delivery readiness.",
    defaultForAgents: true,
    tools: [
      ...facadeTools,
      "ableton_get_production_readiness",
      "ableton_control_mode_status",
      "ableton_search_sample_intelligence",
      "ableton_plan_sample_chop_map",
      "ableton_get_project_usage_mode",
      "ableton_check_release_source_readiness",
      "ableton_render_delivery_plan",
      "ableton_mcp_get_tool_packs",
      "ableton_mcp_get_safe_tool_allowlist"
    ],
    excludedClasses: ["real_live_writes", "foreground_ui_mouse", "downloads", "raw_execution"]
  },
  {
    id: "immersive_producer",
    description: "Expanded creative surface for sample-rich, synth-heavy, human-sounding music with better source variety, patch variety, and revision depth.",
    defaultForAgents: false,
    tools: immersiveCreativeTools,
    excludedClasses: ["real_live_writes", "foreground_ui_mouse", "downloads", "raw_execution", "plugin_installers"]
  },
  {
    id: "sound_designer",
    description: "Patch, rack, sampler, granular, and device-chain planning surface for sound-design-focused agents.",
    defaultForAgents: false,
    tools: [
      "ableton_design_signature_sound_palette",
      "ableton_design_synth_patch",
      "ableton_design_operator_patch",
      "ableton_design_wavetable_patch",
      "ableton_design_drift_patch",
      "ableton_design_sampler_instrument",
      "ableton_design_granular_texture",
      "ableton_design_rack_macros",
      "ableton_score_sound_design_maturity",
      "ableton_score_patch_against_concept",
      "ableton_render_concept_device_chain_spec",
      "ableton_render_concept_device_catalog_matches",
      "ableton_browse_live_devices",
      "ableton_browse_max_devices"
    ],
    excludedClasses: ["real_device_insertion", "foreground_ui_mouse_without_consent", "plugin_installers"]
  },
  {
    id: "mix_engineer",
    description: "Render and stem analysis surface for mix balance, low end, stereo image, masking, revision, and translation checks.",
    defaultForAgents: false,
    tools: [
      "ableton_review_render_and_revise",
      "ableton_score_track_professionalism",
      "ableton_analyze_render_quality",
      "ableton_detect_frequency_masking",
      "ableton_detect_mud_harshness_sibilance",
      "ableton_detect_phase_mono_issues",
      "ableton_score_low_end_control",
      "ableton_score_mix_balance",
      "ableton_score_mix_translation",
      "ableton_plan_stereo_depth_stage",
      "ableton_score_depth_image",
      "ableton_analyze_lufs",
      "ableton_analyze_spectrum",
      "ableton_detect_clipping",
      "ableton_compare_reference",
      "ableton_compare_render_versions"
    ],
    excludedClasses: ["mastering_by_guess", "unapproved_release_packaging"]
  },
  {
    id: "live_operator",
    description: "Bridge-read and dry-run Live control surface for operators who need to inspect Ableton and prepare gated writes.",
    defaultForAgents: false,
    tools: [
      "ableton_bridge_status",
      "ableton_bridge_setup_status",
      "ableton_bridge_ping",
      "ableton_get_bridge_capabilities",
      "ableton_get_full_snapshot",
      "ableton_get_live_state",
      "ableton_list_tracks_compact",
      "ableton_get_track_detail",
      "ableton_get_clip_detail",
      "ableton_get_routing_overview",
      "ableton_preflight_concept_execution",
      "ableton_render_concept_execution_action_matrix",
      "ableton_create_concept_execution_approval_bundle",
      "ableton_execute_concept_plan"
    ],
    excludedClasses: ["dry_run_false_without_write_gate", "unsupported_bridge_success", "ui_mouse_overlap"]
  },
  {
    id: "developer_debug",
    description: "Full registered catalog for MCP developers, contract sweeps, and detailed debugging.",
    defaultForAgents: false,
    tools: [],
    excludedClasses: []
  }
];

export function getToolPacks(allToolNames: string[]) {
  const all = new Set(allToolNames);
  return TOOL_PACK_DEFINITIONS.map((pack) => {
    const tools = pack.id === "developer_debug" ? allToolNames : pack.tools.filter((tool) => all.has(tool));
    const missing = pack.id === "developer_debug" ? [] : pack.tools.filter((tool) => !all.has(tool));
    return {
      ...pack,
      toolCount: tools.length,
      tools,
      missing,
      includeCsv: tools.join(",")
    };
  });
}
