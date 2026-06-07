import { describe, expect, it } from "vitest";
import { assertAllowedPluginUrl } from "../src/network.js";
import { planPluginDownload, pluginInstallInstructions, searchPluginCatalog } from "../src/plugins.js";

describe("plugin/package downloader policy", () => {
  it("searches curated plugin catalog metadata without downloads", () => {
    const results = searchPluginCatalog("ableton");
    expect(results.count).toBeGreaterThan(0);
    expect(results.results[0]?.download).toBeNull();
  });

  it("allows only approved HTTPS plugin/package hosts", () => {
    expect(assertAllowedPluginUrl("https://www.ableton.com/packs/")).toContain("ableton.com");
    expect(assertAllowedPluginUrl("https://github.com/example/project/releases/download/v1/device.amxd")).toContain("github.com");
    expect(() => assertAllowedPluginUrl("http://www.ableton.com/packs/")).toThrow(/HTTPS/i);
    expect(() => assertAllowedPluginUrl("https://example.com/plugin.zip")).toThrow(/not approved/i);
    expect(() => assertAllowedPluginUrl("https://127.0.0.1/plugin.zip")).toThrow(/Private|local|IP/i);
  });

  it("plans staging-only plugin downloads and blocks MCP installation", () => {
    const plan = planPluginDownload({
      url: "https://www.ableton.com/packs/",
      destinationName: "plugin.msi",
      catalogId: "ableton-official-packs"
    });
    expect(plan.classification.executableLike).toBe(true);
    expect(plan.classification.installAllowedByMcp).toBe(false);

    const instructions = pluginInstallInstructions("plugin.msi");
    expect(instructions.blockedByMcp).toBe(true);
  });
});
