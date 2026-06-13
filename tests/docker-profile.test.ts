import { describe, expect, it } from "vitest";
import {
  buildHypernimbusDockerProfilePlan,
  HYPERNIMBUS_RISKY_TOOL_DENYLIST,
  HYPERNIMBUS_SAFE_TOOL_ALLOWLIST,
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

describe("HyperNimbus Docker MCP profile plan", () => {
  it("builds a localhost-only Ableton MCP activation plan", () => {
    const plan = buildHypernimbusDockerProfilePlan({
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

  it("keeps risky tools out of the HyperNimbus default allowlist", () => {
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_track");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_presets");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_reference_audio_intake");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_source_audio_transformation");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_plans");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_concept_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_arrangement_plans");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_arrangement_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_execution_journals");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_concept_execution_journal");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_search_concept_samples");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_curate_concept_samples");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_full_concept_production");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_preflight_concept_execution");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_create_concept_execution_approval_bundle");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_manifest");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_runbook");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_attribution_bundle");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_production_scorecard");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_device_automation_readiness");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_device_chain_spec");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_device_catalog_matches");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_device_ui_placement");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_execution_action_matrix");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_timeline");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_mix_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_automation_map");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_internet_archive_audio_files");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_return_track_mixer");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_bridge_capabilities");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_client_bootstrap_bundle");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_mcp_get_safe_tool_allowlist");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_agent_music_session");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_execute_concept_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_stage_concept_samples");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_download_sample");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_click_coordinates");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_tempo");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_volume");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_pan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_master_volume");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_master_pan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_fire_scene");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_tempo");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_time_signature");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_scene_color");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_track_color");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_return_track_color");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_rename_return_track");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_rename_scene");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_gain");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_transpose_clip");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_warp");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_markers");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).not.toContain("ableton_set_clip_color");
    expect(HYPERNIMBUS_RISKY_TOOL_DENYLIST).toContain("ableton_execute_concept_plan");
    expect(HYPERNIMBUS_RISKY_TOOL_DENYLIST).toContain("ableton_stage_concept_samples");
    expect(HYPERNIMBUS_RISKY_TOOL_DENYLIST).toContain("ableton_click_coordinates");
  });

  it("validates profile ids and file uri generation", () => {
    expect(validateDockerProfileId("hypernimbus")).toBe("hypernimbus");
    expect(() => validateDockerProfileId("../hypernimbus")).toThrow(/profile names/);
    expect(toFileUri("C:/tmp/catalog.yaml")).toBe("file://C:/tmp/catalog.yaml");
  });

  it("parses only the enabled tool block for Ableton MCP profile exports", () => {
    const profile = exportedProfileFor([
      "ableton_find_installation",
      "ableton_mcp_get_safe_tool_allowlist"
    ]);

    expect(parseDockerProfileEnabledTools(profile)).toEqual([
      "ableton_find_installation",
      "ableton_mcp_get_safe_tool_allowlist"
    ]);
  });

  it("verifies the exact safe allowlist and rejects risky drift", () => {
    const validProfile = exportedProfileFor(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST);
    expect(verifyDockerProfileToolAllowlist(validProfile)).toMatchObject({
      ok: true,
      expectedAllowedTools: HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.length,
      observedAllowedTools: HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.length,
      missingSafeTools: [],
      unexpectedAbletonTools: [],
      unexpectedRiskyTools: []
    });

    const missingTool = HYPERNIMBUS_SAFE_TOOL_ALLOWLIST[0]!;
    const unsafeProfile = exportedProfileFor([
      ...HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.filter((tool) => tool !== missingTool),
      "ableton_execute_concept_plan"
    ]);
    const verification = verifyDockerProfileToolAllowlist(unsafeProfile);

    expect(verification.ok).toBe(false);
    expect(verification.missingSafeTools).toContain(missingTool);
    expect(verification.unexpectedAbletonTools).toContain("ableton_execute_concept_plan");
    expect(verification.unexpectedRiskyTools).toContain("ableton_execute_concept_plan");
  });
});
