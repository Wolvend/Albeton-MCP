import fs from "node:fs/promises";
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
    await expect(resolveSafePath("C:\\", { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath("C:\\Users\\LIZ", { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath("C:\\Users\\LIZ\\.ssh", { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
    await expect(resolveSafePath("C:\\Users\\LIZ\\AppData\\Roaming", { mustExist: false })).rejects.toThrow(/Forbidden|outside/i);
  });

  it("rejects symlink escapes when symlink creation is available", async () => {
    const link = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "escape-link");
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.rm(link, { force: true, recursive: true });
    try {
      await fs.symlink("C:\\Users\\LIZ", link, "junction");
      await expect(resolveSafePath(link, { mustExist: true })).rejects.toThrow(/Forbidden|outside/i);
    } finally {
      await fs.rm(link, { force: true, recursive: true });
    }
  });
});
