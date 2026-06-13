import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("Max for Live bridge source", () => {
  it("keeps the patch wired between node.script and LiveAPI js", async () => {
    const patchPath = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-bridge.maxpat");
    const patch = JSON.parse(await fs.readFile(patchPath, "utf8"));
    const boxes = patch.patcher.boxes.map((entry: any) => entry.box.text).filter(Boolean);
    expect(boxes).toContain("node.script ableton-mcp-http.js @autostart 1");
    expect(boxes).toContain("js ableton-mcp-liveapi.js");
    expect(patch.patcher.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("has syntax-valid bridge scripts", async () => {
    const httpScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-http.js");
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    await execFileAsync("C:\\Program Files\\nodejs\\node.exe", ["--check", httpScript], { timeout: 10_000 });
    await execFileAsync("C:\\Program Files\\nodejs\\node.exe", ["--check", liveApiScript], { timeout: 10_000 });
  });

  it("keeps Node for Max bridge scripts in CommonJS mode", async () => {
    const packagePath = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "package.json");
    const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
    expect(packageJson.type).toBe("commonjs");
  });

  it("documents implemented LiveAPI bridge actions in source", async () => {
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    const source = await fs.readFile(liveApiScript, "utf8");
    for (const action of [
      "list_return_tracks",
      "master_track",
      "track_mixer",
      "return_track_mixer",
      "list_clip_slots",
      "ableton_create_scene",
      "ableton_create_clip",
      "ableton_insert_midi_notes",
      "add_new_notes",
      "create_audio_clip",
      "ableton_load_preset_or_sample",
      "ableton_set_clip_gain",
      "ableton_transpose_clip",
      "ableton_set_clip_warp",
      "ableton_set_clip_markers",
      "unsupportedDeviceInsertion",
      "ableton_fire_clip",
      "ableton_stop_clip",
      "ableton_set_track_volume",
      "ableton_set_track_pan",
      "ableton_set_track_send",
      "ableton_set_return_track_volume",
      "ableton_set_return_track_pan",
      "ableton_set_device_parameter",
      "ableton_rename_clip",
      "arrangement_markers",
      "clip_notes",
      "clip_envelopes",
      "device_parameter_map",
      "ableton_create_automation_envelope",
      "ableton_set_automation_point",
      "ableton_simplify_automation",
      "ableton_create_arrangement_marker",
      "ableton_duplicate_scene",
      "ableton_duplicate_clip",
      "ableton_move_clip",
      "ableton_quantize_clip",
      "ableton_humanize_midi_clip"
    ]) {
      expect(source).toContain(action);
    }
  });
});
