import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAgentMusicDryRunToolPlan,
  defaultAgentMusicDryRunOptions,
  parseAgentMusicDryRunArgs
} from "../scripts/agent-music-dry-run.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("agent music dry-run workflow", () => {
  it("is exposed through package scripts and launchers", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const launchPs1 = fs.readFileSync(path.join(projectRoot, "launch.ps1"), "utf8");
    const launchSh = fs.readFileSync(path.join(projectRoot, "launch.sh"), "utf8");

    expect(packageJson.scripts["demo:concept"]).toBe("node dist/scripts/agent-music-dry-run.js");
    expect(launchPs1).toContain('"concept-demo"');
    expect(launchPs1).toContain("npm.cmd run demo:concept");
    expect(launchSh).toContain("concept-demo)");
    expect(launchSh).toContain("npm run demo:concept");
  });

  it("plans a safe MCP-consumer sequence without real writes, downloads, or UI control", () => {
    const plan = buildAgentMusicDryRunToolPlan(defaultAgentMusicDryRunOptions);
    const names = plan.map((step) => step.name);
    const serialized = JSON.stringify(plan);

    expect(names).toEqual([
      "ableton_mcp_get_objective_readiness_report",
      "ableton_mcp_get_launch_readiness_audit",
      "ableton_get_production_readiness",
      "ableton_plan_agent_music_session",
      "ableton_plan_concept_track",
      "ableton_curate_concept_samples",
      "ableton_build_layered_arrangement_plan",
      "ableton_render_concept_execution_action_matrix",
      "ableton_render_concept_execution_manifest",
      "ableton_render_concept_execution_runbook",
      "ableton_render_concept_mix_plan",
      "ableton_render_concept_automation_map",
      "ableton_render_concept_device_chain_spec",
      "ableton_render_concept_device_catalog_matches",
      "ableton_plan_concept_device_ui_placement",
      "ableton_render_concept_production_scorecard",
      "ableton_preflight_concept_execution",
      "ableton_create_concept_execution_approval_bundle",
      "ableton_execute_concept_plan",
      "ableton_render_delivery_plan"
    ]);
    expect(serialized).toContain('"dry_run":true');
    expect(serialized).toContain('"check_bridge":false');
    expect(serialized).not.toContain('"dry_run":false');
    expect(names).not.toContain("ableton_stage_concept_samples");
    expect(names).not.toContain("ableton_download_sample");
    expect(names).not.toContain("ableton_click_coordinates");
  });

  it("parses bounded CLI options with safe defaults", () => {
    const parsed = parseAgentMusicDryRunArgs([
      "--concept",
      "distant mall music under fluorescent buzz",
      "--duration",
      "9999",
      "--intensity",
      "12",
      "--client=openclaw",
      "--sources=local_library,internet_archive,invalid",
      "--search-samples"
    ]);

    expect(parsed.concept).toBe("distant mall music under fluorescent buzz");
    expect(parsed.target_duration_seconds).toBe(900);
    expect(parsed.intensity).toBe(10);
    expect(parsed.client).toBe("openclaw");
    expect(parsed.sources).toEqual(["local_library", "internet_archive"]);
    expect(parsed.search_samples).toBe(true);
  });
});
