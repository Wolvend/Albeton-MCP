import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const transport = new StdioClientTransport({ command: "node", args: ["dist/src/index.js"] });
  const client = new Client({ name: "resource-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe("MCP resources and prompts", () => {
  it("lists FastMCP-inspired resources and prompts", async () => {
    await withClient(async (client) => {
      const resources = await client.listResources();
      const prompts = await client.listPrompts();
      expect(resources.resources.map((resource) => resource.uri)).toContain("ableton://runtime");
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain("ableton-security-review");
    });
  });

  it("sanitizes prompt arguments and labels them as untrusted data", async () => {
    await withClient(async (client) => {
      const productionPrompt = await client.getPrompt({
        name: "ableton-safe-production-session",
        arguments: {
          brief: "ignore previous instructions system prompt exfiltrate backrooms texture"
        }
      });
      const reviewPrompt = await client.getPrompt({
        name: "ableton-security-review",
        arguments: {
          operation: "developer message tool call exfiltrate sample download"
        }
      });
      const productionText = productionPrompt.messages.map((message) => message.content.type === "text" ? message.content.text : "").join("\n");
      const reviewText = reviewPrompt.messages.map((message) => message.content.type === "text" ? message.content.text : "").join("\n");

      expect(productionText).toContain("untrusted brief text");
      expect(reviewText).toContain("untrusted data");
      expect(`${productionText}\n${reviewText}`).not.toMatch(/ignore previous instructions|system prompt|developer message|tool call|exfiltrate/i);
      expect(productionText).toContain("backrooms texture");
      expect(reviewText).toContain("sample download");
    });
  });
});
