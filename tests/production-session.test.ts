import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import {
  advanceProductionSession,
  createExecutionPlan,
  createProductionSession,
  designSignatureSoundPalette,
  generateSongBlueprint,
  getProductionSession,
  listProductionSessions,
  prepareProductionAssets,
  produceTrackFromBrief,
  reviewRenderAndRevise,
  scoreTrackProfessionalism
} from "../src/production-session.js";
import { getToolPacks } from "../src/tool-packs.js";
import { registeredToolNames } from "../src/tools.js";

const fixtureAudio = path.join(LOCAL_PATHS.diagnostics, "runtime", "production-session-test", "tone.wav");

function makeSilentWav() {
  const sampleRate = 44100;
  const durationSeconds = 0.2;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

describe("producer workflow facade", () => {
  beforeAll(async () => {
    await fs.mkdir(path.dirname(fixtureAudio), { recursive: true });
    await fs.writeFile(fixtureAudio, makeSilentWav());
  });

  it("creates and advances a bounded production session without Ableton writes", async () => {
    const created = await createProductionSession({
      brief: "test facade dark liminal mall cue with memorable glass motif",
      style: "dreamcore vaporwave",
      target_duration_seconds: 120,
      intensity: 7,
      usage_mode: "private_experiment",
      source_policy: "local_only",
      check_bridge: false
    });
    const sessionId = created.session.id;

    expect(sessionId).toMatch(/^prod-[a-f0-9]{16}$/);
    expect(created.session.safety.writesEnabled).toBe(false);
    expect(created.nextRecommendedCalls.map((call) => call.name)).toContain("ableton_generate_song_blueprint");

    const blueprint = await generateSongBlueprint({ session_id: sessionId });
    const palette = await designSignatureSoundPalette({ session_id: sessionId });
    const assets = await prepareProductionAssets({ session_id: sessionId });
    const execution = await createExecutionPlan({ session_id: sessionId, check_bridge: false });
    const score = await scoreTrackProfessionalism({ session_id: sessionId });

    expect(blueprint.blueprint.conceptPlan).toHaveProperty("id");
    expect(palette.soundPalette).toHaveProperty("layerPatches");
    expect((palette.soundPalette as any).varietyPlan.deviceFamilies.length).toBeGreaterThanOrEqual(3);
    expect((palette.soundPalette as any).varietyPlan.antiSamenessRules.length).toBeGreaterThanOrEqual(4);
    expect(assets.assetPlan).toHaveProperty("downloadGate");
    expect(execution.executionPlan).toHaveProperty("dryRunOnly", true);
    expect(score.professionalism).toHaveProperty("planningScore");

    const stored = await getProductionSession(sessionId);
    expect(stored.session.conceptPlanId).toMatch(/^concept-[a-f0-9]{16}$/);
    expect(stored.session.arrangementId).toMatch(/^arrangement-[a-f0-9]{16}$/);

    const listed = await listProductionSessions({ page: 1, pageSize: 10 });
    expect(listed.items.map((item: any) => item.id)).toContain(sessionId);
  }, 20_000);

  it("stores render review and focused revision facts for allowed local audio", async () => {
    const created = await createProductionSession({
      brief: "test facade render review cue",
      style: "liminal",
      target_duration_seconds: 90,
      intensity: 6
    });
    const sessionId = created.session.id;
    const review = await reviewRenderAndRevise({
      session_id: sessionId,
      render_path: fixtureAudio,
      stem_paths: [fixtureAudio],
      duration_seconds: 0.1
    });
    const advanced = await advanceProductionSession({
      session_id: sessionId,
      phase: "revision",
      max_internal_steps: 2,
      dry_run: true
    });

    expect(review.review).toHaveProperty("quality");
    expect(review.nextRecommendedCalls.map((call) => call.name)).toContain("ableton_score_track_professionalism");
    expect(advanced.safe_to_execute).toBe(true);
    expect(advanced.artifacts).toHaveLength(1);
  }, 20_000);

  it("runs the one-call producer facade as dry-run orchestration", async () => {
    const produced = await produceTrackFromBrief({
      brief: "procedural-only glass mall cue with a sad memorable motif",
      style: "dark vaporwave",
      source_policy: "procedural_only",
      target_duration_seconds: 90,
      intensity: 6,
      max_internal_steps: 5,
      dry_run: true
    });

    expect(produced.session_id).toMatch(/^prod-[a-f0-9]{16}$/);
    expect(produced.dry_run).toBe(true);
    expect(produced.needs_index).toBe(false);
    expect(produced.sampleSearchPlan).toMatchObject({ skipped: true });
    expect(produced.executionPlanSummary).toBeTruthy();
    expect(JSON.stringify(produced.safety)).toContain("ABLETON_MCP_ENABLE_WRITE=1");
    expect(produced.exactNextToolCalls.map((call: any) => call.name)).toContain("ableton_execute_concept_plan");
  });

  it("reports smaller tool packs without unsafe defaults", () => {
    const packs = getToolPacks(registeredToolNames);
    const minimal = packs.find((pack) => pack.id === "minimal_producer");
    const immersive = packs.find((pack) => pack.id === "immersive_producer");
    const debug = packs.find((pack) => pack.id === "developer_debug");

    expect(minimal?.tools).toContain("ableton_create_production_session");
    expect(minimal?.tools).toContain("ableton_produce_track_from_brief");
    expect(minimal?.tools).toContain("ableton_review_render_and_revise");
    expect(minimal?.tools).not.toContain("ableton_begin_concept_device_ui_session");
    expect(minimal?.tools).not.toContain("ableton_download_sample");
    expect(immersive?.tools).toContain("ableton_list_free_sample_sources");
    expect(immersive?.tools).toContain("ableton_build_sample_intelligence_index");
    expect(immersive?.tools).toContain("ableton_plan_sample_chop_map");
    expect(immersive?.tools).toContain("ableton_design_sampler_instrument");
    expect(immersive?.tools).toContain("ableton_generate_harmonic_palette");
    expect(immersive?.toolCount).toBeGreaterThan(minimal?.toolCount ?? 0);
    expect(debug?.toolCount).toBe(registeredToolNames.length);
  });

  it("rejects invalid production session ids", async () => {
    await expect(getProductionSession("not-a-session")).rejects.toMatchObject({ code: "PRODUCTION_SESSION_ID_INVALID" });
  });
});
