import { describe, expect, it } from "vitest";
import { getUiDriverRuntimeState, uiDriverAction } from "../src/ui-driver.js";
import { getSafeUiActions, planSafeUiActionSequence } from "../scripts/ui-safe-actions.js";

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

describe("safe Ableton UI actions", () => {
  it("lists reviewed named actions with stable ids", () => {
    const actions = getSafeUiActions();
    expect(actions.map((action) => action.id)).toEqual([
      "focus_window",
      "capture_screenshot",
      "capture_browser_region",
      "capture_detail_region"
    ]);
    expect(actions.every((action) => action.coordinateSpace === "ableton_window")).toBe(true);
  });

  it("plans only allowlisted named action sequences", () => {
    const plan = planSafeUiActionSequence(["focus_window", "capture_screenshot"]);
    expect(plan.ok).toBe(true);
    expect(plan.actions.map((action) => action.id)).toEqual(["focus_window", "capture_screenshot"]);
    expect(plan.dry_run).toBe(true);
  });

  it("rejects unknown named action ids before execution", () => {
    expect(() => planSafeUiActionSequence(["unsafe_action"])).toThrow(/Unknown safe UI action/);
  });
});
