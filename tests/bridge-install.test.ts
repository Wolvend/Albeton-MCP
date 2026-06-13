import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBridgeInstallPlan, getBridgeInstallStatus, installBridgeFiles } from "../src/bridge-install.js";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("bridge installer", () => {
  it("plans required companion files", async () => {
    const plan = await getBridgeInstallPlan({ dryRun: true });
    expect(plan.missingSources).toEqual([]);
    expect(plan.files.map((file) => file.fileName)).toEqual([
      "Ableton MCP Bridge.amxd",
      "ableton-mcp-http.js",
      "ableton-mcp-liveapi.js",
      "ableton-mcp-status.js",
      "package.json"
    ]);
  });

  it("copies bridge companion files to a target directory", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ableton-bridge-install-"));
    const result = await installBridgeFiles({ dryRun: false, targetDir: tempDir });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    for (const fileName of ["Ableton MCP Bridge.amxd", "ableton-mcp-http.js", "ableton-mcp-liveapi.js", "ableton-mcp-status.js", "package.json"]) {
      await expect(fs.stat(path.join(tempDir, fileName))).resolves.toBeTruthy();
    }
  });

  it("reports missing, stale, and current bridge install status with file hashes", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ableton-bridge-status-"));
    const before = await getBridgeInstallStatus({ targetDir: tempDir });

    expect(before.ready).toBe(false);
    expect(before.status).toBe("not_installed");
    expect(before.missingTargets).toContain("ableton-mcp-liveapi.js");

    await installBridgeFiles({ dryRun: false, targetDir: tempDir });
    const after = await getBridgeInstallStatus({ targetDir: tempDir });

    expect(after.ready).toBe(true);
    expect(after.status).toBe("installed_current");
    expect(after.missingTargets).toEqual([]);
    expect(after.mismatchedTargets).toEqual([]);
    expect(after.files.every((file) => file.sourceMatchesTarget)).toBe(true);
    expect(after.files.find((file) => file.fileName === "ableton-mcp-liveapi.js")?.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
