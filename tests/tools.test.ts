import { describe, expect, it } from "vitest";
import { registeredToolNames } from "../src/tools.js";

describe("tool catalog", () => {
  it("registers the requested production tool surface", () => {
    expect(registeredToolNames.length).toBeGreaterThanOrEqual(80);
    expect(registeredToolNames).toContain("ableton_get_environment");
    expect(registeredToolNames).toContain("ableton_control_mode_status");
    expect(registeredToolNames).toContain("ableton_bridge_status");
    expect(registeredToolNames).toContain("ableton_ui_driver_status");
    expect(registeredToolNames).toContain("ableton_ui_driver_ping");
    expect(registeredToolNames).toContain("ableton_mcp_get_client_connection_profiles");
    expect(registeredToolNames).toContain("ableton_mcp_run_path_security_test");
    expect(registeredToolNames).toContain("ableton_set_tempo");
    expect(registeredToolNames).toContain("ableton_search_freesound");
    expect(registeredToolNames).toContain("ableton_search_plugin_catalog");
    expect(registeredToolNames).toContain("ableton_download_plugin_package");
    expect(registeredToolNames).toContain("ableton_create_automation_envelope");
    expect(registeredToolNames).toContain("ableton_extract_automation_summary");
    expect(registeredToolNames).toContain("ableton_create_arrangement_marker");
    expect(registeredToolNames).toContain("ableton_quantize_clip");
    expect(registeredToolNames).toContain("ableton_plan_export_audio");
    expect(registeredToolNames).toContain("ableton_validate_plugin_package");
  });
});
