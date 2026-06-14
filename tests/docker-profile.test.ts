import { describe, expect, it } from "vitest";
import {
  buildDockerMcpProfilePlan,
  DOCKER_MCP_RISKY_TOOL_DENYLIST,
  DOCKER_MCP_SAFE_TOOL_ALLOWLIST,
  parseDockerProfileEnabledTools,
  toFileUri,
  validateDockerProfileId,
  verifyDockerProfileToolAllowlist
} from "../src/docker-profile.js";

function exportedProfileFor(tools: readonly string[]) {
  return [
    "servers:",
    "    - type: remote",
    "      secrets: default",
    "      tools:",
    ...tools.map((tool) => `        - ${tool}`),
    "      endpoint: http://127.0.0.1:17366/mcp",
    "      snapshot:",
    "        server:",
    "            name: ableton-mcp",
    "            type: remote",
    "            tools:",
    "                - name: ableton_execute_concept_plan",
    "                  description: Snapshot docs should not count as enabled tools."
  ].join("\n");
}

describe("Docker MCP profile plan", () => {
  it("builds a localhost-only Ableton MCP activation plan", () => {
    const plan = buildDockerMcpProfilePlan({
      profile: "hypernimbus",
      catalogPath: "C:/Users/LIZ/Desktop/MCP/ableton-mcp/docker/ableton-mcp.catalog.yaml",
      backupPath: "C:/Users/LIZ/Desktop/MCP/ableton-mcp/diagnostics/runtime/docker-mcp/hypernimbus.before.yaml"
    });

    expect(plan.profile).toBe("hypernimbus");
    expect(plan.endpoint).toBe("http://127.0.0.1:17366/mcp");
    expect(plan.catalogRef).toBe("file://C:/Users/LIZ/Desktop/MCP/ableton-mcp/docker/ableton-mcp.catalog.yaml");
    expect(plan.commands.map((command) => command.args.join(" "))).toEqual(expect.arrayContaining([
      expect.stringContaining("profile export hypernimbus"),
      expect.stringContaining("profile server add hypernimbus"),
      expect.stringContaining("profile tools hypernimbus --disable-all ableton-mcp")
    ]));
  });

  it("keeps risky tools out of the Docker MCP default allowlist", () => {
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_track");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_presets");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_reference_audio_intake");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_source_audio_transformation");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_plans");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_concept_plan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_arrangement_plans");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_arrangement_plan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_execution_journals");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_concept_execution_journal");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_search_concept_samples");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_curate_concept_samples");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_full_concept_production");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_preflight_concept_execution");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_create_concept_execution_approval_bundle");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_manifest");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_runbook");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_attribution_bundle");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_production_scorecard");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_device_automation_readiness");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_device_chain_spec");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_device_catalog_matches");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_device_ui_placement");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_action_matrix");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_timeline");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_mix_plan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_automation_map");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_free_sample_sources");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_search_free_sample_sources");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_internet_archive_audio_files");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_analyze_sample_musical_features");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_detect_key_bpm_confidence");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_find_best_loop_points");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_match_samples_to_concept");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_return_track_mixer");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_bridge_capabilities");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_bridge_setup_status");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_client_bootstrap_bundle");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_safe_tool_allowlist");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_objective_readiness_report");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_launch_readiness_audit");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_agent_music_session");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_execute_concept_plan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_begin_concept_device_ui_session");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_stage_concept_samples");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_plan_free_sample_download");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_download_sample");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_click_coordinates");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_tempo");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_volume");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_pan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_master_volume");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_master_pan");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_fire_scene");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_tempo");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_time_signature");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_color");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_track_color");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_color");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_rename_return_track");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_rename_scene");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_gain");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_transpose_clip");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_warp");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_markers");
    expect(DOCKER_MCP_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_color");
    expect(DOCKER_MCP_RISKY_TOOL_DENYLIST).toContain("ableton_execute_concept_plan");
    expect(DOCKER_MCP_RISKY_TOOL_DENYLIST).toContain("ableton_begin_concept_device_ui_session");
    expect(DOCKER_MCP_RISKY_TOOL_DENYLIST).toContain("ableton_stage_concept_samples");
    expect(DOCKER_MCP_RISKY_TOOL_DENYLIST).toContain("ableton_plan_free_sample_download");
    expect(DOCKER_MCP_RISKY_TOOL_DENYLIST).toContain("ableton_click_coordinates");
  });

  it("validates profile ids and file uri generation", () => {
    expect(validateDockerProfileId("hypernimbus")).toBe("hypernimbus");
    expect(() => validateDockerProfileId("../hypernimbus")).toThrow(/profile names/);
    expect(toFileUri("C:/tmp/catalog.yaml")).toBe("file://C:/tmp/catalog.yaml");
  });

  it("parses only the enabled tool block for Ableton MCP profile exports", () => {
    const profile = exportedProfileFor([
      "ableton_find_installation",
      "ableton_mcp_get_objective_readiness_report",
      "ableton_mcp_get_launch_readiness_audit",
      "ableton_mcp_get_safe_tool_allowlist"
    ]);

    expect(parseDockerProfileEnabledTools(profile)).toEqual([
      "ableton_find_installation",
      "ableton_mcp_get_objective_readiness_report",
      "ableton_mcp_get_launch_readiness_audit",
      "ableton_mcp_get_safe_tool_allowlist"
    ]);
  });

  it("verifies the exact safe allowlist and rejects risky drift", () => {
    const validProfile = exportedProfileFor(DOCKER_MCP_SAFE_TOOL_ALLOWLIST);
    expect(verifyDockerProfileToolAllowlist(validProfile)).toMatchObject({
      ok: true,
      expectedAllowedTools: DOCKER_MCP_SAFE_TOOL_ALLOWLIST.length,
      observedAllowedTools: DOCKER_MCP_SAFE_TOOL_ALLOWLIST.length,
      missingSafeTools: [],
      unexpectedAbletonTools: [],
      unexpectedRiskyTools: []
    });

    const missingTool = DOCKER_MCP_SAFE_TOOL_ALLOWLIST[0]!;
    const unsafeProfile = exportedProfileFor([
      ...DOCKER_MCP_SAFE_TOOL_ALLOWLIST.filter((tool) => tool !== missingTool),
      "ableton_execute_concept_plan"
    ]);
    const verification = verifyDockerProfileToolAllowlist(unsafeProfile);

    expect(verification.ok).toBe(false);
    expect(verification.missingSafeTools).toContain(missingTool);
    expect(verification.unexpectedAbletonTools).toContain("ableton_execute_concept_plan");
    expect(verification.unexpectedRiskyTools).toContain("ableton_execute_concept_plan");
  });
});
