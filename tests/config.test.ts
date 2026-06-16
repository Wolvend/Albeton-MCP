import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshConfig(): Promise<typeof import("../src/config.js")> {
  vi.resetModules();
  return import("../src/config.js");
}

describe("configurable sample library root", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("adds ABLETON_MCP_SAMPLE_LIBRARY_ROOT as an approved root", async () => {
    const sampleRoot = path.join(os.tmpdir(), "ableton-mcp-sample-library-test");
    vi.stubEnv("ABLETON_MCP_SAMPLE_LIBRARY_ROOT", sampleRoot);

    const config = await importFreshConfig();
    const roots = config.getAllowedRoots().map((root) => path.resolve(root.path).toLowerCase());

    expect(path.resolve(config.LOCAL_PATHS.staging)).toBe(path.resolve(sampleRoot));
    expect(roots).toContain(path.resolve(sampleRoot).toLowerCase());
  });

  it("does not let ABLETON_MCP_ALLOWED_ROOTS widen beyond approved roots", async () => {
    const broadRoot = path.parse(os.homedir()).root;
    vi.stubEnv("ABLETON_MCP_ALLOWED_ROOTS", broadRoot);

    const config = await importFreshConfig();
    const roots = config.getAllowedRoots().map((root) => path.resolve(root.path).toLowerCase());

    expect(roots).not.toContain(path.resolve(broadRoot).toLowerCase());
  });
});
