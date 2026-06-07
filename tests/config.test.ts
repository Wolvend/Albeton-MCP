import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { getAllowedRoots, LOCAL_PATHS, PROJECT_ROOT } from "../src/config.js";

describe("project root detection", () => {
  it("points at the repository root, not dist", () => {
    expect(PROJECT_ROOT.endsWith("ableton-mcp")).toBe(true);
    expect(PROJECT_ROOT.endsWith("dist")).toBe(false);
    expect(LOCAL_PATHS.projectRoot).toBe(PROJECT_ROOT);
  });

  it("does not let ABLETON_MCP_ALLOWED_ROOTS widen the baseline allowlist", () => {
    const previous = process.env.ABLETON_MCP_ALLOWED_ROOTS;
    const root = path.parse(os.homedir()).root;
    process.env.ABLETON_MCP_ALLOWED_ROOTS = [root, os.homedir(), LOCAL_PATHS.projectRoot].join(";");
    try {
      const roots = getAllowedRoots().map((root) => root.path.toLowerCase());
      expect(roots.some((candidate) => candidate === path.resolve(root).toLowerCase())).toBe(false);
      expect(roots.some((candidate) => candidate === path.resolve(os.homedir()).toLowerCase())).toBe(false);
      expect(roots.some((root) => root.endsWith("ableton-mcp"))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ABLETON_MCP_ALLOWED_ROOTS;
      else process.env.ABLETON_MCP_ALLOWED_ROOTS = previous;
    }
  });
});
