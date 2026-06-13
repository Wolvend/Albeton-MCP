import { describe, expect, it } from "vitest";
import {
  generateDrumRackPlan,
  generateSessionPlan,
  suggestEffectChain,
  suggestInstrumentChain,
  suggestMixActions,
  validateProductionPlan
} from "../src/composition.js";

describe("composition helpers", () => {
  it("generates a structured liminal session plan with safe next calls", () => {
    const plan = generateSessionPlan({
      brief: "a backrooms hallway where a memory song decays under fluorescent lights",
      style: "liminal/backrooms/horror",
      target_duration_seconds: 180,
      intensity: 8
    });

    expect(plan).toMatchObject({
      preset: "liminal_backrooms_horror",
      tempo: expect.any(Number),
      key: "C minor",
      safety: {
        writesAbleton: false,
        downloads: false,
        uiControl: false
      }
    });
    expect(plan.sections.map((section) => section.name)).toEqual([
      "Isolation",
      "Recognizable Motif",
      "Decay Loop",
      "Spatial Collapse",
      "Unresolved Tail"
    ]);
    expect(plan.tracks.map((track) => track.name)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Sparse Motif"
    ]));
    expect(plan.exactNextToolCalls.map((call) => call.name)).toEqual(expect.arrayContaining([
      "ableton_plan_concept_track",
      "ableton_generate_midi_clip_plan",
      "ableton_suggest_mix_actions"
    ]));
  });

  it("generates horror percussion and device-chain plans without side effects", () => {
    const drumRack = generateDrumRackPlan({
      style: "liminal/backrooms/horror",
      concept: "empty hallway impacts and fluorescent ticks",
      bars: 8,
      intensity: 7
    });
    const instrument = suggestInstrumentChain({
      role: "damaged memory motif",
      style: "liminal/backrooms/horror",
      intensity: 7
    });
    const effects = suggestEffectChain({
      source: "degraded hallway piano",
      style: "liminal/backrooms/horror",
      intensity: 7
    });

    expect(drumRack.pads.some((pad) => pad.name === "Sub Pulse")).toBe(true);
    expect(drumRack.exactNextToolCalls.some((call) => call.name === "ableton_search_internet_archive_audio")).toBe(true);
    expect(instrument.devices.map((device) => device.device)).toEqual(expect.arrayContaining(["Wavetable", "Hybrid Reverb"]));
    expect(instrument.exactNextToolCalls.some((call) => call.name === "ableton_insert_instrument")).toBe(true);
    expect(effects.devices.map((device) => device.device)).toEqual(expect.arrayContaining(["Auto Filter", "Echo", "Hybrid Reverb"]));
    expect(effects.exactNextToolCalls.some((call) => call.name === "ableton_extract_automation_summary")).toBe(true);
    expect(effects.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false });
  });

  it("suggests mix probes and flags unsafe production plan patterns", () => {
    const mix = suggestMixActions({
      issue: "muddy low mids and too much reverb on the memory motif",
      context: "backrooms horror cue",
      intensity: 8
    });
    const validation = validateProductionPlan({
      actions: ["ableton_set_track_volume", "download sample"],
      deployment: "public internet on 0.0.0.0",
      shell: "powershell"
    });

    expect(mix.actions.map((action) => action.action)).toEqual(expect.arrayContaining([
      "Check low-end ownership",
      "Separate dry identity from shared space",
      "Protect the motif window"
    ]));
    expect(mix.exactNextToolCalls.map((call) => call.name)).toContain("ableton_get_routing_overview");
    expect(validation.requiresWrite).toBe(true);
    expect(validation.triggeredGates.map((gate) => gate.id)).toEqual(expect.arrayContaining([
      "ableton_writes",
      "downloads",
      "remote_http",
      "arbitrary_shell"
    ]));
    expect(validation.safeByDefault).toBe(false);
  });
});
