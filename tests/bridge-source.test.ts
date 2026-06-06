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
});
