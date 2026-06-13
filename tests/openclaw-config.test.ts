import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";

describe("OpenClaw MCP client configuration", () => {
  it("documents OpenClaw as a localhost Streamable HTTP MCP consumer with safe tool filtering", async () => {
    const configPath = path.join(LOCAL_PATHS.projectRoot, "config", "openclaw-http.json");
    const clientDocs = await fs.readFile(path.join(LOCAL_PATHS.projectRoot, "docs", "CLIENTS.md"), "utf8");
    const dockerDocs = await fs.readFile(path.join(LOCAL_PATHS.projectRoot, "docs", "DOCKER_MCP_PROFILE.md"), "utf8");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));

    expect(config.mcp.servers["ableton-mcp"].url).toBe("http://127.0.0.1:17366/mcp");
    expect(config.mcp.servers["ableton-mcp"].transport).toBe("streamable-http");
    expect(`${clientDocs}\n${dockerDocs}`).toContain("openclaw mcp add ableton-mcp");
    expect(`${clientDocs}\n${dockerDocs}`).toContain("openclaw mcp tools ableton-mcp --include");
    expect(`${clientDocs}\n${dockerDocs}`).toContain("openclaw mcp doctor ableton-mcp --probe");
  });
});
