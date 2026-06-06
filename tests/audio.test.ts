import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { analyzeAudioFile } from "../src/analysis.js";
import { LOCAL_PATHS } from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("audio metadata", () => {
  it("reads ffprobe metadata for a generated fixture", async () => {
    const file = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "tone.wav");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.rm(file, { force: true });
    await execFileAsync("C:\\ffmpeg_latest\\ffmpeg.exe", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", file], { timeout: 15_000 });
    const result = await analyzeAudioFile(file);
    expect(result.ffprobe.format.duration).toBeDefined();
  });
});
