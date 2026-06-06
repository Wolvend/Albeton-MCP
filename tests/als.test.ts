import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import { analyzeAbletonSet } from "../src/analysis.js";

const gzip = promisify(zlib.gzip);

describe("als parser", () => {
  it("handles a gzipped XML fixture without modifying it", async () => {
    const file = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "fixture.als");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, await gzip(`<Ableton><LiveSet><Tracks><AudioTrack></AudioTrack><MidiTrack></MidiTrack></Tracks><Scenes><Scene></Scene></Scenes><Clip></Clip><Manual Value="128"/></LiveSet></Ableton>`));
    const before = await fs.stat(file);
    const analysis = await analyzeAbletonSet(file);
    const after = await fs.stat(file);
    expect(analysis.summary.tracks).toBe(2);
    expect(analysis.summary.scenes).toBe(1);
    expect(analysis.summary.tempo).toBe("128");
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
