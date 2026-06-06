import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

describe("MCP resources and prompts", () => {
  it("lists FastMCP-inspired resources and prompts", async () => {
    const transport = new StdioClientTransport({ command: "node", args: ["dist/src/index.js"] });
    const client = new Client({ name: "resource-test", version: "0.1.0" });
    await client.connect(transport);
    try {
      const resources = await client.listResources();
      const prompts = await client.listPrompts();
      expect(resources.resources.map((resource) => resource.uri)).toContain("ableton://runtime");
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain("ableton-security-review");
    } finally {
      await client.close();
    }
  });
});
