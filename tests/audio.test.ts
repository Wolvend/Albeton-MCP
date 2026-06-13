import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { analyzeAudioFile, convertAudioFile } from "../src/analysis.js";
import { LOCAL_PATHS, TOOL_PATHS } from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("audio metadata", () => {
  it("reads ffprobe metadata for a generated fixture", async () => {
    const file = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "tone.wav");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.rm(file, { force: true });
    await execFileAsync(TOOL_PATHS.ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", file], { timeout: 15_000 });
    const result = await analyzeAudioFile(file);
    expect(result.ffprobe.format.duration).toBeDefined();
  });

  it("converts approved local audio into staging without overwriting", async () => {
    const input = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "tone-convert.wav");
    const output = path.join(LOCAL_PATHS.staging, "tone-converted-liminal.wav");
    await fs.mkdir(path.dirname(input), { recursive: true });
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    await fs.rm(input, { force: true });
    await fs.rm(output, { force: true });
    await fs.rm(`${output}.attribution.json`, { force: true });
    await execFileAsync(TOOL_PATHS.ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=0.2", input], { timeout: 15_000 });

    const dryRun = await convertAudioFile({
      input,
      output,
      format: "wav",
      preset: "liminal_memory",
      duration_seconds: 0.1,
      dry_run: true
    });
    expect(dryRun.dry_run).toBe(true);
    expect(dryRun.conversion.output).not.toContain(LOCAL_PATHS.staging);
    await expect(fs.access(output)).rejects.toThrow();

    const converted = await convertAudioFile({
      input,
      output,
      format: "wav",
      preset: "liminal_memory",
      duration_seconds: 0.1,
      dry_run: false
    });
    expect(converted.dry_run).toBe(false);
    expect("checksum" in converted.conversion ? converted.conversion.checksum : "").toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.access(`${output}.attribution.json`)).resolves.toBeUndefined();
    await expect(convertAudioFile({
      input,
      output,
      format: "wav",
      preset: "clean",
      dry_run: false
    })).rejects.toThrow(/already exists/i);
  });

  it("rejects conversion output outside sample staging or imports", async () => {
    const input = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "tone.wav");
    const output = path.join(LOCAL_PATHS.projectRoot, "diagnostics", "runtime", "not-approved-output.wav");
    await fs.mkdir(path.dirname(input), { recursive: true });
    await execFileAsync(TOOL_PATHS.ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=0.1", input], { timeout: 15_000 });
    await expect(convertAudioFile({
      input,
      output,
      format: "wav",
      preset: "clean",
      dry_run: true
    })).rejects.toThrow(/sample staging|Codex Imports/i);
  });
});
