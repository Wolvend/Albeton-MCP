import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts, registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

export function createAbletonMcpServer() {
  const server = new McpServer({
    name: "ableton-mcp",
    version: "0.1.0"
  });

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
