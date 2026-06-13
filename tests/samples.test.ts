import { describe, expect, it } from "vitest";
import { buildSampleAttribution, normalizeLicense } from "../src/samples.js";

describe("sample license policy", () => {
  it("allows CC0/public domain/CC BY and rejects unclear commercial rights", () => {
    expect(normalizeLicense("CC0").allowed).toBe(true);
    expect(normalizeLicense("Creative Commons Attribution 4.0").allowed).toBe(true);
    expect(normalizeLicense("Public Domain Mark").allowed).toBe(true);
    expect(normalizeLicense("All Rights Reserved").allowed).toBe(false);
  });

  it("builds provenance records with source, license, checksum, and original metadata", () => {
    const attribution = buildSampleAttribution({
      sourceUrl: "https://archive.org/download/example/example.wav",
      destinationName: "example.wav",
      checksum: "abc123",
      bytes: 42,
      metadata: {
        license: "CC0",
        creator: "Archive Creator",
        title: "Room Tone",
        identifier: "example"
      }
    });

    expect(attribution.sourceUrl).toBe("https://archive.org/download/example/example.wav");
    expect(attribution.licensePolicy.allowed).toBe(true);
    expect(attribution.checksum).toBe("abc123");
    expect(attribution.bytes).toBe(42);
    expect(attribution.creator).toBe("Archive Creator");
    expect(attribution.metadata).toMatchObject({ identifier: "example" });
  });
});
