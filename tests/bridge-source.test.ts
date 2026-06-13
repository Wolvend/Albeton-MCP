import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("Max for Live bridge source", () => {
  function functionSource(source: string, name: string) {
    const start = source.indexOf(`function ${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = source.indexOf("\nfunction ", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  }

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
    await execFileAsync(process.execPath, ["--check", httpScript], { timeout: 10_000 });
    await execFileAsync(process.execPath, ["--check", liveApiScript], { timeout: 10_000 });
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
      "bridge_capabilities",
      "bridgeCapabilities",
      "master_track",
      "track_mixer",
      "routing_overview",
      "return_track_mixer",
      "list_clip_slots",
      "ableton_create_scene",
      "ableton_fire_scene",
      "ableton_set_scene_tempo",
      "ableton_set_scene_time_signature",
      "ableton_set_scene_color",
      "ableton_create_clip",
      "ableton_insert_midi_notes",
      "add_new_notes",
      "remove_notes_extended",
      "create_audio_clip",
      "ableton_load_preset_or_sample",
      "ableton_set_clip_gain",
      "ableton_transpose_clip",
      "ableton_set_clip_warp",
      "ableton_set_clip_markers",
      "ableton_set_clip_color",
      "unsupportedDeviceInsertion",
      "ableton_fire_clip",
      "ableton_stop_clip",
      "ableton_set_track_volume",
      "ableton_set_track_pan",
      "ableton_set_track_send",
      "summarizeSends",
      "send_matrix",
      "return_track_name",
      "send_index \" + sendIndex + \" is out of range",
      "ableton_set_track_color",
      "ableton_set_return_track_color",
      "ableton_set_return_track_volume",
      "ableton_set_return_track_pan",
      "ableton_set_master_volume",
      "ableton_set_master_pan",
      "ableton_set_device_parameter",
      "ableton_rename_return_track",
      "ableton_rename_scene",
      "ableton_rename_clip",
      "browserDeviceTree",
      "browser_device_tree",
      "live_app browser",
      "arrangement_markers",
      "clip_notes",
      "clip_envelopes",
      "device_parameter_map",
      "automationSummary",
      "automation_summary",
      "automation_breakpoint_writes",
      "current_value_write_tool",
      "ableton_create_automation_envelope",
      "ableton_set_automation_point",
      "ableton_simplify_automation",
      "ableton_create_arrangement_marker",
      "ableton_duplicate_scene",
      "ableton_duplicate_clip",
      "ableton_move_clip",
      "ableton_quantize_clip",
      "ableton_humanize_midi_clip",
      "humanizeMidiNotes",
      "nextSeededRandom"
    ]) {
      expect(source).toContain(action);
    }
  });

  it("supports conservative MIDI note replacement before insertion", async () => {
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    const source = await fs.readFile(liveApiScript, "utf8");
    const insertSource = functionSource(source, "insertMidiNotes");
    const readIndex = source.indexOf("get_notes_extended");
    const removeIndex = source.indexOf("remove_notes_extended");
    const addIndex = insertSource.indexOf("add_new_notes");

    expect(source).toContain("function readExistingMidiNotes");
    expect(source).toContain("function removeExistingMidiNotes");
    expect(insertSource).toContain("replace_existing");
    expect(insertSource).toContain("removeExistingMidiNotes");
    expect(insertSource).toContain("restoreExistingMidiNotes");
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(removeIndex).toBeGreaterThan(readIndex);
    expect(addIndex).toBeGreaterThan(insertSource.indexOf("removeExistingMidiNotes"));
  });

  it("supports conservative seeded MIDI humanization through note rewrite primitives", async () => {
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    const source = await fs.readFile(liveApiScript, "utf8");
    const humanizeSource = functionSource(source, "humanizeMidiClip");
    const removeIndex = humanizeSource.indexOf("removeExistingMidiNotes");
    const addIndex = humanizeSource.indexOf("add_new_notes");

    expect(source).toContain("function humanizeMidiNotes");
    expect(source).toContain("function nextSeededRandom");
    expect(humanizeSource).toContain("readExistingMidiNotes");
    expect(humanizeSource).toContain("humanizeMidiNotes");
    expect(humanizeSource).toContain("removeExistingMidiNotes");
    expect(humanizeSource).toContain("restoreExistingMidiNotes");
    expect(removeIndex).toBeGreaterThan(humanizeSource.indexOf("humanizeMidiNotes"));
    expect(addIndex).toBeGreaterThan(removeIndex);
  });

  it("reads clip notes through the modern bounded pitch/time argument order", async () => {
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    const source = await fs.readFile(liveApiScript, "utf8");
    const clipNotesSource = functionSource(source, "getClipNotes");

    expect(clipNotesSource).toContain("\"get_notes_extended\", [0, 128, 0, timeSpan]");
    expect(clipNotesSource).toContain("\"get_notes\", [0, 0, timeSpan, 128]");
    expect(clipNotesSource).toContain("time_span");
  });

  it("uses typed track indexes for targeted read/write bridge actions", async () => {
    const liveApiScript = path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live", "ableton-mcp-liveapi.js");
    const source = await fs.readFile(liveApiScript, "utf8");

    for (const name of ["listDevices", "listClipSlots", "getTrackMixer", "setTrackBoolean", "renameTrack"]) {
      expect(functionSource(source, name)).toContain("parseTrackIndex(payload)");
    }
  });
});
