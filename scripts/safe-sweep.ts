import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LOCAL_PATHS } from "../src/config.js";
import { buildLayeredArrangementPlan, planConceptTrack } from "../src/concept.js";
import { createSourceManifest } from "../src/source-usage.js";

const gzip = promisify(zlib.gzip);

type SweepCall = {
  name: string;
  arguments: Record<string, unknown>;
  expected?: "ok" | "any";
};

function makeSilentWav() {
  const sampleRate = 44100;
  const durationSeconds = 0.1;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function ensureFixtures() {
  const dir = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "sweep");
  await fs.mkdir(dir, { recursive: true });
  const setPath = path.join(dir, "minimal.als");
  const textPath = path.join(dir, "note.txt");
  const audioPath = path.join(dir, "tone.wav");
  const sampleIntelligenceDir = path.join(LOCAL_PATHS.sampleLibraryRoot, "safe-sweep-sample-intelligence", "pack-a");
  const sampleIntelligenceAudioPath = path.join(sampleIntelligenceDir, "safe-sweep-texture-pad.wav");
  try {
    await fs.access(setPath);
  } catch {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Ableton><LiveSet><Tracks><MidiTrack></MidiTrack></Tracks><Scenes><Scene></Scene></Scenes><Manual Value="120"/></LiveSet></Ableton>`;
    await fs.writeFile(setPath, await gzip(Buffer.from(xml, "utf8")), { flag: "wx" });
  }
  try {
    await fs.access(textPath);
  } catch {
    await fs.writeFile(textPath, "Ableton MCP safe sweep fixture\n", { flag: "wx" });
  }
  try {
    await fs.access(audioPath);
  } catch {
    await fs.writeFile(audioPath, makeSilentWav(), { flag: "wx" });
  }
  await fs.mkdir(sampleIntelligenceDir, { recursive: true });
  try {
    await fs.access(sampleIntelligenceAudioPath);
  } catch {
    await fs.writeFile(sampleIntelligenceAudioPath, makeSilentWav(), { flag: "wx" });
  }
  return { dir, setPath, textPath, audioPath, sampleIntelligenceDir, sampleIntelligenceAudioPath };
}

const fixtures = await ensureFixtures();
const safeConcept = await planConceptTrack({
  concept: "safe sweep liminal concept manifest",
  target_duration_seconds: 90,
  intensity: 6,
  sources: ["local_library"]
});
const safeArrangement = await buildLayeredArrangementPlan(safeConcept.plan.id);
const safeSourceManifest = await createSourceManifest({
  project_name: `safe-sweep-${Date.now()}`,
  usage_mode: "private_experiment",
  sources: [{ title: "safe sweep unverified scratch source", role: "texture" }],
  dry_run: false
});
const safeSourceManifestPath = String(safeSourceManifest.output).replace("%USERPROFILE%", process.env.USERPROFILE ?? "");

const calls: SweepCall[] = [
  { name: "ableton_mcp_health", arguments: {} },
  { name: "ableton_mcp_list_capabilities", arguments: {} },
  { name: "ableton_mcp_get_client_connection_profiles", arguments: {} },
  { name: "ableton_mcp_get_client_bootstrap_bundle", arguments: {} },
  { name: "ableton_mcp_get_safe_tool_allowlist", arguments: {} },
  { name: "ableton_mcp_get_objective_readiness_report", arguments: { check_bridge: false } },
  { name: "ableton_mcp_get_launch_readiness_audit", arguments: { check_bridge: false } },
  { name: "ableton_mcp_run_path_security_test", arguments: {} },
  { name: "ableton_mcp_run_sample_license_test", arguments: {} },
  { name: "ableton_mcp_run_eval_suite", arguments: {} },
  { name: "ableton_get_environment", arguments: {} },
  { name: "ableton_validate_config", arguments: {} },
  { name: "ableton_find_installation", arguments: {} },
  { name: "ableton_live_status", arguments: {} },
  { name: "ableton_control_mode_status", arguments: {} },
  { name: "ableton_ui_control_consent_status", arguments: {} },
  { name: "ableton_plan_ui_control_session", arguments: { purpose: "safe sweep", actions: ["focus", "screenshot"] } },
  { name: "ableton_list_safe_ui_actions", arguments: {} },
  { name: "ableton_plan_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true } },
  { name: "ableton_run_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true }, expected: "any" },
  { name: "ableton_get_production_readiness", arguments: { check_bridge: false } },
  { name: "ableton_plan_agent_music_session", arguments: { concept: "safe sweep liminal concept session", target_duration_seconds: 90, intensity: 6, style: "liminal/backrooms/horror", client: "codex", check_bridge: false } },
  { name: "ableton_bridge_status", arguments: {} },
  { name: "ableton_get_bridge_capabilities", arguments: { check_bridge: false } },
  { name: "ableton_ui_driver_status", arguments: {} },
  { name: "ableton_bridge_install_instructions", arguments: {} },
  { name: "ableton_bridge_install_plan", arguments: {} },
  { name: "ableton_bridge_setup_status", arguments: { check_bridge: false } },
  { name: "ableton_get_scan_status", arguments: {} },
  { name: "ableton_search_library", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_search_samples", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_build_sample_intelligence_index", arguments: { root: fixtures.sampleIntelligenceDir, limit: 5, analyze_audio: false } },
  { name: "ableton_search_sample_intelligence", arguments: { query: "texture pad", roles: ["texture", "pad"], page: 1, pageSize: 5 } },
  { name: "ableton_get_sample_intelligence_item", arguments: { id: "0000000000000000000000000000000000000000000000000000000000000000" }, expected: "any" },
  { name: "ableton_plan_sample_chop_map", arguments: { path: fixtures.sampleIntelligenceAudioPath, target_bpm: 80, bars: 1, slice_count: 2, role: "texture" } },
  { name: "ableton_search_presets", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_search_templates", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_search_clips", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_search_midi_tools", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_get_library_item", arguments: { path: fixtures.textPath } },
  { name: "ableton_analyze_set", arguments: { path: fixtures.setPath } },
  { name: "ableton_get_set_summary", arguments: { path: fixtures.setPath } },
  { name: "ableton_list_set_tracks", arguments: { path: fixtures.setPath } },
  { name: "ableton_list_set_devices", arguments: { path: fixtures.setPath } },
  { name: "ableton_list_set_plugins", arguments: { path: fixtures.setPath } },
  { name: "ableton_list_set_samples", arguments: { path: fixtures.setPath } },
  { name: "ableton_extract_set_tempo_map", arguments: { path: fixtures.setPath } },
  { name: "ableton_extract_set_clip_summary", arguments: { path: fixtures.setPath } },
  { name: "ableton_compare_sets", arguments: { left: fixtures.setPath, right: fixtures.setPath } },
  { name: "ableton_launch_live", arguments: { dry_run: true } },
  { name: "ableton_open_bridge_device", arguments: { dry_run: true } },
  { name: "ableton_install_bridge_files", arguments: { dry_run: true } },
  { name: "ableton_create_automation_envelope", arguments: { track_index: 0, device_index: 0, parameter_index: 1, dry_run: true } },
  { name: "ableton_set_automation_point", arguments: { track_index: 0, device_index: 0, parameter_index: 1, time: 1, value: 0.5, dry_run: true } },
  { name: "ableton_simplify_automation", arguments: { track_index: 0, device_index: 0, parameter_index: 1, tolerance: 0.05, dry_run: true } },
  { name: "ableton_list_track_sends", arguments: {}, expected: "any" },
  { name: "ableton_get_routing_overview", arguments: { include_devices: false }, expected: "any" },
  { name: "ableton_get_return_track_mixer", arguments: { return_track_index: 0 }, expected: "any" },
  { name: "ableton_get_browser_tree", arguments: { category: "drums", max_items: 8, max_depth: 1 }, expected: "any" },
  { name: "ableton_get_browser_items_at_path", arguments: { path: "drums", max_items: 8, max_depth: 1 }, expected: "any" },
  { name: "ableton_get_arrangement_clips", arguments: { track_index: 0, page: 1, pageSize: 16 }, expected: "any" },
  { name: "ableton_set_return_track_volume", arguments: { return_track_index: 0, value: 0.7, dry_run: true } },
  { name: "ableton_set_return_track_pan", arguments: { return_track_index: 0, value: 0, dry_run: true } },
  { name: "ableton_set_track_color", arguments: { track_index: 0, color: 0x81A1C1, dry_run: true } },
  { name: "ableton_set_return_track_color", arguments: { return_track_index: 0, color: 0x5E81AC, dry_run: true } },
  { name: "ableton_rename_return_track", arguments: { return_track_index: 0, name: "Safe Sweep Return", dry_run: true } },
  { name: "ableton_set_master_volume", arguments: { value: 0.8, dry_run: true } },
  { name: "ableton_set_master_pan", arguments: { value: 0, dry_run: true } },
  { name: "ableton_create_arrangement_marker", arguments: { time: 1, name: "Safe Sweep", dry_run: true } },
  { name: "ableton_fire_scene", arguments: { scene_index: 0, force_legato: false, select_scene: true, dry_run: true } },
  { name: "ableton_set_scene_tempo", arguments: { scene_index: 0, tempo: 72, enabled: true, dry_run: true } },
  { name: "ableton_set_scene_time_signature", arguments: { scene_index: 0, numerator: 4, denominator: 4, enabled: true, dry_run: true } },
  { name: "ableton_set_scene_color", arguments: { scene_index: 0, color: 0x3B4252, dry_run: true } },
  { name: "ableton_rename_scene", arguments: { scene_index: 0, name: "Safe Sweep Scene", dry_run: true } },
  { name: "ableton_set_clip_gain", arguments: { track_index: 0, clip_slot_index: 0, gain: 0.7, dry_run: true } },
  { name: "ableton_transpose_clip", arguments: { track_index: 0, clip_slot_index: 0, semitones: -12, dry_run: true } },
  { name: "ableton_set_clip_warp", arguments: { track_index: 0, clip_slot_index: 0, warping: true, warp_mode: "texture", dry_run: true } },
  { name: "ableton_set_clip_markers", arguments: { track_index: 0, clip_slot_index: 0, start_marker: 0, end_marker: 4, dry_run: true } },
  { name: "ableton_set_clip_color", arguments: { track_index: 0, clip_slot_index: 0, color: 0x88C0D0, dry_run: true } },
  { name: "ableton_duplicate_scene", arguments: { scene_index: 0, dry_run: true } },
  { name: "ableton_duplicate_clip", arguments: { track_index: 0, clip_slot_index: 0, destination_clip_slot_index: 1, dry_run: true } },
  { name: "ableton_move_clip", arguments: { track_index: 0, clip_slot_index: 0, destination_track_index: 0, destination_clip_slot_index: 1, dry_run: true } },
  { name: "ableton_switch_to_arrangement_view", arguments: { dry_run: true } },
  { name: "ableton_set_arrangement_time", arguments: { time: 8, dry_run: true } },
  { name: "ableton_duplicate_session_clip_to_arrangement", arguments: { track_index: 0, clip_slot_index: 0, destination_time: 16, dry_run: true } },
  { name: "ableton_load_drum_kit", arguments: { track_index: 0, rack_uri: "Drums/Drum Rack", kit_path: "drums/acoustic", dry_run: true } },
  { name: "ableton_quantize_clip", arguments: { track_index: 0, clip_slot_index: 0, grid: "1/16", amount: 1, dry_run: true } },
  { name: "ableton_humanize_midi_clip", arguments: { track_index: 0, clip_slot_index: 0, timing_amount: 0.02, velocity_amount: 5, dry_run: true } },
  { name: "ableton_focus_window", arguments: { dry_run: true }, expected: "any" },
  { name: "ableton_capture_screenshot", arguments: { dry_run: true }, expected: "any" },
  { name: "ableton_capture_region", arguments: { x: 0, y: 0, width: 100, height: 100, dry_run: true }, expected: "any" },
  { name: "ableton_click_named_safe_action", arguments: { action: "noop", dry_run: true }, expected: "any" },
  { name: "ableton_click_coordinates", arguments: { x: 0, y: 0, dry_run: true }, expected: "any" },
  { name: "ableton_type_text", arguments: { text: "test", dry_run: true }, expected: "any" },
  { name: "ableton_search_plugin_catalog", arguments: { query: "ableton" } },
  { name: "ableton_plan_plugin_download", arguments: { url: "https://www.ableton.com/packs/", destinationName: "plugin.zip", catalogId: "ableton-official-packs" } },
  { name: "ableton_plugin_install_instructions", arguments: { stagedPath: path.join(LOCAL_PATHS.pluginStaging, "plugin.zip") } },
  { name: "ableton_scan_vst_folders", arguments: {} },
  { name: "ableton_list_installed_plugins", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_check_plugin_license_metadata", arguments: { metadata: { license: "freeware", source: "https://www.ableton.com/packs/" } } },
  { name: "ableton_extract_automation_summary", arguments: { track_index: 0, include_devices: true, max_parameters: 8 }, expected: "any" },
  { name: "ableton_extract_groove", arguments: { source: fixtures.textPath } },
  { name: "ableton_plan_export_audio", arguments: { scope: "master", sampleRate: 48000, bitDepth: "24" } },
  { name: "ableton_validate_export_settings", arguments: { settings: { sampleRate: 48000, bitDepth: "24", normalize: false } } },
  { name: "ableton_prepare_stems_plan", arguments: { groups: ["drums", "bass"], prefix: "safe-sweep" } },
  { name: "ableton_browse_live_devices", arguments: { category: "effects", max_items: 8, max_depth: 1, check_bridge: false } },
  { name: "ableton_browse_max_devices", arguments: { query: "bridge" } },
  { name: "ableton_browse_drum_hits", arguments: { query: "kick", page: 1, pageSize: 5 } },
  { name: "ableton_list_concept_plans", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_list_arrangement_plans", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_list_concept_execution_journals", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_normalize_sample_metadata", arguments: { metadata: { license: "CC0" } } },
  { name: "ableton_list_free_sample_sources", arguments: {} },
  { name: "ableton_search_free_sample_sources", arguments: { query: "room tone", sources: ["freesound", "internet_archive", "openverse", "youtube_audio_library", "soundcloud_user_provided"], allowed_only: true, page: 1, pageSize: 2 } },
  { name: "ableton_plan_free_sample_download", arguments: { source: "youtube_user_provided", source_url: "https://www.youtube.com/watch?v=example", destinationName: "youtube-example.wav", metadata: { license: "CC BY 4.0", proof: "official download or creator permission required" }, dry_run: true } },
  { name: "ableton_plan_free_sample_download", arguments: { source: "freesound", url: "https://freesound.org/example.wav", destinationName: "safe-sweep.wav", metadata: { license: "CC0" }, dry_run: true } },
  { name: "ableton_analyze_sample_musical_features", arguments: { path: fixtures.audioPath, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_detect_key_bpm_confidence", arguments: { path: fixtures.audioPath, bpm_range: { min: 60, max: 140 }, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_find_best_loop_points", arguments: { path: fixtures.audioPath, target_bars: 1, bpm: 120, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_match_samples_to_concept", arguments: { concept: "safe sweep liminal room tone", candidates: [{ path: fixtures.audioPath, title: "safe sweep room tone", tags: ["room", "texture"] }], roles: ["texture", "pulse"] } },
  { name: "ableton_get_project_usage_mode", arguments: {} },
  { name: "ableton_set_project_usage_mode", arguments: { mode: "private_experiment", project_name: "safe sweep", dry_run: true } },
  { name: "ableton_create_source_manifest", arguments: { project_name: "safe sweep draft", usage_mode: "private_experiment", sources: [{ title: "scratch texture", role: "texture" }], dry_run: true } },
  { name: "ableton_mark_source_as_user_provided", arguments: { project_name: "safe sweep user source", source: { title: "user supplied one-shot", role: "impact" }, dry_run: true } },
  { name: "ableton_mark_source_as_experiment_only", arguments: { project_name: "safe sweep experiment source", source: { title: "experiment scratch loop", role: "texture" }, dry_run: true } },
  { name: "ableton_check_release_source_readiness", arguments: { manifest_path: safeSourceManifestPath, usage_mode: "release_candidate" } },
  { name: "ableton_mcp_get_tool_packs", arguments: {} },
  { name: "ableton_create_production_session", arguments: { brief: "safe sweep producer facade liminal mall cue", style: "dreamcore", target_duration_seconds: 120, intensity: 7, usage_mode: "private_experiment", source_policy: "local_only", check_bridge: false } },
  { name: "ableton_produce_track_from_brief", arguments: { brief: "safe sweep one-call dry-run liminal mall cue", style: "dreamcore", target_duration_seconds: 120, intensity: 7, usage_mode: "private_experiment", source_policy: "procedural_only", check_bridge: false, max_internal_steps: 4, dry_run: true } },
  { name: "ableton_get_production_session", arguments: { session_id: "prod-0000000000000000" } },
  { name: "ableton_list_production_sessions", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_generate_song_blueprint", arguments: { session_id: "prod-0000000000000000" } },
  { name: "ableton_design_signature_sound_palette", arguments: { session_id: "prod-0000000000000000" } },
  { name: "ableton_prepare_production_assets", arguments: { session_id: "prod-0000000000000000" } },
  { name: "ableton_create_execution_plan", arguments: { session_id: "prod-0000000000000000", check_bridge: false } },
  { name: "ableton_advance_production_session", arguments: { session_id: "prod-0000000000000000", phase: "execution_plan", max_internal_steps: 4, dry_run: true } },
  { name: "ableton_review_render_and_revise", arguments: { session_id: "prod-0000000000000000", render_path: fixtures.audioPath, stem_paths: [fixtures.audioPath], duration_seconds: 0.1 } },
  { name: "ableton_score_track_professionalism", arguments: { session_id: "prod-0000000000000000", render_path: fixtures.audioPath, duration_seconds: 0.1 } },
  { name: "ableton_list_internet_archive_audio_files", arguments: { identifier: "opensource_audio", page: 1, pageSize: 5 }, expected: "any" },
  { name: "ableton_preview_remote_sample", arguments: { url: "https://archive.org/download/example/file.wav", license: "CC0" } },
  { name: "ableton_generate_session_plan", arguments: { brief: "safe sweep liminal hallway cue", style: "liminal/backrooms/horror", target_duration_seconds: 120, intensity: 7 } },
  { name: "ableton_generate_midi_clip_plan", arguments: { concept: "safe sweep liminal memory motif", key: "C minor", bars: 8, style: "liminal/backrooms/horror", intensity: 7, track_index: 0, clip_slot_index: 0 } },
  { name: "ableton_generate_drum_rack_plan", arguments: { style: "liminal/backrooms/horror", concept: "safe sweep hallway impacts", bars: 8, intensity: 7 } },
  { name: "ableton_suggest_instrument_chain", arguments: { role: "damaged memory motif", style: "liminal/backrooms/horror", intensity: 7 } },
  { name: "ableton_suggest_effect_chain", arguments: { source: "degraded hallway piano", style: "liminal/backrooms/horror", intensity: 7 } },
  { name: "ableton_suggest_arrangement", arguments: { brief: "safe sweep liminal hallway cue", style: "liminal/backrooms/horror", target_duration_seconds: 120, intensity: 7 } },
  { name: "ableton_suggest_mix_actions", arguments: { issue: "muddy low mids and too much reverb", context: "safe sweep liminal cue", intensity: 7 } },
  { name: "ableton_validate_production_plan", arguments: { plan: { goal: "safe sweep", actions: ["ableton_set_track_volume"], dry_run: true } } },
  { name: "ableton_parse_music_brief", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", style: "dreamcore", target_duration_seconds: 120, intensity: 7 } },
  { name: "ableton_compile_mood_palette", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", style: "dreamcore", target_duration_seconds: 120, intensity: 7 } },
  { name: "ableton_plan_tempo_grid", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", style: "dreamcore", target_duration_seconds: 120, intensity: 7 } },
  { name: "ableton_generate_harmonic_palette", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", mood: "sad dreamy", complexity: "medium" } },
  { name: "ableton_generate_motif_system", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", key: "C# minor", bpm: 72, length_beats: 8 } },
  { name: "ableton_score_hook_memorability", arguments: { motif: [61, 64, 68, 71, 69, 68], concept: "safe sweep hook" } },
  { name: "ableton_plan_layer_stack", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", section: "full_track", intensity: 7 } },
  { name: "ableton_create_moment_map", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", duration_seconds: 120, intensity: 7 } },
  { name: "ableton_plan_negative_space", arguments: { concept: "safe sweep sad liminal vaporwave mall cue", sections: ["intro", "break", "return"], intensity: 7 } },
  { name: "ableton_design_synth_patch", arguments: { concept: "safe sweep liminal cue", role: "glassy hook memory", brightness: 4, instability: 6 } },
  { name: "ableton_design_operator_patch", arguments: { concept: "safe sweep liminal cue", role: "glassy hook memory", brightness: 4, instability: 6 } },
  { name: "ableton_design_wavetable_patch", arguments: { concept: "safe sweep liminal cue", role: "wide choir fog", motion: 5, width: 7 } },
  { name: "ableton_design_drift_patch", arguments: { concept: "safe sweep liminal cue", role: "warm unstable chord bed", warmth: 7, age: 6, detune: 4 } },
  { name: "ableton_design_sampler_instrument", arguments: { samples: [{ title: "safe sweep source", root_note: "C3" }], role: "memory sampler", key_range: "C2-C5" } },
  { name: "ableton_design_granular_texture", arguments: { concept: "safe sweep liminal cue", path: fixtures.audioPath, density: 5, grain_size_ms: 120, movement: 5 } },
  { name: "ableton_design_rack_macros", arguments: { role: "memory sampler", patch_plan: { device: "Sampler", role: "memory" } } },
  { name: "ableton_score_sound_design_maturity", arguments: { concept: "safe sweep liminal cue", role: "hook", patch_plan: { macro: true, movement: "slow" } } },
  { name: "ableton_score_patch_against_concept", arguments: { concept: "safe sweep liminal cue", role: "hook", patch_plan: { role: "hook", macro: true, movement: "slow", filter: "dark lowpass" } } },
  { name: "ableton_score_arrangement_arc", arguments: { concept: "safe sweep liminal cue", sections: ["intro hook", "development", "negative break", "hook return"], duration_seconds: 120 } },
  { name: "ableton_score_arrangement_motion", arguments: { concept: "safe sweep liminal cue", arrangement_summary: "intro hook -> filter automation -> negative break -> hook return" } },
  { name: "ableton_score_density_curve", arguments: { concept: "safe sweep liminal cue", sections: ["intro", "development", "break", "return"] } },
  { name: "ableton_generate_automation_curves", arguments: { concept: "safe sweep liminal cue", target: "filter_width", section: "return", intensity: 7 } },
  { name: "ableton_generate_revision_pass", arguments: { concept: "safe sweep liminal cue", current_arrangement: "intro hook -> static middle -> return", findings: ["static arrangement"] } },
  { name: "ableton_generate_next_revision_pass", arguments: { project_state: { concept: "safe sweep" }, previous_findings: ["static arrangement"] } },
  { name: "ableton_analyze_render_quality", arguments: { path: fixtures.audioPath, concept: "safe sweep tone", start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_detect_frequency_masking", arguments: { stems: [fixtures.audioPath, fixtures.audioPath], duration_seconds: 0.1 } },
  { name: "ableton_detect_mud_harshness_sibilance", arguments: { path: fixtures.audioPath, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_detect_phase_mono_issues", arguments: { path: fixtures.audioPath } },
  { name: "ableton_score_low_end_control", arguments: { path: fixtures.audioPath, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_score_mix_balance", arguments: { path: fixtures.audioPath, concept: "safe sweep tone", start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_score_mix_translation", arguments: { path: fixtures.audioPath, start_seconds: 0, duration_seconds: 0.1 } },
  { name: "ableton_plan_stereo_depth_stage", arguments: { concept: "safe sweep liminal cue", tracks: ["hook", "sub", "texture"] } },
  { name: "ableton_score_depth_image", arguments: { path: fixtures.audioPath } },
  { name: "ableton_get_capability_matrix", arguments: {} },
  { name: "ableton_classify_render_failure", arguments: { findings: ["static arrangement", "cheesy synth"] } },
  { name: "ableton_create_song_runbook", arguments: { concept: "safe sweep liminal cue", usage_mode: "private_experiment", target_duration_seconds: 120 } },
  { name: "ableton_plan_session_handoff", arguments: { concept: "safe sweep liminal cue", delivery_target: "review bundle" } },
  { name: "ableton_validate_project_organization", arguments: { tracks: ["hook memory", "sub pressure"], stems: [fixtures.audioPath], manifest_path: safeSourceManifestPath } },
  { name: "ableton_create_delivery_package", arguments: { project_name: "safe sweep package", master_path: fixtures.audioPath, stems: [fixtures.audioPath], manifest_path: safeSourceManifestPath, dry_run: true } },
  { name: "ableton_list_concept_presets", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_plan_reference_audio_intake", arguments: { reference_path: "%USERPROFILE%\\Documents\\Codex\\source-memory.mp3", concept: "safe sweep backrooms source memory", desired_destination_name: "safe-sweep-source-memory.mp3" } },
  { name: "ableton_plan_source_audio_transformation", arguments: { reference_path: "%USERPROFILE%\\Documents\\Codex\\source-memory.mp3", concept: "safe sweep backrooms source memory", target_duration_seconds: 120, intensity: 8, style: "liminal/backrooms/horror", desired_destination_name: "safe-sweep-source-memory.mp3", output_prefix: "safe-sweep-source", format: "wav" } },
  { name: "ableton_curate_concept_samples", arguments: { plan_id: safeConcept.plan.id, search: false, page: 1, pageSize: 3 } },
  { name: "ableton_render_concept_execution_action_matrix", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_render_concept_execution_manifest", arguments: { arrangement_id: safeArrangement.arrangement.id } },
  { name: "ableton_render_concept_execution_runbook", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_render_concept_attribution_bundle", arguments: { arrangement_id: safeArrangement.arrangement.id } },
  { name: "ableton_render_concept_production_scorecard", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_plan_concept_routing_readiness", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_render_concept_device_chain_spec", arguments: { arrangement_id: safeArrangement.arrangement.id } },
  { name: "ableton_render_concept_device_catalog_matches", arguments: { arrangement_id: safeArrangement.arrangement.id, max_candidates_per_device: 3, include_plugin_presets: false } },
  { name: "ableton_plan_concept_device_ui_placement", arguments: { arrangement_id: safeArrangement.arrangement.id, max_devices: 12, include_catalog_matches: true } },
  { name: "ableton_render_concept_automation_map", arguments: { plan_id: safeConcept.plan.id } }
];

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/src/index.js"],
  env: {
    ...process.env,
    ABLETON_MCP_ENABLE_WRITE: "0",
    ABLETON_MCP_ENABLE_UI_CONTROL: "0",
    ABLETON_MCP_ENABLE_DOWNLOADS: "0",
    ABLETON_MCP_HTTP_ALLOW_REMOTE: "0"
  }
});
const client = new Client({ name: "ableton-mcp-safe-sweep", version: "0.1.0" });
await client.connect(transport);

const results = [];
let productionSessionId: string | null = null;
for (const call of calls) {
  try {
    const callArguments = productionSessionId
      ? Object.fromEntries(Object.entries(call.arguments).map(([key, value]) => [key, value === "prod-0000000000000000" ? productionSessionId : value]))
      : call.arguments;
    const result = await client.callTool({ name: call.name, arguments: callArguments });
    const expected = call.expected ?? "ok";
    const isError = Boolean(result.isError);
    if (call.name === "ableton_create_production_session" && !isError) {
      const sessionId = (result as any).structuredContent?.productionSession?.session?.id;
      if (typeof sessionId === "string") productionSessionId = sessionId;
    }
    results.push({ name: call.name, ok: !isError || expected === "any", isError, expected });
  } catch (error) {
    results.push({ name: call.name, ok: false, expected: call.expected ?? "ok", error: error instanceof Error ? error.message : String(error) });
  }
}

await client.close();

const unexpected = results.filter((result) => !result.ok && result.expected !== "any");
console.log(JSON.stringify({
  ok: unexpected.length === 0,
  calls: results.length,
  unexpectedFailures: unexpected.length,
  results
}, null, 2));

if (unexpected.length > 0) {
  process.exitCode = 1;
}
