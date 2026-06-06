import { describe, expect, it } from "vitest";
import { normalizeLicense } from "../src/samples.js";

describe("sample license policy", () => {
  it("allows CC0/public domain/CC BY and rejects unclear commercial rights", () => {
    expect(normalizeLicense("CC0").allowed).toBe(true);
    expect(normalizeLicense("Creative Commons Attribution 4.0").allowed).toBe(true);
    expect(normalizeLicense("Public Domain Mark").allowed).toBe(true);
    expect(normalizeLicense("All Rights Reserved").allowed).toBe(false);
  });
});
