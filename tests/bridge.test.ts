import { describe, expect, it } from "vitest";
import { bridgeAction, getBridgeCapabilityMatrix, getBridgeRuntimeState } from "../src/bridge.js";

describe("bridge mock contract", () => {
  it("uses request id plus action payload shape", () => {
    const request = { id: crypto.randomUUID(), action: "ping", payload: {} };
    expect(request.id).toMatch(/[0-9a-f-]{36}/);
    expect(request.action).toBe("ping");
  });

  it("rejects user-derived bridge action suffixes before network I/O", async () => {
    await expect(bridgeAction("list_devices:selected;unsafe")).rejects.toThrow(/allowlist/i);
  });

  it("reports serialized bridge queue state", () => {
    const state = getBridgeRuntimeState();
    expect(state.host).toBe("127.0.0.1");
    expect(state.serialized).toBe(true);
    expect(state.queueTimeoutMs).toBeGreaterThan(0);
  });

  it("reports the static bridge capability matrix for safe client planning", () => {
    const matrix = getBridgeCapabilityMatrix();
    expect(matrix.summary.read_only).toBeGreaterThan(0);
    expect(matrix.summary.write_gated).toBeGreaterThan(0);
    expect(matrix.summary.unsupported).toBeGreaterThan(0);
    expect(matrix.actions).toContainEqual(expect.objectContaining({
      action: "ableton_load_preset_or_sample",
      status: "write_gated"
    }));
    expect(matrix.actions).toContainEqual(expect.objectContaining({
      action: "automation_summary",
      status: "read_only"
    }));
    expect(matrix.actions).toContainEqual(expect.objectContaining({
      action: "ableton_insert_effect",
      status: "unsupported"
    }));
  });
});
