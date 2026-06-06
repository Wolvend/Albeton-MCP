import { describe, expect, it } from "vitest";
import { assertAllowedSampleUrl, readJsonBounded } from "../src/network.js";

describe("network sample URL policy", () => {
  it("allows approved HTTPS sample source hosts", () => {
    expect(assertAllowedSampleUrl("https://archive.org/download/example/file.wav")).toContain("archive.org");
    expect(assertAllowedSampleUrl("https://cdn.freesound.org/previews/1/2.wav")).toContain("freesound.org");
  });

  it("rejects arbitrary, local, credentialed, and non-HTTPS URLs", () => {
    expect(() => assertAllowedSampleUrl("http://archive.org/download/example/file.wav")).toThrow(/HTTPS/i);
    expect(() => assertAllowedSampleUrl("https://example.com/file.wav")).toThrow(/not approved/i);
    expect(() => assertAllowedSampleUrl("https://127.0.0.1/file.wav")).toThrow(/Private|local|IP/i);
    expect(() => assertAllowedSampleUrl("https://user:pass@archive.org/file.wav")).toThrow(/credentials/i);
  });

  it("rejects oversized remote JSON responses", async () => {
    const response = new Response(JSON.stringify({ payload: "x".repeat(128) }));
    await expect(readJsonBounded(response, 32)).rejects.toThrow(/size limit/i);
  });
});
