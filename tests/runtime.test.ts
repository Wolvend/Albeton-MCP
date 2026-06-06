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

  it("rejects oversized tool arguments before handler execution", async () => {
    let called = false;
    const tool: RuntimeTool = {
      name: "test_argument_limit_tool",
      description: "argument limit test",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async () => {
        called = true;
        return { ok: true };
      }
    };
    const result = await runTool(tool, { payload: "x".repeat(70_000) });
    expect((result as any).isError).toBe(true);
    expect((result.structuredContent as any).code).toBe("ARGUMENTS_TOO_LARGE");
    expect(called).toBe(false);
  });
});
