import { describe, expect, it } from "vitest";

describe("bridge mock contract", () => {
  it("uses request id plus action payload shape", () => {
    const request = { id: crypto.randomUUID(), action: "ping", payload: {} };
    expect(request.id).toMatch(/[0-9a-f-]{36}/);
    expect(request.action).toBe("ping");
  });
});
