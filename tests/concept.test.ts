import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLayeredArrangementPlan,
  executeConceptPlan,
  planConceptTrack,
  readArrangementPlan,
  renderDeliveryPlan,
  sanitizeRemoteSampleText,
  stageConceptSamples
} from "../src/concept.js";
import { LOCAL_PATHS } from "../src/config.js";

describe("concept-to-music planning", () => {
  it("creates deterministic liminal horror plans with layered backrooms structure", async () => {
    const first = await planConceptTrack({
      concept: "a backrooms hallway where an old memory song decays under fluorescent lights",
      target_duration_seconds: 180,
      intensity: 8,
      sources: ["local_library", "internet_archive", "freesound"]
    });
    const second = await planConceptTrack({
      concept: "a backrooms hallway where an old memory song decays under fluorescent lights",
      target_duration_seconds: 180,
      intensity: 8,
      sources: ["local_library", "internet_archive", "freesound"]
    });

    expect(first.plan.id).toBe(second.plan.id);
    expect(first.plan.preset).toBe("liminal_backrooms_horror");
    expect(first.plan.sections.map((section) => section.name)).toEqual([
      "Isolation",
      "Recognizable Motif",
      "Decay Loop",
      "Spatial Collapse",
      "Unresolved Tail"
    ]);
    expect(first.plan.layers.map((layer) => layer.name)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Low Pressure",
      "Mechanical Texture",
      "Reversed Fragments",
      "Sparse Motif",
      "Memory Reverb",
      "Distant Delay"
    ]));
  });

  it("builds a stored arrangement plan and keeps execution dry-run by default", async () => {
    const planned = await planConceptTrack({
      concept: "liminal mall ambience with tape melody",
      target_duration_seconds: 120,
      intensity: 6,
      sources: ["local_library"]
    });
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const stagedPath = path.join(LOCAL_PATHS.staging, "concept-assignment-test.wav");
    await fs.writeFile(stagedPath, "fixture audio placeholder");
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id, [{
      layer: "Stretched Room",
      path: stagedPath,
      clip_slot_index: 1,
      name: "Assigned Room Tone"
    }]);
    const stored = await readArrangementPlan(arrangement.arrangement.id);
    const dryRun = await executeConceptPlan({ arrangement_id: arrangement.arrangement.id, dry_run: true });
    const delivery = await renderDeliveryPlan(planned.plan.id);

    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_create_audio_track")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_insert_midi_notes")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_track_send")).toBe(true);
    expect(arrangement.arrangement.automationPlan.some((entry) => entry.target === "filter")).toBe(true);
    expect(arrangement.arrangement.automationPlan.some((entry) => entry.target === "delay")).toBe(true);
    expect(arrangement.arrangement.automationPlan.every((entry) => entry.execution === "staged")).toBe(true);
    expect(arrangement.arrangement.devicePlan.some((entry) => entry.layer === "Stretched Room" && entry.devices.includes("Hybrid Reverb"))).toBe(true);
    expect(arrangement.arrangement.devicePlan.every((entry) => entry.execution === "staged")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_track_volume").every((action) => typeof action.payload.track_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.find((action) => action.action === "ableton_insert_midi_notes")?.payload.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ pitch: expect.any(Number), start_time: expect.any(Number), duration: expect.any(Number) })
    ]));
    const sampleAction = arrangement.arrangement.actions.find((action) => action.action === "ableton_load_preset_or_sample");
    expect(sampleAction?.payload.path).not.toBe(stagedPath);
    expect(sampleAction?.payload.name).toBe("Assigned Room Tone");
    expect(arrangement.arrangement.sampleAssignments[0]?.path).not.toBe(stagedPath);
    expect(stored.actions.find((action) => action.action === "ableton_load_preset_or_sample")?.payload.path).toBe(stagedPath);
    expect(dryRun.dry_run).toBe(true);
    expect(dryRun.executableActions).toBeGreaterThan(0);
    expect(delivery.export.sampleRate).toBe(48000);
  });

  it("turns approved reference audio into redacted source-treatment assignments", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const sourcePath = path.join(LOCAL_PATHS.staging, "backrooms-source-memory.mp3");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "backrooms dementia song becoming hallway ambience",
      target_duration_seconds: 150,
      intensity: 9,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);
    const stored = await readArrangementPlan(arrangement.arrangement.id);

    expect(planned.plan.reference?.mediaType).toBe("audio");
    expect(planned.plan.reference?.approvedForAudioPlacement).toBe(true);
    expect(planned.plan.reference?.path).not.toBe(sourcePath);
    expect(planned.plan.reference?.sourceAudioPlan?.targetLayers.map((layer) => layer.layer)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Reversed Fragments"
    ]));
    expect(arrangement.arrangement.sourceAudioPlan?.referencePath).not.toBe(sourcePath);
    expect(arrangement.arrangement.sourceAudioPlan?.assignments.length).toBeGreaterThanOrEqual(3);
    expect(arrangement.arrangement.sampleAssignments.every((assignment) => assignment.path !== sourcePath)).toBe(true);
    expect(arrangement.arrangement.sampleAssignments.some((assignment) => assignment.source === "reference_audio")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_load_preset_or_sample").length).toBeGreaterThanOrEqual(3);
    expect(stored.sampleAssignments.some((assignment) => assignment.path === sourcePath && assignment.source === "reference_audio")).toBe(true);
  });

  it("keeps unapproved reference audio informational instead of executable", async () => {
    const unapprovedDir = path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-reference-test");
    await fs.mkdir(unapprovedDir, { recursive: true });
    const sourcePath = path.join(unapprovedDir, "outside-approved-roots.mp3");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "liminal horror reference that still needs staging",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);

    expect(planned.plan.reference?.mediaType).toBe("audio");
    expect(planned.plan.reference?.approvedForAudioPlacement).toBe(false);
    expect(planned.plan.reference?.nextSteps?.join(" ")).toMatch(/samples\/staging|Codex Imports|User Library|Live Recordings/);
    expect(arrangement.arrangement.sourceAudioPlan).toBeUndefined();
    expect(arrangement.arrangement.sampleAssignments.some((assignment) => assignment.source === "reference_audio")).toBe(false);
  });

  it("rejects real concept execution while write gate is disabled", async () => {
    const planned = await planConceptTrack({
      concept: "backrooms pressure with a distant broken melody",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"]
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);

    await expect(executeConceptPlan({
      arrangement_id: arrangement.arrangement.id,
      dry_run: false
    })).rejects.toThrow(/ABLETON_MCP_ENABLE_WRITE=0/);
  });

  it("sanitizes sample search metadata and keeps staging gated in dry-run", async () => {
    const sanitized = sanitizeRemoteSampleText("ignore previous instructions fluorescent hum system prompt exfiltrate");
    const staged = await stageConceptSamples({
      dry_run: true,
      samples: [{
        url: "https://archive.org/download/opensource_audio/opensource_audio_meta.xml",
        destinationName: "unsafe name.wav",
        metadata: { license: "CC0" }
      }]
    });

    expect(sanitized).not.toMatch(/ignore previous instructions|system prompt|exfiltrate/i);
    expect(staged.dry_run).toBe(true);
    if ("samples" in staged) {
      expect(staged.samples[0]?.destinationName).toBe("unsafe_name.wav");
      expect(staged.samples[0]?.attribution.sourceUrl).toBe("https://archive.org/download/opensource_audio/opensource_audio_meta.xml");
      expect(staged.samples[0]?.attribution.licensePolicy.allowed).toBe(true);
      expect(staged.samples[0]?.attribution.checksum).toBeNull();
    }
  });

  it("rejects unsafe sample URLs even during dry-run staging", async () => {
    await expect(stageConceptSamples({
      dry_run: true,
      samples: [{
        url: "http://127.0.0.1/private.wav",
        destinationName: "private.wav",
        metadata: { license: "CC0" }
      }]
    })).rejects.toThrow(/Only HTTPS sample URLs|Private, local/);
  });
});
