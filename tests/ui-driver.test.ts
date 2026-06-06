import { describe, expect, it } from "vitest";
import { getUiDriverRuntimeState, uiDriverAction } from "../src/ui-driver.js";

describe("Ableton UI driver contract", () => {
  it("reports a ChromeDriver-style loopback driver endpoint", () => {
    const state = getUiDriverRuntimeState();
    expect(state.host).toBe("127.0.0.1");
    expect(state.port).toBe(17365);
    expect(state.endpoint).toBe("/ableton-ui-driver");
    expect(state.protocol).toBe("ableton-ui-driver-v1");
    expect(state.serialized).toBe(true);
  });

  it("rejects unsafe UI action identifiers before network I/O", async () => {
    await expect(uiDriverAction("click;unsafe")).rejects.toThrow(/allowlist/i);
  });
});
