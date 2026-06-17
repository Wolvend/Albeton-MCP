import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";

describe("security documentation consistency", () => {
  it("does not advertise 16-character HTTP bearer tokens", async () => {
    const files = [
      "README.md",
      "docs/LAUNCH.md",
      "docs/CLIENTS.md",
      "docs/DOCKER_MCP.md",
      "docs/AGENT_INSTALLER.md",
      "src/tools.ts",
      "launch.ps1",
      "launch.sh"
    ];
    const combined = (await Promise.all(files.map(async (file) => {
      const content = await fs.readFile(path.join(LOCAL_PATHS.projectRoot, file), "utf8");
      return `${file}\n${content}`;
    }))).join("\n");

    expect(combined).not.toMatch(/at least 16|Minimum 16|16 random|minimum 16/i);
    expect(combined).toMatch(/at least 32|Minimum 32|32\+ random/i);
  });
});
