import { describe, expect, it } from "vitest";
import {
  buildHypernimbusDockerProfilePlan,
  HYPERNIMBUS_SAFE_TOOL_ALLOWLIST,
  toFileUri,
  validateDockerProfileId
} from "../src/docker-profile.js";

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
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_concept_plans");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_concept_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_arrangement_plans");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_arrangement_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_search_concept_samples");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_full_concept_production");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_preflight_concept_execution");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_create_concept_execution_approval_bundle");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_plan_concept_device_automation_readiness");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_timeline");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_render_concept_mix_plan");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_list_internet_archive_audio_files");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_return_track_mixer");
    expect(HYPERNIMBUS_SAFE_TOOL_ALLOWLIST).toContain("ableton_get_bridge_capabilities");
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
  });

  it("validates profile ids and file uri generation", () => {
    expect(validateDockerProfileId("hypernimbus")).toBe("hypernimbus");
    expect(() => validateDockerProfileId("../hypernimbus")).toThrow(/profile names/);
    expect(toFileUri("C:/tmp/catalog.yaml")).toBe("file://C:/tmp/catalog.yaml");
  });
});
