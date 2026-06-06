import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRuntimeReport } from "./runtime.js";
import { environmentSnapshot } from "./environment.js";
import { getScanStatus } from "./scanner.js";

function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [{
      uri,
      mimeType: "application/json",
      text: JSON.stringify(payload, null, 2)
    }]
  };
}

export function registerResources(server: McpServer) {
  server.registerResource("ableton-environment", "ableton://environment", {
    title: "Ableton MCP Environment",
    description: "Redacted environment, flags, and allowed roots.",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, await environmentSnapshot()));

  server.registerResource("ableton-runtime", "ableton://runtime", {
    title: "Ableton MCP Runtime",
    description: "FastMCP-inspired middleware limits and per-tool metrics.",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, getRuntimeReport()));

  server.registerResource("ableton-scan-status", "ableton://scan-status", {
    title: "Ableton MCP Scan Status",
    description: "Current or last offline library scan status.",
    mimeType: "application/json"
  }, async (uri) => jsonResource(uri.href, getScanStatus()));
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt("ableton-safe-production-session", {
    title: "Safe Ableton Production Session",
    description: "Plan a session using read-only inspection first, then gated writes.",
    argsSchema: {
      brief: z.string().min(1).describe("Production goal, genre, or session intent.")
    }
  }, ({ brief }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `Create an Ableton production plan for: ${brief}`,
          "Use read-only MCP tools first.",
          "Do not use Ableton write, UI control, or downloads unless the matching feature gate is enabled.",
          "Prefer legal local or clearly licensed samples and include attribution requirements."
        ].join("\n")
      }
    }]
  }));

  server.registerPrompt("ableton-security-review", {
    title: "Ableton MCP Security Review",
    description: "Review a proposed Ableton MCP operation for safety before execution.",
    argsSchema: {
      operation: z.string().min(1).describe("The tool call or workflow to review.")
    }
  }, ({ operation }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Review this Ableton MCP operation for security and safety:",
          operation,
          "Check path allowlists, write/download/UI gates, sample licensing, network hosts, and rollback steps."
        ].join("\n")
      }
    }]
  }));
}
