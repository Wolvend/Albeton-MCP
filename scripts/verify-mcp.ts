import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/src/index.js"]
});

const client = new Client({ name: "ableton-mcp-verifier", version: "0.1.0" });
await client.connect(transport);

const requestTimeout = Number(process.env.ABLETON_MCP_VERIFY_TIMEOUT_MS ?? "180000");
const requestOptions = {
  timeout: Number.isFinite(requestTimeout) && requestTimeout >= 60_000 ? requestTimeout : 180_000
};

const tools = await client.listTools(undefined, requestOptions);
const resources = await client.listResources(undefined, requestOptions);
const prompts = await client.listPrompts(undefined, requestOptions);
const pathSecurity = await client.callTool({ name: "ableton_mcp_run_path_security_test", arguments: {} }, undefined, requestOptions);
const runtimeReport = await client.callTool({ name: "ableton_mcp_get_runtime_report", arguments: {} }, undefined, requestOptions);
const securityReport = await client.callTool({ name: "ableton_mcp_security_report", arguments: {} }, undefined, requestOptions);
const bridgeMock = await client.callTool({ name: "ableton_mcp_run_bridge_mock_test", arguments: {} }, undefined, requestOptions);
const sampleSearch = await client.callTool({
  name: "ableton_search_internet_archive_audio",
  arguments: { query: "piano", page: 1, pageSize: 1 }
}, undefined, requestOptions);

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
