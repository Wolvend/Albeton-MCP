import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  analyzeRenderQuality,
  compileMoodPalette,
  generateMotifSystem,
  parseMusicBrief,
  scoreHookMemorability,
  scoreMixBalance
} from "../src/producer-brain.js";
import {
  checkReleaseSourceReadiness,
  createSourceManifest
} from "../src/source-usage.js";
import { LOCAL_PATHS } from "../src/config.js";

const fixtureAudio = path.join(process.cwd(), "diagnostics", "runtime", "producer-brain-test", "tone.wav");

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

describe("producer brain tools", () => {
  beforeAll(async () => {
    await fs.mkdir(path.dirname(fixtureAudio), { recursive: true });
    await fs.writeFile(fixtureAudio, makeSilentWav());
  });

  it("parses a brief into concrete production decisions", () => {
    const parsed = parseMusicBrief({
      concept: "sad dark dreamcore mall memory, no bright EDM drops",
      style: "liminal vaporwave",
      target_duration_seconds: 180,
      intensity: 7
    });

    expect(parsed.moodTags).toEqual(expect.arrayContaining(["sad", "dreamy"]));
    expect(parsed.avoidList.join(" ")).toMatch(/bright EDM drops/i);
    expect(parsed.inferredTempo.default).toBeGreaterThanOrEqual(45);
    expect(parsed.nextToolCalls.map((call) => call.name)).toContain("ableton_compile_mood_palette");
  });

  it("creates palette and motif plans without Ableton writes", () => {
    const palette = compileMoodPalette({ concept: "haunted liminal vaporwave mall", intensity: 8 });
    const motif = generateMotifSystem({ concept: "haunted liminal vaporwave mall", key: "C# minor", bpm: 72, length_beats: 8 });
    const score = scoreHookMemorability({ motif: motif.motif.map((note) => note.pitch), concept: "haunted liminal vaporwave mall" });

    expect(palette.forbiddenPalette).toContain("cheesy preset leads");
    expect(motif.transformations.map((item) => item.name)).toContain("missing_notes");
    expect(score.score).toBeGreaterThan(50);
  });

  it("allows unverified sources in private experiment manifests while marking release review needed", async () => {
    const manifest = await createSourceManifest({
      project_name: "private-test",
      usage_mode: "private_experiment",
      sources: [{ title: "scratch sample", role: "texture" }],
      dry_run: true
    });

    const summary = manifest.manifest.summary;
    expect(manifest.dry_run).toBe(true);
    expect(summary.privateExperimentUsable).toBe(true);
    expect(summary.releaseReady).toBe(false);
    expect(summary.byStatus.unverified).toBe(1);
  });

  it("reports release blockers from a written manifest", async () => {
    const manifest = await createSourceManifest({
      project_name: `release-test-${Date.now()}`,
      usage_mode: "release_candidate",
      sources: [{ title: "unknown loop", role: "hook", status: "unverified" }],
      dry_run: false
    });
    const output = String(manifest.output).replace("%USERPROFILE%", process.env.USERPROFILE ?? "");
    const readiness = await checkReleaseSourceReadiness({ manifest_path: output, usage_mode: "release_candidate" });

    expect(readiness.canContinuePrivateExperiment).toBe(true);
    expect(readiness.releaseReady).toBe(false);
    expect(readiness.blockers).toHaveLength(1);
  });

  it("handles missing render files with structured path errors", async () => {
    await expect(analyzeRenderQuality({
      path: path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "missing-render.wav"),
      concept: "missing file"
    })).rejects.toMatchObject({ code: "PATH_NOT_FOUND" });
  });

  it("analyzes real fixture audio for render quality and mix balance", async () => {
    const quality = await analyzeRenderQuality({ path: fixtureAudio, concept: "fixture tone", duration_seconds: 0.1 });
    const balance = await scoreMixBalance({ path: fixtureAudio, concept: "fixture tone", duration_seconds: 0.1 });

    expect(quality.scores.technical).toBeGreaterThanOrEqual(0);
    expect(quality.analysis.lufs).toHaveProperty("method", "ffmpeg ebur128");
    expect(balance.balanceReport.spectrum).toHaveProperty("method");
  });
});
