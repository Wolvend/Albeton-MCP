import path from "node:path";
import { LOCAL_PATHS } from "./config.js";

export const HYPERNIMBUS_PROFILE_ID = "hypernimbus";
export const ABLETON_DOCKER_CATALOG = path.join(LOCAL_PATHS.projectRoot, "docker", "ableton-mcp.catalog.yaml");

export const HYPERNIMBUS_SAFE_TOOL_ALLOWLIST = [
  "ableton_find_installation",
  "ableton_get_environment",
  "ableton_validate_config",
  "ableton_live_status",
  "ableton_bridge_install_instructions",
  "ableton_bridge_install_plan",
  "ableton_bridge_ping",
  "ableton_bridge_status",
  "ableton_get_bridge_capabilities",
  "ableton_ui_driver_status",
  "ableton_ui_control_consent_status",
  "ableton_plan_ui_control_session",
  "ableton_list_safe_ui_actions",
  "ableton_plan_ui_action_sequence",
  "ableton_control_mode_status",
  "ableton_get_production_readiness",
  "ableton_get_scan_status",
  "ableton_search_library",
  "ableton_search_samples",
  "ableton_search_presets",
  "ableton_search_templates",
  "ableton_search_clips",
  "ableton_search_midi_tools",
  "ableton_list_packs",
  "ableton_list_recent_projects",
  "ableton_get_library_item",
  "ableton_analyze_set",
  "ableton_get_set_summary",
  "ableton_find_missing_files",
  "ableton_list_set_tracks",
  "ableton_list_set_devices",
  "ableton_list_set_plugins",
  "ableton_list_set_samples",
  "ableton_extract_set_tempo_map",
  "ableton_extract_set_clip_summary",
  "ableton_compare_sets",
  "ableton_get_full_snapshot",
  "ableton_get_snapshot_diff",
  "ableton_get_live_state",
  "ableton_list_tracks",
  "ableton_list_return_tracks",
  "ableton_get_master_track",
  "ableton_get_track_mixer",
  "ableton_list_track_sends",
  "ableton_get_routing_overview",
  "ableton_get_return_track_mixer",
  "ableton_list_scenes",
  "ableton_list_clips",
  "ableton_list_clip_slots",
  "ableton_list_devices",
  "ableton_list_device_parameters",
  "ableton_get_selected_track",
  "ableton_get_selected_device",
  "ableton_get_tempo",
  "ableton_get_transport",
  "ableton_list_arrangement_markers",
  "ableton_get_clip_notes",
  "ableton_get_clip_envelopes",
  "ableton_get_device_parameter_map",
  "ableton_window_status",
  "ableton_get_ui_overview",
  "ableton_search_freesound",
  "ableton_search_internet_archive_audio",
  "ableton_get_remote_sample_metadata",
  "ableton_list_internet_archive_audio_files",
  "ableton_preview_remote_sample",
  "ableton_analyze_audio_file",
  "ableton_normalize_sample_metadata",
  "ableton_find_local_samples",
  "ableton_build_sample_pack",
  "ableton_generate_attribution_report",
  "ableton_search_plugin_catalog",
  "ableton_plan_plugin_download",
  "ableton_plugin_install_instructions",
  "ableton_validate_plugin_package",
  "ableton_scan_vst_folders",
  "ableton_list_installed_plugins",
  "ableton_check_plugin_license_metadata",
  "ableton_extract_automation_summary",
  "ableton_extract_groove",
  "ableton_plan_export_audio",
  "ableton_validate_export_settings",
  "ableton_prepare_stems_plan",
  "ableton_browse_live_devices",
  "ableton_browse_max_devices",
  "ableton_browse_drum_hits",
  "ableton_generate_session_plan",
  "ableton_generate_midi_clip_plan",
  "ableton_generate_drum_rack_plan",
  "ableton_suggest_instrument_chain",
  "ableton_suggest_effect_chain",
  "ableton_suggest_arrangement",
  "ableton_suggest_mix_actions",
  "ableton_validate_production_plan",
  "ableton_list_concept_presets",
  "ableton_plan_concept_track",
  "ableton_list_concept_plans",
  "ableton_get_concept_plan",
  "ableton_list_arrangement_plans",
  "ableton_get_arrangement_plan",
  "ableton_search_concept_samples",
  "ableton_plan_full_concept_production",
  "ableton_build_layered_arrangement_plan",
  "ableton_preflight_concept_execution",
  "ableton_create_concept_execution_approval_bundle",
  "ableton_render_concept_execution_manifest",
  "ableton_render_concept_production_scorecard",
  "ableton_plan_concept_routing_readiness",
  "ableton_plan_concept_device_automation_readiness",
  "ableton_render_concept_timeline",
  "ableton_render_concept_mix_plan",
  "ableton_render_delivery_plan",
  "ableton_mcp_health",
  "ableton_mcp_get_client_connection_profiles",
  "ableton_mcp_get_safe_tool_allowlist",
  "ableton_mcp_list_capabilities",
  "ableton_mcp_get_runtime_report",
  "ableton_mcp_security_report",
  "ableton_mcp_run_self_test",
  "ableton_mcp_run_bridge_mock_test",
  "ableton_mcp_run_path_security_test",
  "ableton_mcp_run_sample_license_test",
  "ableton_mcp_run_eval_suite"
] as const;

export const HYPERNIMBUS_RISKY_TOOL_DENYLIST = [
  "ableton_execute_concept_plan",
  "ableton_stage_concept_samples",
  "ableton_download_sample",
  "ableton_import_sample_to_library",
  "ableton_launch_live",
  "ableton_ui_click",
  "ableton_click_coordinates",
  "ableton_type_text",
  "ableton_set_tempo",
  "ableton_set_track_volume",
  "ableton_set_track_pan",
  "ableton_set_track_mute",
  "ableton_set_track_solo",
  "ableton_set_track_arm",
  "ableton_set_track_color",
  "ableton_set_return_track_volume",
  "ableton_set_return_track_pan",
  "ableton_set_return_track_mute",
  "ableton_set_return_track_solo",
  "ableton_set_return_track_color",
  "ableton_set_master_volume",
  "ableton_set_master_pan",
  "ableton_rename_track",
  "ableton_rename_return_track",
  "ableton_rename_scene",
  "ableton_fire_scene",
  "ableton_set_scene_tempo",
  "ableton_set_scene_time_signature",
  "ableton_set_scene_color",
  "ableton_set_clip_gain",
  "ableton_set_clip_color",
  "ableton_transpose_clip",
  "ableton_set_clip_warp",
  "ableton_set_clip_markers",
  "ableton_create_automation_envelope",
  "ableton_set_automation_point",
  "ableton_create_arrangement_marker",
  "ableton_duplicate_scene",
  "ableton_duplicate_clip",
  "ableton_move_clip",
  "ableton_quantize_clip",
  "ableton_humanize_midi_clip"
] as const;

export type DockerCommandPlan = {
  description: string;
  command: string;
  args: string[];
};

export type DockerProfilePlan = {
  profile: string;
  catalogPath: string;
  catalogRef: string;
  endpoint: string;
  allowlist: readonly string[];
  commands: DockerCommandPlan[];
};

export type DockerProfileToolVerification = {
  ok: boolean;
  serverName: string;
  expectedAllowedTools: number;
  observedAllowedTools: number;
  missingSafeTools: string[];
  unexpectedAbletonTools: string[];
  unexpectedRiskyTools: string[];
  observedTools: string[];
};

export function validateDockerProfileId(profile: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(profile)) {
    throw new Error("Docker MCP profile names may contain only letters, numbers, dots, underscores, and dashes.");
  }
  return profile;
}

export function toFileUri(filePath: string) {
  const normalizedInput = filePath.replaceAll("\\", "/");
  const absolute = /^[A-Za-z]:\//.test(normalizedInput)
    ? normalizedInput
    : path.resolve(filePath).replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(absolute)) return `file://${absolute}`;
  return `file://${absolute}`;
}

function getIndent(line: string) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function splitDockerProfileServerBlocks(profileOutput: string) {
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of profileOutput.split(/\r?\n/)) {
    if (/^ {4}- type: \S+/.test(line)) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [line];
      continue;
    }

    if (current.length > 0) current.push(line);
  }

  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

export function parseDockerProfileEnabledTools(profileOutput: string, serverName = "ableton-mcp") {
  const block = splitDockerProfileServerBlocks(profileOutput).find((candidate) =>
    candidate.includes(`name: ${serverName}`) || candidate.includes(`name: "${serverName}"`)
  );
  if (!block) return [];

  const tools: string[] = [];
  const lines = block.split(/\r?\n/);
  let toolsIndent: number | undefined;

  for (const line of lines) {
    if (toolsIndent === undefined) {
      if (/^\s*tools:\s*$/.test(line)) toolsIndent = getIndent(line);
      continue;
    }

    if (line.trim() === "") continue;
    if (getIndent(line) <= toolsIndent) break;

    const listItem = line.match(/^\s*-\s+([A-Za-z0-9_:-]+)\s*$/);
    if (listItem) tools.push(listItem[1]!);
  }

  return tools;
}

export function verifyDockerProfileToolAllowlist(
  profileOutput: string,
  options: {
    serverName?: string;
    expectedAllowlist?: readonly string[];
    riskyDenylist?: readonly string[];
  } = {}
): DockerProfileToolVerification {
  const serverName = options.serverName ?? "ableton-mcp";
  const expectedAllowlist = options.expectedAllowlist ?? HYPERNIMBUS_SAFE_TOOL_ALLOWLIST;
  const riskyDenylist = options.riskyDenylist ?? HYPERNIMBUS_RISKY_TOOL_DENYLIST;
  const expected = new Set(expectedAllowlist);
  const risky = new Set(riskyDenylist);
  const observedTools = parseDockerProfileEnabledTools(profileOutput, serverName);
  const observed = new Set(observedTools);
  const missingSafeTools = expectedAllowlist.filter((tool) => !observed.has(tool));
  const unexpectedAbletonTools = observedTools.filter((tool) => tool.startsWith("ableton_") && !expected.has(tool));
  const unexpectedRiskyTools = observedTools.filter((tool) => risky.has(tool));

  return {
    ok: observedTools.length > 0
      && missingSafeTools.length === 0
      && unexpectedAbletonTools.length === 0
      && unexpectedRiskyTools.length === 0,
    serverName,
    expectedAllowedTools: expectedAllowlist.length,
    observedAllowedTools: observedTools.length,
    missingSafeTools,
    unexpectedAbletonTools,
    unexpectedRiskyTools,
    observedTools
  };
}

export function buildHypernimbusDockerProfilePlan(options: {
  profile?: string;
  catalogPath?: string;
  backupPath?: string;
} = {}): DockerProfilePlan {
  const profile = validateDockerProfileId(options.profile ?? HYPERNIMBUS_PROFILE_ID);
  const catalogPath = path.resolve(options.catalogPath ?? ABLETON_DOCKER_CATALOG);
  const backupPath = path.resolve(options.backupPath ?? path.join(LOCAL_PATHS.diagnostics, "runtime", "docker-mcp", `${profile}.before.yaml`));
  const catalogRef = toFileUri(catalogPath);
  const enableArgs = HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.flatMap((tool) => ["--enable", `ableton-mcp.${tool}`]);

  return {
    profile,
    catalogPath,
    catalogRef,
    endpoint: "http://127.0.0.1:17366/mcp",
    allowlist: HYPERNIMBUS_SAFE_TOOL_ALLOWLIST,
    commands: [
      {
        description: "Back up the Docker MCP profile before changing it.",
        command: "docker",
        args: ["mcp", "profile", "export", profile, backupPath]
      },
      {
        description: "Add or update Ableton MCP in the HyperNimbus Docker MCP profile.",
        command: "docker",
        args: ["mcp", "profile", "server", "add", profile, "--server", catalogRef]
      },
      {
        description: "Disable all Ableton MCP tools before applying the safe allowlist.",
        command: "docker",
        args: ["mcp", "profile", "tools", profile, "--disable-all", "ableton-mcp"]
      },
      {
        description: "Enable only read, planning, search, status, and diagnostics tools for HyperNimbus.",
        command: "docker",
        args: ["mcp", "profile", "tools", profile, ...enableArgs]
      },
      {
        description: "List servers in the profile for verification.",
        command: "docker",
        args: ["mcp", "profile", "server", "ls", "--filter", `profile=${profile}`]
      },
      {
        description: "Show enabled tools in the profile for verification.",
        command: "docker",
        args: ["mcp", "profile", "show", profile]
      }
    ]
  };
}
