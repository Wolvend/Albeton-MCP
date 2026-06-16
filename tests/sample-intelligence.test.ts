import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS, TOOL_PATHS } from "../src/config.js";
import {
  buildSampleIntelligenceIndex,
  getSampleIntelligenceItem,
  planSampleChopMap,
  searchSampleIntelligence
} from "../src/sample-intelligence.js";

const execFileAsync = promisify(execFile);

async function writeTone(filePath: string, frequency: number, duration = 0.15) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.rm(filePath, { force: true });
  await execFileAsync(TOOL_PATHS.ffmpeg, ["-y", "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${duration}`, filePath], { timeout: 15_000 });
}

describe("sample intelligence index", () => {
  it("builds a bounded redacted index, skips generated render folders, searches, and plans chops", async () => {
    const root = path.join(LOCAL_PATHS.sampleLibraryRoot, "sample-intelligence-fixture");
    const pad = path.join(root, "pack-a", "unique_blue_pad_loop.wav");
    const knock = path.join(root, "pack-b", "unique_metal_knock.wav");
    const skipped = path.join(root, "renders", "skip_me_pad.wav");
    await fs.rm(root, { recursive: true, force: true });
    await writeTone(pad, 330, 0.2);
    await writeTone(knock, 110, 0.2);
    await writeTone(skipped, 220, 0.2);

    const built = await buildSampleIntelligenceIndex({ root, limit: 10, analyze_audio: true });
    expect(built).toMatchObject({ running: false, indexed: 2, truncated: false });
    expect(JSON.stringify(built)).toContain("%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%");

    const search = await searchSampleIntelligence({ query: "unique_blue_pad", roles: ["pad"], page: 1, pageSize: 5 });
    expect(search.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(search.items)).not.toContain(LOCAL_PATHS.sampleLibraryRoot);
    expect(JSON.stringify(search.items)).toContain("%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%");
    expect(search.items.some((item: any) => item.name === "skip_me_pad.wav")).toBe(false);

    const item = await getSampleIntelligenceItem((search.items[0] as any).id);
    expect(item.roles).toContain("pad");
    expect(item.durationSeconds).toBeGreaterThan(0);

    const chop = await planSampleChopMap({ sample_id: item.id, target_bpm: 80, bars: 1, slice_count: 4, role: "pad" });
    expect(chop.dryRun).toBe(true);
    expect(chop.slices).toHaveLength(1);
    expect(chop.safety).toMatchObject({ writes: false, downloads: false, uiMouse: false });
  }, 20_000);

  it("rejects roots outside the configured sample library", async () => {
    await expect(buildSampleIntelligenceIndex({ root: LOCAL_PATHS.projectRoot, limit: 1, analyze_audio: false }))
      .rejects.toThrow(/configured sample-library root/i);
  });
});
