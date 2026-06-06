import { describe, expect, it } from "vitest";
import { LOCAL_PATHS, PROJECT_ROOT } from "../src/config.js";

describe("project root detection", () => {
  it("points at the repository root, not dist", () => {
    expect(PROJECT_ROOT.endsWith("ableton-mcp")).toBe(true);
    expect(PROJECT_ROOT.endsWith("dist")).toBe(false);
    expect(LOCAL_PATHS.projectRoot).toBe(PROJECT_ROOT);
  });
});
