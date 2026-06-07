import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import { resolveSafePath } from "../src/security.js";

describe("path allowlist", () => {
  it("allows project paths", async () => {
    const resolved = await resolveSafePath(LOCAL_PATHS.projectRoot, { mustExist: true });
    expect(resolved.real).toContain("ableton-mcp");
  });

  it("rejects forbidden broad roots and secret paths", async () => {
    await expect(resolveSafePath(path.parse(os.homedir()).root, { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath(os.homedir(), { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath(path.join(os.homedir(), ".ssh"), { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath(path.join(os.homedir(), "AppData", "Roaming"), { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
  });

  it("rejects symlink escapes when symlink creation is available", async () => {
    const link = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "escape-link");
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.rm(link, { force: true, recursive: true });
    try {
      await fs.symlink(os.homedir(), link, process.platform === "win32" ? "junction" : "dir");
      await expect(resolveSafePath(link, { mustExist: true })).rejects.toThrow(/Forbidden|outside/i);
    } finally {
      await fs.rm(link, { force: true, recursive: true });
    }
  });
});
