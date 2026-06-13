import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LOCAL_PATHS } from "../src/config.js";
import { registeredToolNames } from "../src/tools.js";

const gzip = promisify(zlib.gzip);

export type ContractSweepCall = {
  name: string;
  arguments: Record<string, unknown>;
  expected?: "ok" | "any";
};

type SweepFixtures = {
  dir: string;
  setPath: string;
  textPath: string;
  audioPath: string;
  stagedAudioPath: string;
  convertedAudioPath: string;
  pluginPath: string;
  preparedAudioId: string;
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

async function writeIfMissing(filePath: string, data: string | Buffer) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, data, { flag: "wx" });
  }
}

async function ensureFixtures(): Promise<SweepFixtures> {
  const dir = path.join(LOCAL_PATHS.projectRoot, "diagnostics", "runtime", "tool-contract-sweep");
  await fs.mkdir(dir, { recursive: true });

  const setPath = path.join(dir, "minimal.als");
  const textPath = path.join(dir, "note.txt");
  const audioPath = path.join(dir, "tone.wav");
  const stagedAudioPath = path.join(LOCAL_PATHS.staging, "contract-sweep-tone.wav");
  const convertedAudioPath = path.join(LOCAL_PATHS.staging, "contract-sweep-converted.wav");
  const pluginPath = path.join(dir, "plugin.zip");
  const conceptPlanId = sweepConceptPlanId(stagedAudioPath);
  const preparedAudioId = `prepared-audio-${crypto.createHash("sha256").update(JSON.stringify({ conceptPlanId, stagedAudioPath })).digest("hex").slice(0, 16)}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Ableton><LiveSet><Tracks><MidiTrack></MidiTrack></Tracks><Scenes><Scene></Scene></Scenes><Manual Value="120"/></LiveSet></Ableton>`;
  await writeIfMissing(setPath, await gzip(Buffer.from(xml, "utf8")));
  await writeIfMissing(textPath, "Ableton MCP all-tool contract sweep fixture\n");
  await writeIfMissing(audioPath, makeSilentWav());
  await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
  await writeIfMissing(stagedAudioPath, makeSilentWav());
  await writeIfMissing(pluginPath, "Ableton MCP plugin package placeholder\n");
  const manifestDir = path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-plans");
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(path.join(manifestDir, `${preparedAudioId}.json`), `${JSON.stringify({
    id: preparedAudioId,
    conceptPlanId,
    createdAt: new Date().toISOString(),
    outputRoot: LOCAL_PATHS.staging,
    assignments: [{
      layer: "Degraded Memory",
      path: stagedAudioPath,
      clip_slot_index: 0,
      name: "Contract Prepared Memory",
      source: "reference_audio",
      treatment: "Contract sweep prepared audio layer."
    }],
    rendered: [{
      layer: "Degraded Memory",
      path: stagedAudioPath,
      redactedPath: stagedAudioPath,
      clip_slot_index: 0,
      name: "Contract Prepared Memory",
      treatment: "Contract sweep prepared audio layer.",
      preset: "liminal_memory",
      format: "wav",
      checksum: null,
      bytes: null,
      attributionPath: null
    }]
  }, null, 2)}\n`);

  return { dir, setPath, textPath, audioPath, stagedAudioPath, convertedAudioPath, pluginPath, preparedAudioId };
}

function sweepConceptPlanId(referencePath: string) {
  const payload = {
    concept: "liminal backrooms horror contract sweep",
    target_duration_seconds: 120,
    intensity: 7,
    style: "liminal/backrooms/horror",
    sources: ["local_library", "internet_archive"],
    reference_path: referencePath
  };
  return `concept-${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16)}`;
}

export function buildContractSweepCalls(fixtures: SweepFixtures): ContractSweepCall[] {
  const conceptPlanId = sweepConceptPlanId(fixtures.stagedAudioPath);
  return [
    { name: "ableton_find_installation", arguments: {} },
    { name: "ableton_get_environment", arguments: {} },
    { name: "ableton_validate_config", arguments: {} },
    { name: "ableton_launch_live", arguments: { dry_run: true } },
    { name: "ableton_live_status", arguments: {} },
    { name: "ableton_bridge_install_instructions", arguments: {} },
    { name: "ableton_bridge_install_plan", arguments: {} },
    { name: "ableton_install_bridge_files", arguments: { dry_run: true } },
    { name: "ableton_bridge_ping", arguments: {}, expected: "any" },
    { name: "ableton_bridge_status", arguments: {} },
    { name: "ableton_ui_driver_status", arguments: {} },
    { name: "ableton_ui_control_consent_status", arguments: {} },
    { name: "ableton_plan_ui_control_session", arguments: { purpose: "all-tool contract sweep", actions: ["focus", "screenshot"] } },
    { name: "ableton_list_safe_ui_actions", arguments: {} },
    { name: "ableton_plan_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true } },
    { name: "ableton_run_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true }, expected: "any" },
    { name: "ableton_ui_driver_ping", arguments: {}, expected: "any" },
    { name: "ableton_control_mode_status", arguments: {} },
    { name: "ableton_get_production_readiness", arguments: {} },
    { name: "ableton_export_diagnostic_report", arguments: { full_local_paths: false } },
    { name: "ableton_scan_library", arguments: { root: fixtures.dir, limit: 5 } },
    { name: "ableton_get_scan_status", arguments: {} },
    { name: "ableton_search_library", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_search_samples", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_search_presets", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_search_templates", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_search_clips", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_search_midi_tools", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_list_packs", arguments: { page: 1, pageSize: 5 }, expected: "any" },
    { name: "ableton_list_recent_projects", arguments: { page: 1, pageSize: 5 } },
    { name: "ableton_get_library_item", arguments: { path: fixtures.textPath } },
    { name: "ableton_reindex_path", arguments: { path: fixtures.dir, limit: 5 } },
    { name: "ableton_analyze_set", arguments: { path: fixtures.setPath } },
    { name: "ableton_get_set_summary", arguments: { path: fixtures.setPath } },
    { name: "ableton_find_missing_files", arguments: { path: fixtures.setPath } },
    { name: "ableton_list_set_tracks", arguments: { path: fixtures.setPath } },
    { name: "ableton_list_set_devices", arguments: { path: fixtures.setPath } },
    { name: "ableton_list_set_plugins", arguments: { path: fixtures.setPath } },
    { name: "ableton_list_set_samples", arguments: { path: fixtures.setPath } },
    { name: "ableton_extract_set_tempo_map", arguments: { path: fixtures.setPath } },
    { name: "ableton_extract_set_clip_summary", arguments: { path: fixtures.setPath } },
    { name: "ableton_compare_sets", arguments: { left: fixtures.setPath, right: fixtures.setPath } },
    { name: "ableton_get_full_snapshot", arguments: {}, expected: "any" },
    { name: "ableton_get_snapshot_diff", arguments: {}, expected: "any" },
    { name: "ableton_get_live_state", arguments: {}, expected: "any" },
    { name: "ableton_list_tracks", arguments: {}, expected: "any" },
    { name: "ableton_list_return_tracks", arguments: {}, expected: "any" },
    { name: "ableton_get_master_track", arguments: {}, expected: "any" },
    { name: "ableton_get_track_mixer", arguments: { track_id: "selected" }, expected: "any" },
    { name: "ableton_get_return_track_mixer", arguments: { return_track_index: 0 }, expected: "any" },
    { name: "ableton_list_scenes", arguments: {}, expected: "any" },
    { name: "ableton_list_clips", arguments: {}, expected: "any" },
    { name: "ableton_list_clip_slots", arguments: { track_id: "selected" }, expected: "any" },
    { name: "ableton_list_devices", arguments: { track_id: "selected" }, expected: "any" },
    { name: "ableton_list_device_parameters", arguments: { device_id: "selected" }, expected: "any" },
    { name: "ableton_get_selected_track", arguments: {}, expected: "any" },
    { name: "ableton_get_selected_device", arguments: {}, expected: "any" },
    { name: "ableton_get_tempo", arguments: {}, expected: "any" },
    { name: "ableton_get_transport", arguments: {}, expected: "any" },
    { name: "ableton_set_tempo", arguments: { tempo: 72, dry_run: true } },
    { name: "ableton_transport_control", arguments: { command: "stop", dry_run: true } },
    { name: "ableton_create_audio_track", arguments: { name: "Contract Audio", dry_run: true } },
    { name: "ableton_create_midi_track", arguments: { name: "Contract MIDI", dry_run: true } },
    { name: "ableton_create_return_track", arguments: { name: "Contract Return", dry_run: true } },
    { name: "ableton_create_scene", arguments: { name: "Contract Scene", dry_run: true } },
    { name: "ableton_create_clip", arguments: { track_index: 0, clip_slot_index: 0, length: 4, name: "Contract Clip", dry_run: true } },
    { name: "ableton_create_midi_clip", arguments: { track_index: 0, clip_slot_index: 0, length: 4, name: "Contract MIDI Clip", dry_run: true } },
    { name: "ableton_insert_midi_notes", arguments: { track_index: 0, clip_slot_index: 0, notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 90 }], create_clip_if_missing: true, clip_length: 4, dry_run: true } },
    { name: "ableton_set_clip_loop", arguments: { track_index: 0, clip_slot_index: 0, looping: true, loop_start: 0, loop_end: 4, dry_run: true } },
    { name: "ableton_fire_clip", arguments: { track_index: 0, clip_slot_index: 0, dry_run: true } },
    { name: "ableton_stop_clip", arguments: { track_index: 0, dry_run: true } },
    { name: "ableton_arm_track", arguments: { track_index: 0, enabled: false, dry_run: true } },
    { name: "ableton_mute_track", arguments: { track_index: 0, enabled: false, dry_run: true } },
    { name: "ableton_solo_track", arguments: { track_index: 0, enabled: false, dry_run: true } },
    { name: "ableton_set_track_volume", arguments: { track_index: 0, value: 0.75, dry_run: true } },
    { name: "ableton_set_track_pan", arguments: { track_index: 0, value: 0, dry_run: true } },
    { name: "ableton_set_track_send", arguments: { track_index: 0, send_index: 0, value: 0.1, dry_run: true } },
    { name: "ableton_set_return_track_volume", arguments: { return_track_index: 0, value: 0.7, dry_run: true } },
    { name: "ableton_set_return_track_pan", arguments: { return_track_index: 0, value: 0, dry_run: true } },
    { name: "ableton_insert_instrument", arguments: { track_index: 0, device: "Wavetable", dry_run: true } },
    { name: "ableton_insert_effect", arguments: { track_index: 0, device: "EQ Eight", dry_run: true } },
    { name: "ableton_load_preset_or_sample", arguments: { path: fixtures.stagedAudioPath, track_index: 0, clip_slot_index: 0, mode: "audio_clip", dry_run: true } },
    { name: "ableton_set_device_parameter", arguments: { track_index: 0, device_index: 0, parameter_index: 1, value: 0.5, dry_run: true } },
    { name: "ableton_map_macro", arguments: { track_index: 0, rack_device_index: 0, macro_index: 1, target_device_index: 0, target_parameter_index: 1, dry_run: true } },
    { name: "ableton_rename_track", arguments: { track_index: 0, name: "Contract Track", dry_run: true } },
    { name: "ableton_rename_clip", arguments: { track_index: 0, clip_slot_index: 0, name: "Contract Clip", dry_run: true } },
    { name: "ableton_apply_groove", arguments: { track_index: 0, clip_slot_index: 0, groove: "selected", amount: 0.5, dry_run: true } },
    { name: "ableton_list_arrangement_markers", arguments: {}, expected: "any" },
    { name: "ableton_get_clip_notes", arguments: { track_index: 0, clip_slot_index: 0 }, expected: "any" },
    { name: "ableton_get_clip_envelopes", arguments: { track_index: 0, clip_slot_index: 0 }, expected: "any" },
    { name: "ableton_get_device_parameter_map", arguments: { track_index: 0, device_index: 0 }, expected: "any" },
    { name: "ableton_create_automation_envelope", arguments: { track_index: 0, device_index: 0, parameter_index: 1, dry_run: true } },
    { name: "ableton_set_automation_point", arguments: { track_index: 0, device_index: 0, parameter_index: 1, time: 1, value: 0.5, dry_run: true } },
    { name: "ableton_simplify_automation", arguments: { track_index: 0, device_index: 0, parameter_index: 1, tolerance: 0.05, dry_run: true } },
    { name: "ableton_create_arrangement_marker", arguments: { time: 1, name: "Contract Sweep", dry_run: true } },
    { name: "ableton_duplicate_scene", arguments: { scene_index: 0, dry_run: true } },
    { name: "ableton_duplicate_clip", arguments: { track_index: 0, clip_slot_index: 0, destination_track_index: 0, destination_clip_slot_index: 1, dry_run: true } },
    { name: "ableton_move_clip", arguments: { track_index: 0, clip_slot_index: 0, destination_track_index: 0, destination_clip_slot_index: 1, dry_run: true } },
    { name: "ableton_quantize_clip", arguments: { track_index: 0, clip_slot_index: 0, grid: "1/16", amount: 1, dry_run: true } },
    { name: "ableton_humanize_midi_clip", arguments: { track_index: 0, clip_slot_index: 0, timing_amount: 0.02, velocity_amount: 5, dry_run: true } },
    { name: "ableton_window_status", arguments: {} },
    { name: "ableton_focus_window", arguments: { dry_run: true }, expected: "any" },
    { name: "ableton_capture_screenshot", arguments: { dry_run: true }, expected: "any" },
    { name: "ableton_capture_region", arguments: { x: 0, y: 0, width: 100, height: 100, dry_run: true }, expected: "any" },
    { name: "ableton_get_ui_overview", arguments: {}, expected: "any" },
    { name: "ableton_compare_screenshots", arguments: { left: fixtures.textPath, right: fixtures.textPath } },
    { name: "ableton_click_named_safe_action", arguments: { action: "capture_screenshot", dry_run: true }, expected: "any" },
    { name: "ableton_click_coordinates", arguments: { x: 0, y: 0, dry_run: true }, expected: "any" },
    { name: "ableton_type_text", arguments: { text: "contract sweep", dry_run: true }, expected: "any" },
    { name: "ableton_search_freesound", arguments: { query: "kick", page: 1, pageSize: 1 }, expected: "any" },
    { name: "ableton_search_internet_archive_audio", arguments: { query: "piano", page: 1, pageSize: 1 }, expected: "any" },
    { name: "ableton_get_remote_sample_metadata", arguments: { source: "internet_archive", identifier: "opensource_audio" }, expected: "any" },
    { name: "ableton_list_internet_archive_audio_files", arguments: { identifier: "opensource_audio", page: 1, pageSize: 5 }, expected: "any" },
    { name: "ableton_preview_remote_sample", arguments: { url: "https://archive.org/download/opensource_audio/opensource_audio_meta.xml", license: "CC0" } },
    { name: "ableton_download_sample", arguments: { url: "https://archive.org/download/opensource_audio/opensource_audio_meta.xml", destinationName: "sample.wav", metadata: { license: "CC0" } }, expected: "any" },
    { name: "ableton_analyze_audio_file", arguments: { path: fixtures.audioPath } },
    { name: "ableton_convert_audio_file", arguments: { input: fixtures.audioPath, output: fixtures.convertedAudioPath, format: "wav", dry_run: true } },
    { name: "ableton_normalize_sample_metadata", arguments: { metadata: { license: "CC0" } } },
    { name: "ableton_import_sample_to_library", arguments: { stagedPath: fixtures.audioPath, attribution: { license: "CC0" } }, expected: "any" },
    { name: "ableton_find_local_samples", arguments: { query: "", page: 1, pageSize: 5 } },
    { name: "ableton_build_sample_pack", arguments: { query: "", name: "Contract Sweep Pack", page: 1, pageSize: 5 } },
    { name: "ableton_generate_attribution_report", arguments: { page: 1, pageSize: 5 } },
    { name: "ableton_search_plugin_catalog", arguments: { query: "ableton" } },
    { name: "ableton_plan_plugin_download", arguments: { url: "https://www.ableton.com/packs/", destinationName: "plugin.zip", catalogId: "ableton-official-packs" } },
    { name: "ableton_download_plugin_package", arguments: { url: "https://www.ableton.com/packs/", destinationName: "plugin.zip", metadata: { source: "ableton" } }, expected: "any" },
    { name: "ableton_plugin_install_instructions", arguments: { stagedPath: fixtures.pluginPath } },
    { name: "ableton_validate_plugin_package", arguments: { stagedPath: fixtures.pluginPath } },
    { name: "ableton_scan_vst_folders", arguments: {} },
    { name: "ableton_list_installed_plugins", arguments: { page: 1, pageSize: 5 } },
    { name: "ableton_check_plugin_license_metadata", arguments: { metadata: { license: "freeware", source: "https://www.ableton.com/packs/" } } },
    { name: "ableton_extract_automation_summary", arguments: { path: fixtures.setPath } },
    { name: "ableton_extract_groove", arguments: { source: fixtures.textPath, strength: 0.5 } },
    { name: "ableton_plan_export_audio", arguments: { scope: "master", sampleRate: 48000, bitDepth: "24", normalize: false } },
    { name: "ableton_validate_export_settings", arguments: { settings: { sampleRate: 48000, bitDepth: "24", normalize: false } } },
    { name: "ableton_prepare_stems_plan", arguments: { groups: ["drums", "bass"], prefix: "contract-sweep" } },
    { name: "ableton_browse_live_devices", arguments: { category: "effects" } },
    { name: "ableton_browse_max_devices", arguments: { query: "bridge" } },
    { name: "ableton_browse_drum_hits", arguments: { query: "kick", page: 1, pageSize: 5 } },
    { name: "ableton_plan_concept_track", arguments: { concept: "liminal backrooms horror contract sweep", target_duration_seconds: 120, intensity: 7, style: "liminal/backrooms/horror", sources: ["local_library", "internet_archive"], reference_path: fixtures.stagedAudioPath } },
    { name: "ableton_list_concept_plans", arguments: { page: 1, pageSize: 5 } },
    { name: "ableton_get_concept_plan", arguments: { plan_id: conceptPlanId } },
    { name: "ableton_search_concept_samples", arguments: { concept: "liminal backrooms horror contract sweep", page: 1, pageSize: 1 }, expected: "any" },
    { name: "ableton_plan_full_concept_production", arguments: { concept: "liminal backrooms horror contract sweep", target_duration_seconds: 120, intensity: 7, style: "liminal/backrooms/horror", sources: ["local_library"], include_sample_search: false, sample_page_size: 1 } },
    { name: "ableton_stage_concept_samples", arguments: { samples: [{ url: "https://archive.org/download/opensource_audio/opensource_audio_meta.xml", destinationName: "contract-sweep.wav", metadata: { license: "CC0" } }], dry_run: true } },
    { name: "ableton_build_layered_arrangement_plan", arguments: { plan_id: conceptPlanId, sample_assignments: [{ layer: "Stretched Room", path: fixtures.stagedAudioPath, clip_slot_index: 1, name: "Contract Sweep Room Tone" }] } },
    { name: "ableton_prepare_concept_audio_layers", arguments: { plan_id: conceptPlanId, output_prefix: "contract-sweep", format: "wav", dry_run: true } },
    { name: "ableton_build_arrangement_from_prepared_audio", arguments: { preparation_id: fixtures.preparedAudioId } },
    { name: "ableton_list_arrangement_plans", arguments: { page: 1, pageSize: 5 } },
    { name: "ableton_get_arrangement_plan", arguments: { arrangement_id: "arrangement-0000000000000000" } },
    { name: "ableton_preflight_concept_execution", arguments: { arrangement_id: "arrangement-0000000000000000", check_bridge: false } },
    { name: "ableton_create_concept_execution_approval_bundle", arguments: { arrangement_id: "arrangement-0000000000000000", check_bridge: false } },
    { name: "ableton_export_concept_midi_motif", arguments: { plan_id: conceptPlanId, output_name: "contract-sweep-motif.mid", dry_run: true } },
    { name: "ableton_execute_concept_plan", arguments: { arrangement_id: "arrangement-0000000000000000", dry_run: true } },
    { name: "ableton_render_delivery_plan", arguments: { plan_id: conceptPlanId } },
    { name: "ableton_generate_session_plan", arguments: { brief: "contract sweep" } },
    { name: "ableton_generate_midi_clip_plan", arguments: { key: "C minor", bars: 4, style: "electronic" } },
    { name: "ableton_generate_drum_rack_plan", arguments: { style: "house" } },
    { name: "ableton_suggest_instrument_chain", arguments: { role: "lead" } },
    { name: "ableton_suggest_effect_chain", arguments: { source: "drums" } },
    { name: "ableton_suggest_arrangement", arguments: { brief: "contract sweep" } },
    { name: "ableton_suggest_mix_actions", arguments: { issue: "muddy low mids" } },
    { name: "ableton_validate_production_plan", arguments: { plan: { goal: "contract sweep" } } },
    { name: "ableton_mcp_health", arguments: {} },
    { name: "ableton_mcp_get_client_connection_profiles", arguments: {} },
    { name: "ableton_mcp_list_capabilities", arguments: {} },
    { name: "ableton_mcp_get_runtime_report", arguments: {} },
    { name: "ableton_mcp_security_report", arguments: {} },
    { name: "ableton_mcp_run_self_test", arguments: {} },
    { name: "ableton_mcp_run_bridge_mock_test", arguments: {} },
    { name: "ableton_mcp_run_path_security_test", arguments: {} },
    { name: "ableton_mcp_run_sample_license_test", arguments: {} },
    { name: "ableton_mcp_run_eval_suite", arguments: {} }
  ];
}

function validateSpecCoverage(calls: ContractSweepCall[]) {
  const registered = new Set(registeredToolNames);
  const seen = new Map<string, number>();
  for (const call of calls) {
    seen.set(call.name, (seen.get(call.name) ?? 0) + 1);
  }
  const missingSpecs = registeredToolNames.filter((name) => !seen.has(name));
  const extraSpecs = calls.map((call) => call.name).filter((name) => !registered.has(name));
  const duplicateSpecs = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  return { missingSpecs, extraSpecs, duplicateSpecs };
}

async function main() {
  process.env.ABLETON_MCP_ENABLE_WRITE = "0";
  process.env.ABLETON_MCP_ENABLE_UI_CONTROL = "0";
  process.env.ABLETON_MCP_ENABLE_DOWNLOADS = "0";
  process.env.ABLETON_MCP_HTTP_ALLOW_REMOTE = "0";

  const fixtures = await ensureFixtures();
  const calls = buildContractSweepCalls(fixtures);
  const coverage = validateSpecCoverage(calls);

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
  const client = new Client({ name: "ableton-mcp-tool-contract-sweep", version: "0.1.0" });
  await client.connect(transport);

  const results = [];
  let conceptArrangementId: string | null = null;
  if (coverage.missingSpecs.length === 0 && coverage.extraSpecs.length === 0 && coverage.duplicateSpecs.length === 0) {
    for (const call of calls) {
      try {
        const callArguments = (call.name === "ableton_execute_concept_plan" || call.name === "ableton_get_arrangement_plan" || call.name === "ableton_preflight_concept_execution" || call.name === "ableton_create_concept_execution_approval_bundle") && conceptArrangementId
          ? { ...call.arguments, arrangement_id: conceptArrangementId }
          : call.arguments;
        const result = await client.callTool({ name: call.name, arguments: callArguments });
        const expected = call.expected ?? "ok";
        const isError = Boolean(result.isError);
        if (call.name === "ableton_build_layered_arrangement_plan" && !isError) {
          const id = (result as any).structuredContent?.arrangement?.arrangement?.id;
          if (typeof id === "string") conceptArrangementId = id;
        }
        results.push({ name: call.name, ok: !isError || expected === "any", isError, expected });
      } catch (error) {
        results.push({ name: call.name, ok: false, expected: call.expected ?? "ok", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await client.close();

  const unexpected = results.filter((result) => !result.ok);
  const ok = coverage.missingSpecs.length === 0
    && coverage.extraSpecs.length === 0
    && coverage.duplicateSpecs.length === 0
    && unexpected.length === 0
    && calls.length === registeredToolNames.length;

  console.log(JSON.stringify({
    ok,
    registered: registeredToolNames.length,
    calls: calls.length,
    missingSpecs: coverage.missingSpecs,
    extraSpecs: coverage.extraSpecs,
    duplicateSpecs: coverage.duplicateSpecs,
    unexpectedFailures: unexpected.length,
    ...(process.env.ABLETON_MCP_SWEEP_VERBOSE === "1" || unexpected.length > 0 ? { results } : {})
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entrypoint === fileURLToPath(import.meta.url)) {
  await main();
}
