import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContractSweepCalls } from "../scripts/tool-contract-sweep.js";
import { registeredToolNames } from "../src/tools.js";

const fixtures = {
  dir: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test"),
  setPath: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test", "minimal.als"),
  textPath: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test", "note.txt"),
  audioPath: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test", "tone.wav"),
  stagedAudioPath: path.join(process.cwd(), "samples", "staging", "contract-sweep-tone.wav"),
  convertedAudioPath: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test", "converted.wav"),
  pluginPath: path.join(process.cwd(), "diagnostics", "runtime", "tool-contract-sweep-test", "plugin.zip")
};

describe("all-tool contract sweep", () => {
  it("has exactly one safe call spec for every registered tool", () => {
    const calls = buildContractSweepCalls(fixtures);
    const callNames = calls.map((call) => call.name);

    expect(callNames).toHaveLength(registeredToolNames.length);
    expect(new Set(callNames).size).toBe(callNames.length);
    expect([...callNames].sort()).toEqual([...registeredToolNames].sort());
  });

  it("does not request real writes in contract arguments", () => {
    const serializedCalls = JSON.stringify(buildContractSweepCalls(fixtures));

    expect(serializedCalls).not.toContain("\"dry_run\":false");
  });
});
