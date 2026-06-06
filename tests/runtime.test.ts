import { describe, expect, it } from "vitest";
import { getRuntimeReport, runTool, type RuntimeTool } from "../src/runtime.js";

describe("FastMCP-inspired runtime middleware", () => {
  it("adds timing and cache metadata for read-only idempotent tools", async () => {
    let calls = 0;
    const tool: RuntimeTool = {
      name: "test_cacheable_tool",
      description: "cacheable test",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async () => {
        calls += 1;
        return { ok: true, calls };
      }
    };
    const first = await runTool(tool, { key: "same" });
    const second = await runTool(tool, { key: "same" });
    expect((first.structuredContent as any).runtime.cached).toBe(false);
    expect((second.structuredContent as any).runtime.cached).toBe(true);
    expect(calls).toBe(1);
    expect(getRuntimeReport().tools.test_cacheable_tool?.calls).toBeGreaterThanOrEqual(2);
  });
});
