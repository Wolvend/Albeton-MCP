import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/src/index.js"]
});

const client = new Client({ name: "ableton-mcp-verifier", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
const resources = await client.listResources();
const prompts = await client.listPrompts();
const pathSecurity = await client.callTool({ name: "ableton_mcp_run_path_security_test", arguments: {} });
const runtimeReport = await client.callTool({ name: "ableton_mcp_get_runtime_report", arguments: {} });
const securityReport = await client.callTool({ name: "ableton_mcp_security_report", arguments: {} });
const bridgeMock = await client.callTool({ name: "ableton_mcp_run_bridge_mock_test", arguments: {} });
const sampleSearch = await client.callTool({
  name: "ableton_search_internet_archive_audio",
  arguments: { query: "piano", page: 1, pageSize: 1 }
});

await client.close();

console.log(JSON.stringify({
  ok: true,
  toolCount: tools.tools.length,
  resourceCount: resources.resources.length,
  promptCount: prompts.prompts.length,
  pathSecurity,
  runtimeReport,
  securityReport,
  bridgeMock,
  sampleSearch
}, null, 2));
