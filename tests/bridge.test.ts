import { describe, expect, it } from "vitest";
import { bridgeAction } from "../src/bridge.js";

describe("bridge mock contract", () => {
  it("uses request id plus action payload shape", () => {
    const request = { id: crypto.randomUUID(), action: "ping", payload: {} };
    expect(request.id).toMatch(/[0-9a-f-]{36}/);
    expect(request.action).toBe("ping");
  });

  it("rejects user-derived bridge action suffixes before network I/O", async () => {
    await expect(bridgeAction("list_devices:selected;unsafe")).rejects.toThrow(/allowlist/i);
  });
});
