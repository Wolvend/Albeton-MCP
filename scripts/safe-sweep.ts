import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LOCAL_PATHS } from "../src/config.js";
import { buildLayeredArrangementPlan, planConceptTrack } from "../src/concept.js";

const gzip = promisify(zlib.gzip);

type SweepCall = {
  name: string;
  arguments: Record<string, unknown>;
  expected?: "ok" | "any";
};

async function ensureFixtures() {
  const dir = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "sweep");
  await fs.mkdir(dir, { recursive: true });
  const setPath = path.join(dir, "minimal.als");
  const textPath = path.join(dir, "note.txt");
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
  return { dir, setPath, textPath };
}

const fixtures = await ensureFixtures();
const safeConcept = await planConceptTrack({
  concept: "safe sweep liminal concept manifest",
  target_duration_seconds: 90,
  intensity: 6,
  sources: ["local_library"]
});
const safeArrangement = await buildLayeredArrangementPlan(safeConcept.plan.id);

const calls: SweepCall[] = [
  { name: "ableton_mcp_health", arguments: {} },
  { name: "ableton_mcp_list_capabilities", arguments: {} },
  { name: "ableton_mcp_get_client_connection_profiles", arguments: {} },
  { name: "ableton_mcp_get_safe_tool_allowlist", arguments: {} },
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
  { name: "ableton_bridge_status", arguments: {} },
  { name: "ableton_get_bridge_capabilities", arguments: { check_bridge: false } },
  { name: "ableton_ui_driver_status", arguments: {} },
  { name: "ableton_bridge_install_instructions", arguments: {} },
  { name: "ableton_bridge_install_plan", arguments: {} },
  { name: "ableton_get_scan_status", arguments: {} },
  { name: "ableton_search_library", arguments: { query: "", page: 1, pageSize: 5 } },
  { name: "ableton_search_samples", arguments: { query: "", page: 1, pageSize: 5 } },
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
  { name: "ableton_install_bridge_files", arguments: { dry_run: true } },
  { name: "ableton_create_automation_envelope", arguments: { track_index: 0, device_index: 0, parameter_index: 1, dry_run: true } },
  { name: "ableton_set_automation_point", arguments: { track_index: 0, device_index: 0, parameter_index: 1, time: 1, value: 0.5, dry_run: true } },
  { name: "ableton_simplify_automation", arguments: { track_index: 0, device_index: 0, parameter_index: 1, tolerance: 0.05, dry_run: true } },
  { name: "ableton_list_track_sends", arguments: {}, expected: "any" },
  { name: "ableton_get_routing_overview", arguments: { include_devices: false }, expected: "any" },
  { name: "ableton_get_return_track_mixer", arguments: { return_track_index: 0 }, expected: "any" },
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
  { name: "ableton_extract_groove", arguments: { source: fixtures.textPath } },
  { name: "ableton_plan_export_audio", arguments: { scope: "master", sampleRate: 48000, bitDepth: "24" } },
  { name: "ableton_validate_export_settings", arguments: { settings: { sampleRate: 48000, bitDepth: "24", normalize: false } } },
  { name: "ableton_prepare_stems_plan", arguments: { groups: ["drums", "bass"], prefix: "safe-sweep" } },
  { name: "ableton_browse_live_devices", arguments: { category: "effects" } },
  { name: "ableton_browse_max_devices", arguments: { query: "bridge" } },
  { name: "ableton_browse_drum_hits", arguments: { query: "kick", page: 1, pageSize: 5 } },
  { name: "ableton_list_concept_plans", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_list_arrangement_plans", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_normalize_sample_metadata", arguments: { metadata: { license: "CC0" } } },
  { name: "ableton_list_internet_archive_audio_files", arguments: { identifier: "opensource_audio", page: 1, pageSize: 5 }, expected: "any" },
  { name: "ableton_preview_remote_sample", arguments: { url: "https://archive.org/download/example/file.wav", license: "CC0" } },
  { name: "ableton_generate_session_plan", arguments: { brief: "safe sweep" } },
  { name: "ableton_generate_midi_clip_plan", arguments: {} },
  { name: "ableton_generate_drum_rack_plan", arguments: {} },
  { name: "ableton_suggest_instrument_chain", arguments: { role: "lead" } },
  { name: "ableton_suggest_effect_chain", arguments: { source: "drums" } },
  { name: "ableton_suggest_arrangement", arguments: { brief: "safe sweep" } },
  { name: "ableton_suggest_mix_actions", arguments: { issue: "muddy low mids" } },
  { name: "ableton_validate_production_plan", arguments: { plan: { goal: "safe sweep" } } },
  { name: "ableton_list_concept_presets", arguments: { page: 1, pageSize: 5 } },
  { name: "ableton_render_concept_execution_manifest", arguments: { arrangement_id: safeArrangement.arrangement.id } },
  { name: "ableton_render_concept_attribution_bundle", arguments: { arrangement_id: safeArrangement.arrangement.id } },
  { name: "ableton_render_concept_production_scorecard", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_plan_concept_routing_readiness", arguments: { arrangement_id: safeArrangement.arrangement.id, check_bridge: false } },
  { name: "ableton_render_concept_automation_map", arguments: { plan_id: safeConcept.plan.id } }
];

const transport = new StdioClientTransport({ command: "node", args: ["dist/src/index.js"] });
const client = new Client({ name: "ableton-mcp-safe-sweep", version: "0.1.0" });
await client.connect(transport);

const results = [];
for (const call of calls) {
  try {
    const result = await client.callTool({ name: call.name, arguments: call.arguments });
    const expected = call.expected ?? "ok";
    const isError = Boolean(result.isError);
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
