import { describe, expect, it } from "vitest";
import { getAllowedRoots, LOCAL_PATHS, PROJECT_ROOT } from "../src/config.js";

describe("project root detection", () => {
  it("points at the repository root, not dist", () => {
    expect(PROJECT_ROOT.endsWith("ableton-mcp")).toBe(true);
    expect(PROJECT_ROOT.endsWith("dist")).toBe(false);
    expect(LOCAL_PATHS.projectRoot).toBe(PROJECT_ROOT);
  });

  it("does not let ABLETON_MCP_ALLOWED_ROOTS widen the baseline allowlist", () => {
    const previous = process.env.ABLETON_MCP_ALLOWED_ROOTS;
    process.env.ABLETON_MCP_ALLOWED_ROOTS = "C:\\;C:\\Users\\LIZ;C:\\Users\\LIZ\\Desktop\\MCP\\ableton-mcp";
    try {
      const roots = getAllowedRoots().map((root) => root.path.toLowerCase());
      expect(roots.some((root) => root === "c:\\")).toBe(false);
      expect(roots.some((root) => root === "c:\\users\\liz")).toBe(false);
      expect(roots.some((root) => root.endsWith("ableton-mcp"))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ABLETON_MCP_ALLOWED_ROOTS;
      else process.env.ABLETON_MCP_ALLOWED_ROOTS = previous;
    }
  });
});
